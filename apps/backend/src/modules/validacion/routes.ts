import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";
import { z } from "zod";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import {
  updateStatusSchema,
  VALIDATION_STATUSES,
  classificationEventSchema,
  correctClassificationSchema,
  CLASSIFICATION_SOURCES,
} from "./schemas";

// ═══════════════════════════════════════════════════════════════════════
// SSE — Classification Events Real-Time Stream
// ═══════════════════════════════════════════════════════════════════════

type ClassificationSseClient = {
  res: ServerResponse;
  campaignId: string;
};

let sseClientSeq = 0;
const sseClients = new Map<number, ClassificationSseClient>();

function writeSseEvent(res: ServerResponse, event: string, payload: unknown): boolean {
  try {
    const okEvent = res.write(`event: ${event}\n`);
    const okData = res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return okEvent && okData;
  } catch {
    return false;
  }
}

function broadcastClassificationEvent(campaignId: string, event: string, payload: unknown): void {
  const toPrune: number[] = [];
  for (const [id, client] of sseClients.entries()) {
    if (client.campaignId !== campaignId) continue;
    const ok = writeSseEvent(client.res, event, payload);
    if (!ok) toPrune.push(id);
  }
  for (const id of toPrune) {
    const c = sseClients.get(id);
    if (c) {
      try { c.res.end(); } catch { /* noop */ }
      sseClients.delete(id);
    }
  }
}

// SSE CORS origin validation — reply.raw bypasses @fastify/cors
function isSseOriginAllowed(origin: string, env: AppEnv): boolean {
  if (env.nodeEnv !== "production") return true;
  return env.frontendOrigins.some((allowed) => {
    if (allowed.includes("*")) {
      const regex = new RegExp("^" + allowed.replace(/\*/g, "[^.]+") + "$");
      return regex.test(origin);
    }
    return allowed === origin;
  });
}

