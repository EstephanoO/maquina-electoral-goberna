/**
 * GOBERNA — WA Events Module
 *
 * Endpoints para que el bot Baileys (thin pipe en /srv/leads-crm/bot/)
 * pushea inbound/outbound WA events a electoral y pulle la lista de números
 * activos por campaña.
 *
 * Auth:
 *   - Header `X-Bot-Secret` debe matchear `env.botSharedSecret`.
 *   - Si la env var está vacía, los endpoints responden 503 (no configurado).
 *
 * Endpoints:
 *   - POST /api/cms/wa-events      — recibe un mensaje (in/out) detectado por el bot
 *   - GET  /api/cms/active-wa-phones — devuelve los números activos por campaña
 *
 * Diferencia vs `/api/conversations/message`:
 *   - Auth por X-Bot-Secret (no JWT de operador)
 *   - Inbound: NO setea operator_id/owner (el bot no sabe de operadoras)
 *   - Outbound: opcionalmente acepta operator_id/operator_name (cuando el push
 *     viene como respuesta a una orden de envío de electoral)
 */

import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import { pool } from "../../db";
import * as conversationsRepo from "../conversations/repository";
import * as voterProfileRepo from "../voter-profiles/repository";
import { classifyAndTagVoterProfile } from "../ai/voter-classifier";
import { cmsEvents } from "../../infra/cms-events";

// ── Schemas ──────────────────────────────────────────────────────────

// Tipos de mensaje que el bot puede empujar. Mantiene compat con el flujo
// viejo (text-only) — todos los campos `media_*`, `reaction_*`, `quoted_*`,
// `sender_*`, `is_group`, `group_subject` son opcionales y default a null.
const messageTypeSchema = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contact",
  "reaction",
  "system",
]);

const waEventBodySchema = z.object({
  campaign_id: z.string().uuid(),
  own_number: z.string().min(8).max(20),
  jid: z.string().min(5),
  phone: z.string().max(20).optional(),
  contact_name: z.string().max(200).optional(),
  direction: z.enum(["in", "out"]),
  text: z.string().max(5000).default(""),
  timestamp: z.number().int().optional(),
  // External id de Baileys (msg.key.id). Opcional pero útil para dedup,
  // resolución de reacciones (reaction_to_external_id), y quoted replies.
  external_id: z.string().max(120).optional(),
  // Opcional: solo se setea cuando el push corresponde a un envío iniciado
  // por electoral (outbound) y el bot quiere atribuir la operadora.
  operator_id: z.string().uuid().optional(),
  operator_name: z.string().max(200).optional(),

  // ── Tipo de mensaje (default 'text' para compat) ──
  message_type: messageTypeSchema.optional(),

  // ── Media ──
  // El bot descarga el binario y lo sube via POST /api/cms/wa-media.
  // El response trae url/mime/size que el bot pone acá.
  media_url: z.string().url().max(500).optional(),
  media_mime: z.string().max(120).optional(),
  media_size_bytes: z.number().int().nonnegative().optional(),
  media_caption: z.string().max(2000).optional(),
  media_duration_sec: z.number().int().nonnegative().optional(),
  media_thumb_url: z.string().url().max(500).optional(),

  // ── Group context ──
  is_group: z.boolean().optional(),
  group_subject: z.string().max(200).optional(),
  // Sender real (autor del mensaje) — distinto del jid de la conversation
  // cuando es grupo. En 1:1 es redundante con `jid`/`phone`.
  sender_jid: z.string().max(120).optional(),
  sender_name: z.string().max(200).optional(),

  // ── Reaction ──
  // Cuando message_type='reaction', estos dos campos son obligatorios:
  // reaction_to_external_id apunta al msg que reaccionaron, reaction_emoji
  // es el emoji aplicado (string vacío = unreact).
  reaction_to_external_id: z.string().max(120).optional(),
  reaction_emoji: z.string().max(20).optional(),

  // ── Quoted reply ──
  quoted_external_id: z.string().max(120).optional(),

  // ── Debug raw payload ──
  // Dump opcional de msg.message — útil mientras debuggeamos formatos
  // exóticos. Se persiste en wa_messages.raw_payload (jsonb).
  raw_payload: z.unknown().optional(),
}).refine(
  (data) => {
    // Si es reaction, reaction_to_external_id es obligatorio.
    if (data.message_type === "reaction" && !data.reaction_to_external_id) {
      return false;
    }
    return true;
  },
  { message: "reaction_to_external_id requerido cuando message_type='reaction'" },
);

// ── Helpers ──────────────────────────────────────────────────────────

const SYSTEM_OPERATOR_ID = "00000000-0000-0000-0000-000000000000";
const SYSTEM_OPERATOR_NAME = "system_bot";

// ── Routes ───────────────────────────────────────────────────────────

