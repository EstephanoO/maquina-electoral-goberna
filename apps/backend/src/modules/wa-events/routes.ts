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
import { z } from "zod";
import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import { pool } from "../../db";
import * as conversationsRepo from "../conversations/repository";
import * as voterProfileRepo from "../voter-profiles/repository";
import { classifyAndTagVoterProfile } from "../ai/voter-classifier";
import { cmsEvents } from "../../infra/cms-events";

// ── Schemas ──────────────────────────────────────────────────────────

const waEventBodySchema = z.object({
  campaign_id: z.string().uuid(),
  own_number: z.string().min(8).max(20),
  jid: z.string().min(5),
  phone: z.string().max(20).optional(),
  contact_name: z.string().max(200).optional(),
  direction: z.enum(["in", "out"]),
  text: z.string().max(5000).default(""),
  timestamp: z.number().int().optional(),
  // Opcional: solo se setea cuando el push corresponde a un envío iniciado
  // por electoral (outbound) y el bot quiere atribuir la operadora.
  operator_id: z.string().uuid().optional(),
  operator_name: z.string().max(200).optional(),
});

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

      // 1. Upsert message into conversation
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
  };
}