export function buildValidacionRoutes(env: AppEnv): FastifyPluginAsync {
  // Heartbeat for SSE — keeps connections alive through proxies/LBs
  const heartbeatTimer = setInterval(() => {
    for (const [id, client] of sseClients.entries()) {
      const ok = writeSseEvent(client.res, "heartbeat", { ts: Date.now() });
      if (!ok) {
        try { client.res.end(); } catch { /* noop */ }
        sseClients.delete(id);
      }
    }
  }, 25_000);
  heartbeatTimer.unref();

  return async (app) => {

    // ── Ensure tables on startup ──
    await repo.ensureValidacionTable();
    await repo.ensureClassificationEventsTable();

    // ── POST /api/validacion/sync — sync forms into validations table ──
    app.post("/api/validacion/sync", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      const count = await repo.syncValidations(campaignId);
      return reply.send({ ok: true, request_id: requestId, synced: count });
    });

    // ── GET /api/validacion — list validations for campaign ──
    app.get("/api/validacion", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const query = request.query as { status?: string; page?: string; limit?: string };
      const status = query.status && VALIDATION_STATUSES.includes(query.status as never)
        ? query.status as typeof VALIDATION_STATUSES[number]
        : undefined;

      const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
      const page = Math.max(Number(query.page) || 1, 1);
      const offset = (page - 1) * limit;

      // Auto-sync on first list call
      await repo.syncValidations(campaignId);
      const [items, total] = await Promise.all([
        repo.listByCampaign(campaignId, status, limit, offset),
        repo.countByCampaign(campaignId, status),
      ]);
      return reply.send({ ok: true, request_id: requestId, items, total, page, limit });
    });

    // ── GET /api/validacion/lookup — lookup single validation by phone ──
    // Used by Chrome extension to match active chat to a validation item.
    app.get("/api/validacion/lookup", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const query = request.query as { phone?: string };
      const phone = (query.phone || "").trim();
      if (!phone || phone.length < 7) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "phone query param requerido (min 7 caracteres)"));
      }

      const item = await repo.lookupByPhone(campaignId, phone);
      if (!item) return reply.send({ ok: true, request_id: requestId, item: null });
      return reply.send({ ok: true, request_id: requestId, item });
    });

    // ── GET /api/validacion/stats — counts by status ──
    app.get("/api/validacion/stats", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      const stats = await repo.statsByCampaign(campaignId);
      return reply.send({ ok: true, request_id: requestId, stats });
    });

    // ── GET /api/validacion/stats/brigadistas — ranking by encuestador ──
    app.get("/api/validacion/stats/brigadistas", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      const brigadistas = await repo.statsByEncuestador(campaignId);
      return reply.send({ ok: true, request_id: requestId, brigadistas });
    });

    // ── PUT /api/validacion/:id/status — update validation status ──
    app.put<{ Params: { id: string } }>("/api/validacion/:id/status", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const parsed = updateStatusSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));

      const authed = request as unknown as AuthenticatedRequest;
      const result = await repo.updateStatus(request.params.id, campaignId, parsed.data.status, parsed.data.notes ?? null, authed.userId, parsed.data.vote_class);
      if (!result) return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "validacion no encontrada"));
      return reply.send({ ok: true, request_id: requestId, item: result });
    });

    // ── PUT /api/validacion/:id/claim — claim a contact ──
    app.put<{ Params: { id: string } }>("/api/validacion/:id/claim", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const authed = request as unknown as AuthenticatedRequest;
      const result = await repo.claim(request.params.id, campaignId, authed.userId);
      if (!result) return reply.code(409).send(errorPayload(requestId, "ALREADY_CLAIMED", "contacto ya tomado por otro operador"));
      return reply.send({ ok: true, request_id: requestId, item: result });
    });

    // ═══════════════════════════════════════════════════════════════════
    // TTS PROXY — C-1 FIX: ElevenLabs API key stays server-side
    // Extension sends text → backend proxies to ElevenLabs → returns base64 audio
    // ═══════════════════════════════════════════════════════════════════

    const ttsBodySchema = z.object({
      text: z.string().min(1, "text requerido").max(5000, "text max 5000 chars"),
      voice_id: z.string().max(100).optional(),
    });

    app.post("/api/tts/generate", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
      config: {
        rateLimit: {
          max: 30,       // 30 calls per minute per user
          timeWindow: 60000,
          keyGenerator: (req: { userId?: string; ip: string }) =>
            `tts:${req.userId ?? req.ip}`,
        },
      },
    }, async (request, reply) => {
      const requestId = String(request.id);

      if (!env.elevenlabsApiKey) {
        return reply.code(503).send(errorPayload(requestId, "UPSTREAM_ERROR", "TTS service not configured"));
      }

      const parsed = ttsBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((e) => e.message).join("; ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", msg));
      }

      const { text, voice_id } = parsed.data;
      const voiceId = voice_id || "iaSdolcffUuIlEi5pdbj";

      try {
        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": env.elevenlabsApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
              output_format: "ogg_24000",
            }),
          },
        );

        if (!ttsRes.ok) {
          const errText = await ttsRes.text().catch(() => ttsRes.statusText);
          app.log.error({ status: ttsRes.status, body: errText }, "ElevenLabs TTS error");
          return reply.code(502).send(errorPayload(requestId, "UPSTREAM_ERROR", `ElevenLabs returned ${ttsRes.status}`));
        }

        const buffer = await ttsRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");

        return reply.send({
          ok: true,
          request_id: requestId,
          audioBase64: base64,
          mimeType: "audio/ogg; codecs=opus",
          size: buffer.byteLength,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown TTS error";
        app.log.error({ err }, "TTS proxy error");
        return reply.code(502).send(errorPayload(requestId, "UPSTREAM_ERROR", message));
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // CLASSIFICATION EVENTS — tracking auto/manual classifications
    // ═══════════════════════════════════════════════════════════════════

    // ── POST /api/validacion/classification-event — report a classification ──
    app.post("/api/validacion/classification-event", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const parsed = classificationEventSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));

      const authed = request as unknown as AuthenticatedRequest;
      const event = await repo.insertClassificationEvent(campaignId, authed.userId, parsed.data);

      // Broadcast to SSE clients
      broadcastClassificationEvent(campaignId, "classification.new", event);

      return reply.send({ ok: true, request_id: requestId, event });
    });

    // ── GET /api/validacion/classification-events — list events (paginated) ──
    app.get("/api/validacion/classification-events", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const query = request.query as { page?: string; limit?: string; source?: string; category?: string; vote_class?: string };
      const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
      const page = Math.max(Number(query.page) || 1, 1);
      const offset = (page - 1) * limit;

      const filters: { source?: string; category?: string; vote_class?: string } = {};
      if (query.source && CLASSIFICATION_SOURCES.includes(query.source as "auto")) filters.source = query.source;
      if (query.category) filters.category = query.category;
      if (query.vote_class) filters.vote_class = query.vote_class;

      const { items, total } = await repo.listClassificationEvents(campaignId, limit, offset, filters);
      return reply.send({ ok: true, request_id: requestId, items, total, page, limit });
    });

    // ── PUT /api/validacion/classification-events/:id/correct — correct a classification ──
    app.put<{ Params: { id: string } }>("/api/validacion/classification-events/:id/correct", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const parsed = correctClassificationSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));

      const authed = request as unknown as AuthenticatedRequest;
      const result = await repo.correctClassificationEvent(
        request.params.id,
        campaignId,
        authed.userId,
        parsed.data.corrected_vote_class,
        parsed.data.corrected_status,
      );
      if (!result) return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "evento de clasificacion no encontrado"));

      // Broadcast correction to SSE clients
      broadcastClassificationEvent(campaignId, "classification.corrected", result);

      return reply.send({ ok: true, request_id: requestId, event: result });
    });

    // ── GET /api/validacion/classification-stats — aggregated classification metrics ──
    app.get("/api/validacion/classification-stats", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const stats = await repo.classificationStats(campaignId);
      return reply.send({ ok: true, request_id: requestId, stats });
    });

    // ═══════════════════════════════════════════════════════════════════
    // SSE — Real-time classification event stream
    // ═══════════════════════════════════════════════════════════════════

    // ── GET /api/validacion/classification-events/stream — SSE ──
    app.get("/api/validacion/classification-events/stream", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor", "agente_digital"] })],
    }, async (request, reply) => {
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(String(request.id), "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      }

      reply.raw.statusCode = 200;
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");

      // CORS headers for SSE — reply.raw bypasses @fastify/cors plugin
      const origin = request.headers.origin;
      if (origin && isSseOriginAllowed(origin, env)) {
        reply.raw.setHeader("Access-Control-Allow-Origin", origin);
        reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
      }

      reply.raw.flushHeaders?.();

      const clientId = ++sseClientSeq;
      sseClients.set(clientId, {
        res: reply.raw,
        campaignId,
      });

      // Retry hint: client should reconnect after 3s on drop
      reply.raw.write("retry: 3000\n\n");

      // Send connected confirmation
      writeSseEvent(reply.raw, "connected", {
        ts: Date.now(),
        clients: sseClients.size,
      });

      const cleanup = () => { sseClients.delete(clientId); };
      request.raw.on("close", cleanup);
      request.raw.on("end", cleanup);
      request.raw.on("error", cleanup);

      return reply;
    });
  };
}