export function buildWaEventsRoutes(env: AppEnv): FastifyPluginAsync {
  return async function waEventsRoutes(app) {
    // ── POST /api/cms/wa-events ─────────────────────────────────────
    app.post("/api/cms/wa-events", async (request, reply) => {
      const requestId = String(request.id);

      if (!env.botSharedSecret) {
        return reply.code(503).send(errorPayload(requestId, "BOT_SECRET_NOT_SET", "BOT_SHARED_SECRET no configurado en backend"));
      }

      const provided = (request.headers["x-bot-secret"] ?? "") as string;
      if (provided !== env.botSharedSecret) {
        return reply.code(401).send(errorPayload(requestId, "UNAUTHORIZED", "X-Bot-Secret inválido"));
      }

      const parsed = waEventBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }
      const body = parsed.data;

      // Security: el bot solo puede pushear para números registrados en wa_phones de esta campaña
      const cleanOwnNumber = body.own_number.replace(/\D/g, "");
      const { rows: phoneRows } = await pool.query<{ id: string }>(
        `SELECT id::text FROM wa_phones WHERE campaign_id = $1 AND number = $2 LIMIT 1`,
        [body.campaign_id, cleanOwnNumber],
      );
      if (phoneRows.length === 0) {
        return reply.code(403).send(errorPayload(requestId, "OWN_NUMBER_NOT_REGISTERED", `el número ${cleanOwnNumber} no está registrado en wa_phones de esta campaña`));
      }

      const isOut = body.direction === "out";
      const operatorId = isOut ? (body.operator_id ?? SYSTEM_OPERATOR_ID) : SYSTEM_OPERATOR_ID;
      const operatorName = isOut ? (body.operator_name ?? SYSTEM_OPERATOR_NAME) : SYSTEM_OPERATOR_NAME;

      // 1. Upsert message into conversation (mantiene compat con el JSONB array
      //    histórico). El nuevo wa_messages es la full-fidelity store que
      //    insertamos abajo en paralelo.
      const result = await conversationsRepo.upsertMessage(
        body.campaign_id,
        operatorId,
        operatorName,
        {
          jid: body.jid,
          own_number: cleanOwnNumber,
          direction: body.direction,
          text: body.text,
          contact_name: body.contact_name,
          phone: body.phone,
          timestamp: body.timestamp,
        },
      );

      // 1b. Marca la conversation como grupo si el bot lo indicó. Setea o
      //     refresca el group_subject en cada inbound (los grupos cambian de
      //     nombre con el tiempo). No-op si no es grupo.
      if (body.is_group) {
        await pool.query(
          `UPDATE conversations
              SET is_group       = TRUE,
                  group_subject  = COALESCE($2, group_subject),
                  updated_at     = NOW()
            WHERE id = $1`,
          [result.conversation_id, body.group_subject ?? null],
        ).catch((err: unknown) => {
          app.log.warn({ err, conversation_id: result.conversation_id }, "wa-events: set is_group failed");
        });
      }

      // 1c. Insert en wa_messages (full fidelity: media, reaction, group sender).
      //     Idempotente vía UNIQUE (conversation_id, external_id) — re-pushes
      //     del mismo msg.key.id no duplican filas.
      const messageType = body.message_type ?? "text";
      const tsMs = body.timestamp ?? Date.now();
      try {
        await pool.query(
          `INSERT INTO wa_messages (
              conversation_id, external_id, direction, message_type, text,
              media_url, media_mime, media_size_bytes, media_caption,
              media_duration_sec, media_thumb_url,
              sender_jid, sender_name,
              reaction_to_external_id, reaction_emoji,
              quoted_external_id,
              operator_id, operator_name,
              ts_ms, raw_payload
           )
           VALUES ($1, $2, $3, $4, $5,
                   $6, $7, $8, $9,
                   $10, $11,
                   $12, $13,
                   $14, $15,
                   $16,
                   $17, $18,
                   $19, $20)
           ON CONFLICT (conversation_id, external_id)
             WHERE external_id IS NOT NULL
             DO NOTHING`,
          [
            result.conversation_id,
            body.external_id ?? null,
            body.direction,
            messageType,
            body.text,
            body.media_url ?? null,
            body.media_mime ?? null,
            body.media_size_bytes ?? null,
            body.media_caption ?? null,
            body.media_duration_sec ?? null,
            body.media_thumb_url ?? null,
            body.sender_jid ?? null,
            body.sender_name ?? null,
            body.reaction_to_external_id ?? null,
            body.reaction_emoji ?? null,
            body.quoted_external_id ?? null,
            isOut && operatorId !== SYSTEM_OPERATOR_ID ? operatorId : null,
            isOut ? (body.operator_name ?? null) : null,
            tsMs,
            body.raw_payload != null ? JSON.stringify(body.raw_payload) : null,
          ],
        );
      } catch (err) {
        app.log.warn(
          { err, conversation_id: result.conversation_id, external_id: body.external_id },
          "wa-events: wa_messages insert failed (continuing — JSONB array still has the message)",
        );
      }

      // 2. Try-link to a form_validation if phone is available + new conversation
      let linked = false;
      if (body.phone && result.is_new) {
        const linkRes = await conversationsRepo.tryLinkValidation(result.conversation_id, body.campaign_id, body.phone);
        linked = linkRes.linked;
      }

      // 3. Voter profile auto-upsert + engagement transition.
      // Fire-and-forget en el sentido de que no bloqueamos la respuesta HTTP,
      // pero sí ejecutamos el flujo completo (upsert → counters → transition →
      // AI tag) en background. El match con el QR lead pasa acá vía canonical_phone.
      if (body.phone) {
        const phone = body.phone;
        const captureContactedBy = isOut && operatorId !== SYSTEM_OPERATOR_ID ? operatorId : undefined;
        voterProfileRepo.upsert({
          campaign_id: body.campaign_id,
          phone,
          name: body.contact_name,
          jid: body.jid,
          conversation_id: result.conversation_id,
          contacted_by: captureContactedBy,
        }).then(async (vp) => {
          await voterProfileRepo.incrementWaCounts(
            body.campaign_id,
            phone,
            isOut ? 1 : 0,
            isOut ? 0 : 1,
          ).catch(() => {});

          // Transición de engagement (comparte/responde/fidelizado/contactado).
          // Reemplaza la lógica antigua basada en if/else con la state machine
          // unificada del repo, que también incrementa engagement_score y
          // promueve a 'fidelizado' al cruzar el threshold.
          await voterProfileRepo.applyEngagementTransition(
            vp.id,
            isOut ? "out" : "in",
            env.fidelizadoThreshold,
          ).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            app.log.warn({ vp_id: vp.id, error: msg }, "wa-events: applyEngagementTransition failed");
          });

          // AI auto-tag/auto-classify SOLO en inbound con texto no vacío.
          // Outbound no se clasifica (lo escribió la operadora).
          if (!isOut && body.text && body.text.trim().length > 3) {
            void classifyAndTagVoterProfile(env, vp.id, body.text).catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              app.log.warn({ vp_id: vp.id, error: msg }, "wa-events: AI classifier failed");
            });
          }
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          app.log.warn({ phone, error: msg }, "wa-events: voter-profile upsert failed");
        });
      }

      // 4. SSE — notify CMS clients of this campaign that a new message arrived
      cmsEvents.emit("message.new", {
        campaignId: body.campaign_id,
        contactId: String(result.conversation_id),
        direction: isOut ? "outbound" : "inbound",
        messageId: String(result.conversation_id),
      });

      return reply.send({
        ok: true,
        request_id: requestId,
        conversation_id: result.conversation_id,
        is_new: result.is_new,
        message_count: result.message_count,
        inbound_count: result.inbound_count,
        linked,
      });
    });

    // ── GET /api/cms/active-wa-phones ───────────────────────────────
    // Devuelve la lista de números activos para que el bot sepa a qué módulo
    // (electoral) routear los eventos. El bot puede pollear cada N segundos.
    app.get("/api/cms/active-wa-phones", async (request, reply) => {
      const requestId = String(request.id);

      if (!env.botSharedSecret) {
        return reply.code(503).send(errorPayload(requestId, "BOT_SECRET_NOT_SET", "BOT_SHARED_SECRET no configurado en backend"));
      }
      const provided = (request.headers["x-bot-secret"] ?? "") as string;
      if (provided !== env.botSharedSecret) {
        return reply.code(401).send(errorPayload(requestId, "UNAUTHORIZED", "X-Bot-Secret inválido"));
      }

      const { rows } = await pool.query<{
        number: string;
        alias: string | null;
        campaign_id: string;
        campaign_name: string;
        campaign_slug: string;
      }>(
        `SELECT wp.number, wp.alias, wp.campaign_id::text, c.name AS campaign_name, c.slug AS campaign_slug
           FROM wa_phones wp
           JOIN campaigns c ON c.id = wp.campaign_id
          WHERE c.status = 'active'
          ORDER BY c.name, wp.alias NULLS LAST, wp.number`,
      );

      return reply.send({
        ok: true,
        request_id: requestId,
        phones: rows,
      });
    });

    // ── POST /api/cms/wa-media ───────────────────────────────────────
    // El bot Baileys descarga la media adjunta a un mensaje (image/audio/
    // video/doc/sticker), la POSTea acá como raw binary, y recibe la URL
    // pública para meter en el wa-event subsecuente.
    //
    // Auth: X-Bot-Secret (mismo que wa-events). El endpoint /api/uploads
    // existe pero exige JWT con rol consultor — el bot no tiene esos
    // credenciales, así que necesitamos un path bot-only con auth shared-secret.
    //
    // Layout en disco: /srv/uploads/wa/<campaign_id>/<sha256-prefix>.<ext>
    // Hash del contenido = dedup natural si el bot reenvía el mismo binario.
    //
    // Limits: 50MB (audio de WSP llega a 16MB; video a 64MB en algunos casos).
    // MIME whitelist amplia pero contenida — sin executables.
    const ALLOWED_BOT_MIME = new Set([
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "audio/ogg", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a",
      "video/mp4", "video/3gpp", "video/quicktime", "video/webm",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "text/plain",
    ]);
    const BOT_MAX_FILE_SIZE = 50 * 1024 * 1024;

    const MIME_TO_EXT: Record<string, string> = {
      "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
      "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/aac": ".aac", "audio/wav": ".wav",
      "audio/x-wav": ".wav", "audio/mp4": ".m4a", "audio/m4a": ".m4a",
      "video/mp4": ".mp4", "video/3gpp": ".3gp", "video/quicktime": ".mov", "video/webm": ".webm",
      "application/pdf": ".pdf",
      "application/msword": ".doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
      "application/vnd.ms-excel": ".xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
      "application/zip": ".zip",
      "text/plain": ".txt",
    };

    // Registrar parsers de content-type para que Fastify entregue el body como
    // Buffer crudo (igual que /api/uploads). bodyLimit por content-type override
    // del default global de 1MB.
    for (const mime of ALLOWED_BOT_MIME) {
      app.addContentTypeParser(
        mime,
        { parseAs: "buffer", bodyLimit: BOT_MAX_FILE_SIZE },
        (_request, payload, done) => done(null, payload),
      );
    }

    app.post(
      "/api/cms/wa-media",
      { bodyLimit: BOT_MAX_FILE_SIZE },
      async (request, reply) => {
        const requestId = String(request.id);

        if (!env.botSharedSecret) {
          return reply.code(503).send(errorPayload(requestId, "BOT_SECRET_NOT_SET", "BOT_SHARED_SECRET no configurado"));
        }
        const provided = (request.headers["x-bot-secret"] ?? "") as string;
        if (provided !== env.botSharedSecret) {
          return reply.code(401).send(errorPayload(requestId, "UNAUTHORIZED", "X-Bot-Secret inválido"));
        }

        const contentType = (request.headers["content-type"] ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
        if (!ALLOWED_BOT_MIME.has(contentType)) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_FILE_TYPE", `tipo no permitido: ${contentType}`));
        }

        // Campaign id: el bot lo manda en el header X-Campaign-Id para que
        // los archivos queden organizados por tenant.
        const campaignId = (request.headers["x-campaign-id"] as string | undefined)?.trim() ?? "";
        if (!campaignId || !/^[0-9a-f-]{36}$/i.test(campaignId)) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "X-Campaign-Id requerido (uuid)"));
        }

        const buffer = request.body as Buffer | undefined;
        if (!buffer || buffer.length === 0) {
          return reply.code(400).send(errorPayload(requestId, "EMPTY_FILE", "archivo vacío"));
        }
        if (buffer.length > BOT_MAX_FILE_SIZE) {
          return reply.code(413).send(errorPayload(requestId, "FILE_TOO_LARGE", `archivo excede ${BOT_MAX_FILE_SIZE / 1024 / 1024}MB`));
        }

        // Hash del contenido — primer 24 chars como nombre de archivo. Dedup
        // automático: si el mismo audio llega 2x, sobrescribimos en el mismo
        // path (idempotente).
        const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
        const ext = MIME_TO_EXT[contentType] ?? extname("file.bin");
        const filename = `${hash}${ext}`;

        const subdir = `wa/${campaignId}`;
        const targetDir = join(env.uploadsDir, subdir);
        await mkdir(targetDir, { recursive: true });

        const filePath = join(targetDir, filename);
        const resolvedPath = resolve(filePath);
        const resolvedUploadsDir = resolve(env.uploadsDir);
        if (!resolvedPath.startsWith(resolvedUploadsDir)) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_PATH", "path fuera del uploads dir"));
        }

        try {
          await writeFile(filePath, buffer);
        } catch (err) {
          app.log.error({ err, filePath, request_id: requestId }, "wa-media: write failed");
          return reply.code(500).send(errorPayload(requestId, "WRITE_ERROR", "error guardando archivo"));
        }

        // Public URL: nginx sirve /uploads/* desde /srv/uploads/.
        const publicUrl = `${env.publicBaseUrl}/uploads/${subdir}/${filename}`;

        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          url: publicUrl,
          mime: contentType,
          size_bytes: buffer.length,
          hash,
        });
      },
    );
  };
}
