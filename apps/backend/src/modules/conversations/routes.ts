import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { pool } from "../../db";
import * as repo from "./repository";
import * as voterProfileRepo from "../voter-profiles/repository";
import {
  upsertMessageSchema,
  classifyConversationSchema,
  requestClassifySchema,
  listConversationsSchema,
} from "./schemas";

// ═══════════════════════════════════════════════════════════════════════
// CONVERSATIONS MODULE
//
// Tracks per-contact WhatsApp conversations with:
//   - Atomic message ingestion (no duplicates, no race conditions)
//   - Owner assignment (first operator to message wins)
//   - AI classification with Gemini (full conversation context)
//   - Link to form_validations when phone is resolved
//
// Called by the Chrome extension on every sent/received message.
// ═══════════════════════════════════════════════════════════════════════

type AuthenticatedRequest = {
  userId: string;
  userRole: string;
  campaignIds: string[];
  fullName?: string;
  email?: string;
};

// ── Gemini config (reuses same model as AI module) ───────────────────
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CONVERSATION_SYSTEM_PROMPT = `Eres un clasificador de conversaciones de WhatsApp para campañas políticas en Perú.
Analiza la conversación completa entre el Operador (brigadista digital de campaña) y el Votante.
Clasifica al VOTANTE (no al operador) en EXACTAMENTE una categoría basándote en todas sus respuestas.

Categorías (vote_class / status):
- duro/respondido: apoyo genuino, militantes, coordinadores, voluntarios organizados, sector salud apoyando, piden material de campaña
- blando/respondido: apoyo condicionado a obras, deportes, infraestructura, promesas
- flotante/respondido: consultas, indecisos, interés sin compromiso claro
- invalido: piden dinero/Yape/trabajo/publicidad pagada, spam, insultos, no contestan nada útil

Responde SOLO JSON (sin markdown):
{"vote_class":"duro|blando|flotante","status":"respondido|invalido","confidence":0.0-1.0,"category":"keyword_corto","reason":"1 frase"}

Si no puedes clasificar con confianza >0.5, responde:
{"vote_class":"","status":"","confidence":0,"category":"no_clasificable","reason":"contexto insuficiente"}`;

type ClassifyResult = {
  vote_class: string;
  status: string;
  confidence: number;
  category: string;
  reason: string;
};

async function classifyWithGemini(
  apiKey: string,
  messages: Array<{ d: string; t: string; ts: number }>,
): Promise<ClassifyResult | null> {
  // Build conversation text
  const conversationText = messages
    .map((m) => `[${m.d === "out" ? "Operador" : "Votante"}]: ${m.t}`)
    .join("\n");

  if (conversationText.length < 20) return null;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: CONVERSATION_SYSTEM_PROMPT + "\n\nConversación:\n" + conversationText.slice(0, 4000) }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 150,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const rawText: string =
    (json as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed.confidence !== "number") parsed.confidence = 0;
    if (!parsed.vote_class) parsed.vote_class = "";
    if (!parsed.status) parsed.status = "";
    if (!parsed.category) parsed.category = "ai_classified";
    if (!parsed.reason) parsed.reason = "";
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
    return parsed as ClassifyResult;
  } catch {
    return null;
  }
}

// ── Sync classification to voter profile (fire-and-forget) ───────────
async function syncVoteClassToProfile(
  campaignId: string,
  conversationId: number,
  voteClass: string,
  category: string,
  source: string,
  log: { warn: (obj: Record<string, unknown>, msg: string) => void },
): Promise<void> {
  try {
    // Fetch conversation to get phone
    const conv = await repo.getById(conversationId, campaignId);
    if (!conv?.phone) return;

    // Update the voter profile's vote classification
    const canon = voterProfileRepo.normalizePhone(conv.phone);
    if (canon.length !== 9) return;

    const { rows } = await pool.query<{ id: string }>(
      `SELECT id::text FROM voter_profiles WHERE campaign_id = $1 AND canonical_phone = $2 LIMIT 1`,
      [campaignId, canon],
    );
    if (rows.length === 0) return;

    await voterProfileRepo.update(rows[0]!.id, {
      vote_class: voteClass,
      vote_class_source: source,
      category,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ conversation_id: conversationId, error: msg }, "sync vote_class to voter profile failed");
  }
}

