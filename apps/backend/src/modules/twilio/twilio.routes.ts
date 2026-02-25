/**
 * GOBERNA — Twilio WhatsApp Routes
 *
 * Endpoints:
 *   POST /api/twilio/whatsapp/send          → enviar mensaje WA a contacto CMS
 *   GET  /api/twilio/whatsapp/messages/:contactId → historial de conversación
 *   POST /api/webhooks/twilio/whatsapp      → webhook de Twilio (público, firmado)
 */

import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { cmsEvents } from "../../infra/cms-events";
import { pool } from "../../db";
import {
  sendWhatsAppMessage,
  handleTwilioWebhook,
  validateTwilioWebhookSignature,
  getContactMessages,
} from "./twilio.service";
import { sendWhatsAppSchema, contactIdParamSchema } from "./twilio.schema";

export function buildTwilioRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {

    // ── POST /api/twilio/whatsapp/send ─────────────────────────────────
    // Envía un mensaje WhatsApp al número del contacto CMS.
    // Requiere JWT + campaña activa.
    app.post(
      "/api/twilio/whatsapp/send",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        // Validate body
        const parsed = sendWhatsAppSchema.safeParse(request.body);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((e) => e.message).join("; ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", msg));
        }

        const { contact_id, campaign_id, body } = parsed.data;

        // Verify contact belongs to this campaign and fetch phone
        let toPhone = "";
        try {
          const res = await pool.query<{ telefono: string; cms_status: string }>(
            `SELECT COALESCE(data->>'telefono', '') AS telefono, cms_status
             FROM form_submissions
             WHERE id = $1 AND campaign_id = $2`,
            [contact_id, campaign_id],
          );

          if (res.rows.length === 0) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "Contacto no encontrado en esta campaña"));
          }

          toPhone = res.rows[0]?.telefono ?? "";
        } catch (err) {
          app.log.error({ err, request_id: requestId }, "twilio send: DB lookup failed");
          return reply.code(500).send(errorPayload(requestId, "DB_ERROR", "Error consultando contacto"));
        }

        // Send via Twilio (or mock in dev)
        const result = await sendWhatsAppMessage({
          contactId: contact_id,
          campaignId: campaign_id,
          toPhone,
          body,
          sentBy: authed.userId,
        });

        if (!result.ok) {
          app.log.warn({ error: result.error, contact_id, request_id: requestId }, "twilio send failed");
          return reply.code(502).send(errorPayload(requestId, "TWILIO_SEND_ERROR", result.error));
        }

        // Notify CMS SSE clients about the new outbound message
        cmsEvents.emitCms("message.new", {
          campaignId: campaign_id,
          contactId: contact_id,
          direction: "outbound",
          messageId: result.message.id,
        });

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          message_id: result.message.id,
          twilio_sid: result.message.twilio_sid,
          status: result.message.status,
        });
      },
    );

    // ── GET /api/twilio/whatsapp/messages/:contactId ──────────────────
    // Historial de mensajes WA (outbound + inbound) para un contacto.
    app.get(
      "/api/twilio/whatsapp/messages/:contactId",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        const paramParsed = contactIdParamSchema.safeParse(request.params);
        if (!paramParsed.success) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "contactId inválido"));
        }

        const { contactId } = paramParsed.data;

        try {
          const messages = await getContactMessages(contactId, campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, messages });
        } catch (err) {
          app.log.error({ err, request_id: requestId }, "twilio messages fetch failed");
          return reply.code(500).send(errorPayload(requestId, "DB_ERROR", "Error obteniendo mensajes"));
        }
      },
    );

    // ── POST /api/webhooks/twilio/whatsapp ─────────────────────────────
    // Webhook público de Twilio. Valida la firma X-Twilio-Signature antes
    // de procesar. Maneja:
    //   - Status updates (delivered, read, failed…)
    //   - Mensajes entrantes del ciudadano (Body presente)
    app.post(
      "/api/webhooks/twilio/whatsapp",
      {
        config: { rawBody: true },
      },
      async (request, reply) => {
        const requestId = String(request.id);

        // ── Signature validation ───────────────────────────────────────
        // Cloudflare proxying can alter headers, so we try multiple URL
        // variants to match what Twilio used when computing the signature.
        const signature = (request.headers["x-twilio-signature"] as string) ?? "";
        const proto = (request.headers["x-forwarded-proto"] as string) ?? "https";
        const host = request.headers.host ?? "";
        const params = request.body as Record<string, string>;

        // Build candidate URLs: the reconstructed one + the canonical public URL
        const reconstructedUrl = `${proto}://${host}/api/webhooks/twilio/whatsapp`;
        const canonicalUrl = "https://api.goberna.us/api/webhooks/twilio/whatsapp";
        const urlCandidates = [reconstructedUrl];
        if (reconstructedUrl !== canonicalUrl) urlCandidates.push(canonicalUrl);

        let valid = false;
        for (const url of urlCandidates) {
          valid = await validateTwilioWebhookSignature(signature, url, params);
          if (valid) break;
        }

        if (!valid) {
          app.log.warn(
            { request_id: requestId, reconstructedUrl, proto, host, hasSignature: !!signature, paramsKeys: Object.keys(params) },
            "twilio webhook: invalid signature — all URL candidates failed",
          );
          return reply.code(403).send(errorPayload(requestId, "FORBIDDEN", "firma inválida"));
        }

        // ── Process payload ────────────────────────────────────────────
        const body = request.body as Record<string, string>;

        const messageSid = body.MessageSid ?? body.SmsSid ?? "";
        if (!messageSid) {
          // Not a message event — acknowledge silently
          return reply.code(200).send("");
        }

        const result = await handleTwilioWebhook({
          messageSid,
          messageStatus: body.SmsStatus ?? body.MessageStatus,
          body: body.Body,
          from: body.From,
          to: body.To,
        });

        if (!result.ok) {
          app.log.error({ error: result.error, request_id: requestId }, "twilio webhook processing failed");
        } else {
          app.log.info(
            { type: result.type, sid: messageSid, request_id: requestId },
            "twilio webhook processed",
          );

          // Notify CMS SSE clients about inbound messages or status updates
          if (result.type === "inbound") {
            cmsEvents.emitCms("message.new", {
              campaignId: result.message.campaign_id,
              contactId: result.message.contact_id,
              direction: "inbound",
              messageId: result.message.id,
            });
          } else if (result.type === "status_update") {
            // For status updates we need to look up the message to get campaign/contact
            try {
              const msgRow = await pool.query<{ contact_id: string; campaign_id: string }>(
                `SELECT contact_id, campaign_id FROM cms_twilio_messages WHERE twilio_sid = $1 LIMIT 1`,
                [result.sid],
              );
              if (msgRow.rows[0]) {
                cmsEvents.emitCms("message.status", {
                  campaignId: msgRow.rows[0].campaign_id,
                  contactId: msgRow.rows[0].contact_id,
                  twilioSid: result.sid,
                  status: result.status,
                });
              }
            } catch (err) {
              app.log.warn({ err, sid: result.sid }, "twilio webhook: failed to resolve message for SSE broadcast");
            }
          }
        }

        // Twilio expects empty 200 TwiML response or plain text
        reply.header("Content-Type", "text/xml");
        return reply.code(200).send("<Response></Response>");
      },
    );
  };
}