// ── Route builder ────────────────────────────────────────────────────

export function buildConversationRoutes(env: AppEnv): FastifyPluginAsync {
  return async function conversationRoutes(app) {

    // ── POST /api/conversations/message — ingest a message ───────────
    // Called by extension on every sent/received WA message.
    // Creates or updates conversation, assigns owner, tries phone link.
    app.post("/api/conversations/message", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }

      const parsed = upsertMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      const authed = request as unknown as AuthenticatedRequest;
      const operatorName = authed.fullName || authed.email || "Operador";

      // 1. Upsert message into conversation
      const result = await repo.upsertMessage(campaignId, authed.userId, operatorName, parsed.data);

      // 2. Try to link to form_validations if phone is newly available
      let linked = false;
      if (parsed.data.phone && result.is_new) {
        const linkResult = await repo.tryLinkValidation(result.conversation_id, campaignId, parsed.data.phone);
        linked = linkResult.linked;
      }

      // 2b. Auto-upsert voter profile (fire-and-forget — don't block response)
      if (parsed.data.phone) {
        const isOutbound = parsed.data.direction === "out";
        voterProfileRepo.upsert({
          campaign_id: campaignId,
          phone: parsed.data.phone,
          name: parsed.data.contact_name || undefined,
          jid: parsed.data.jid,
          conversation_id: result.conversation_id,
          contacted_by: isOutbound ? authed.userId : undefined,
        }).then((vp) => {
          // Increment WA counters on the profile
          voterProfileRepo.incrementWaCounts(
            campaignId,
            parsed.data.phone!,
            isOutbound ? 1 : 0,
            isOutbound ? 0 : 1,
          ).catch(() => {}); // fire-and-forget
          // Update pipeline status if this is first outbound contact
          if (isOutbound && vp.pipeline_status === "nuevo") {
            voterProfileRepo.updatePipelineStatus(vp.id, "contactado", authed.userId).catch(() => {});
          }
          // If inbound, mark as responded
          if (!isOutbound && (vp.pipeline_status === "nuevo" || vp.pipeline_status === "contactado")) {
            voterProfileRepo.updatePipelineStatus(vp.id, "respondido", undefined).catch(() => {});
          }
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          app.log.warn({ phone: parsed.data.phone, error: msg }, "voter-profile auto-upsert failed");
        });
      }

      // 3. Auto-classify if: has 2+ inbound messages, not yet classified, Gemini available
      let autoClassified = false;
      if (
        env.geminiApiKey &&
        parsed.data.direction === "in" &&
        result.inbound_count >= 2 &&
        result.message_count >= 3
      ) {
        // Fetch full conversation to classify
        const conv = await repo.getById(result.conversation_id, campaignId);
        if (conv && conv.classified_by === "pending") {
          try {
            const aiResult = await classifyWithGemini(env.geminiApiKey, conv.messages);
            if (aiResult && aiResult.confidence >= 0.6 && aiResult.vote_class) {
              await repo.classify(campaignId, {
                conversation_id: result.conversation_id,
                vote_class: aiResult.vote_class as "duro" | "blando" | "flotante" | "",
                status: aiResult.status as "respondido" | "invalido" | "",
                category: aiResult.category,
                confidence: aiResult.confidence,
                reason: aiResult.reason,
                source: "auto",
              });
              autoClassified = true;
              app.log.info({ conversation_id: result.conversation_id, category: aiResult.category, confidence: aiResult.confidence }, "conversation auto-classified");
              // Sync vote_class to voter profile (fire-and-forget)
              syncVoteClassToProfile(campaignId, result.conversation_id, aiResult.vote_class, aiResult.category, "auto", app.log).catch(() => {});
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            app.log.warn({ conversation_id: result.conversation_id, error: msg }, "auto-classify failed");
          }
        }
      }

      return reply.send({
        ok: true,
        request_id: requestId,
        conversation_id: result.conversation_id,
        is_new: result.is_new,
        message_count: result.message_count,
        inbound_count: result.inbound_count,
        linked,
        auto_classified: autoClassified,
      });
    });

    // ── POST /api/conversations/classify — manually classify ─────────
    // Operator or admin corrects/sets classification.
    app.post("/api/conversations/classify", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }

      const parsed = classifyConversationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      const result = await repo.classify(campaignId, parsed.data);
      if (!result.updated) {
        return reply.code(409).send(errorPayload(requestId, "ALREADY_CLASSIFIED", result.reason || "conversacion ya clasificada"));
      }

      // Sync vote_class to voter profile (fire-and-forget)
      if (parsed.data.vote_class) {
        syncVoteClassToProfile(
          campaignId,
          parsed.data.conversation_id,
          parsed.data.vote_class,
          parsed.data.category || "manual",
          "manual",
          app.log,
        ).catch(() => {});
      }

      return reply.send({ ok: true, request_id: requestId });
    });

    // ── POST /api/conversations/request-classify — trigger AI classification ──
    // Manually request Gemini to classify a specific conversation.
    app.post("/api/conversations/request-classify", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }

      if (!env.geminiApiKey) {
        return reply.code(503).send(errorPayload(requestId, "UPSTREAM_ERROR", "AI classification not configured"));
      }

      const parsed = requestClassifySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      const conv = await repo.getById(parsed.data.conversation_id, campaignId);
      if (!conv) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "conversacion no encontrada"));
      }

      if (conv.inbound_count === 0) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "conversacion sin mensajes del contacto — no se puede clasificar"));
      }

      try {
        const aiResult = await classifyWithGemini(env.geminiApiKey, conv.messages);
        if (!aiResult || !aiResult.vote_class) {
          return reply.send({ ok: true, request_id: requestId, classification: null, reason: "AI could not classify" });
        }

        // Apply as auto (can be overridden by manual later)
        await repo.classify(campaignId, {
          conversation_id: parsed.data.conversation_id,
          vote_class: aiResult.vote_class as "duro" | "blando" | "flotante" | "",
          status: aiResult.status as "respondido" | "invalido" | "",
          category: aiResult.category,
          confidence: aiResult.confidence,
          reason: aiResult.reason,
          source: "auto",
        });

        // Sync to voter profile (fire-and-forget)
        syncVoteClassToProfile(
          campaignId,
          parsed.data.conversation_id,
          aiResult.vote_class,
          aiResult.category,
          "auto",
          app.log,
        ).catch(() => {});

        return reply.send({ ok: true, request_id: requestId, classification: aiResult });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.code(502).send(errorPayload(requestId, "UPSTREAM_ERROR", `Gemini error: ${msg}`));
      }
    });

    // ── GET /api/conversations — list conversations ──────────────────
    app.get("/api/conversations", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }

      const parsed = listConversationsSchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }

      const result = await repo.list(campaignId, parsed.data);
      return reply.send({ ok: true, request_id: requestId, ...result });
    });

    // ── GET /api/conversations/stats — dashboard stats ───────────────
    app.get("/api/conversations/stats", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }

      const result = await repo.stats(campaignId);
      return reply.send({ ok: true, request_id: requestId, stats: result });
    });

    // ── GET /api/conversations/:id — get single conversation ─────────
    app.get<{ Params: { id: string } }>("/api/conversations/:id", {
      preHandler: [app.authenticate, authorize({ roles: ["agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }

      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "id debe ser un numero"));
      }

      const conv = await repo.getById(id, campaignId);
      if (!conv) {
        return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "conversacion no encontrada"));
      }

      return reply.send({ ok: true, request_id: requestId, conversation: conv });
    });
  };
}
