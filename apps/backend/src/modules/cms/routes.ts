import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";
import { z } from "zod";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { cmsEvents, type CmsMessageEvent, type CmsStatusUpdateEvent, type CmsExtensionMessageEvent } from "../../infra/cms-events";
import { pool } from "../../db";
import * as repo from "./repository";
import { buildCmsChatWsRoutes } from "./ws-chat";

// ── Schemas ─────────────────────────────────────────────────────────

const signalFlagsSchema = z.object({
  responde: z.boolean().optional(),
  hace_pregunta: z.boolean().optional(),
  pide_informacion: z.boolean().optional(),
  comparte_ubicacion: z.boolean().optional(),
  deja_en_visto: z.boolean().optional(),
  bloquea: z.boolean().optional(),
});

const updateNotesSchema = z.object({
  local_votacion: z.string().max(500).optional().default(""),
  domicilio: z.string().max(500).optional().default(""),
  comentarios: z.string().max(2000).optional().default(""),
  signal_flags: signalFlagsSchema.optional().default({}),
  signal_score: z.number().int().min(-200).max(200).optional().default(0),
  vote_tier: z.enum(["contacto_basura", "voto_blando", "voto_duro"]).optional().default("contacto_basura"),
});

// ── SSE helpers ─────────────────────────────────────────────────────

type CmsClient = {
  res: ServerResponse;
  userId: string;
  campaignId: string;
};

let clientSeq = 0;
const clients = new Map<number, CmsClient>();

function writeSseEvent(res: ServerResponse, event: string, payload: unknown): boolean {
  try {
    const okEvent = res.write(`event: ${event}\n`);
    const okData = res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return okEvent && okData;
  } catch {
    return false;
  }
}

function broadcastToCampaign(campaignId: string, event: string, payload: unknown): void {
  const toPrune: number[] = [];
  for (const [id, client] of clients.entries()) {
    if (client.campaignId !== campaignId) continue;
    const ok = writeSseEvent(client.res, event, payload);
    if (!ok) toPrune.push(id);
  }
  for (const id of toPrune) {
    const c = clients.get(id);
    if (c) {
      try { c.res.end(); } catch { /* noop */ }
      clients.delete(id);
    }
  }
}

/**
 * After a mutation, resolve claimed_by_email via a lightweight query
 * so the SSE payload includes operator attribution.
 */
async function resolveOperatorEmail(userId: string): Promise<string> {
  try {
    const { rows } = await pool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [userId],
    );
    return rows[0]?.email ?? "";
  } catch {
    return "";
  }
}

// ── Routes ──────────────────────────────────────────────────────────

export function buildCmsRoutes(env: AppEnv): FastifyPluginAsync {
  // Heartbeat for SSE
  const heartbeatTimer = setInterval(() => {
    for (const [id, client] of clients.entries()) {
      const ok = writeSseEvent(client.res, "heartbeat", { ts: Date.now() });
      if (!ok) {
        try { client.res.end(); } catch { /* noop */ }
        clients.delete(id);
      }
    }
  }, 25_000);
  heartbeatTimer.unref();

  // ── Event bus subscriptions ─────────────────────────────────────
  // Listen for cross-module events (e.g. Twilio inbound messages)
  // and broadcast them to SSE clients of the matching campaign.
  cmsEvents.onCms("message.new", (payload: CmsMessageEvent) => {
    broadcastToCampaign(payload.campaignId, "message.new", {
      contact_id: payload.contactId,
      direction: payload.direction,
      message_id: payload.messageId,
    });
  });

  cmsEvents.onCms("message.status", (payload: CmsStatusUpdateEvent) => {
    broadcastToCampaign(payload.campaignId, "message.status", {
      contact_id: payload.contactId,
      twilio_sid: payload.twilioSid,
      status: payload.status,
    });
  });

  cmsEvents.onCms("extension.message_received", (payload: CmsExtensionMessageEvent) => {
    broadcastToCampaign(payload.campaignId, "extension.message_received", {
      contact_id: payload.contactId,
      phone: payload.phone,
      preview: payload.preview,
      detected_at: payload.detectedAt,
      operator_id: payload.operatorId,
    });
  });

  return async (app) => {
    // Register WebSocket chat routes for real-time WhatsApp messages
    app.register(buildCmsChatWsRoutes(env));

    // ── GET /api/cms/contacts ───────────────────────────────────────
    app.get(
      "/api/cms/contacts",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const query = request.query as { status?: string; limit?: string; offset?: string; search?: string; tag?: string };
          const status = query.status ?? "nuevo";
          const limit = Math.min(Number(query.limit) || 100, 500);
          const offset = Number(query.offset) || 0;
          const search = query.search ?? "";
          const tag = query.tag ?? "";

          const result = await repo.listContacts(campaignId, status, limit, offset, search, tag);
          return reply.code(200).send({ ok: true, request_id: requestId, ...result });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms contacts list failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_LIST_ERROR", "error listando contactos"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/claim ─────────────────────────────
    // @deprecated — kept for backwards compat (mobile etc)
    app.put(
      "/api/cms/contacts/:id/claim",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const result = await repo.claimContact(id, authed.userId);
          if (!result) {
            return reply.code(409).send(errorPayload(requestId, "ALREADY_CLAIMED", "contacto ya tomado por otra operadora"));
          }

          broadcastToCampaign(result.campaign_id, "contact.claimed", {
            id,
            claimed_by: authed.userId,
            claimed_by_name: authed.userEmail,
          });

          return reply.code(200).send({ ok: true, request_id: requestId, contact: result });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms claim failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_CLAIM_ERROR", "error reclamando contacto"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/release ────────────────────────────
    // @deprecated — kept for backwards compat
    app.put(
      "/api/cms/contacts/:id/release",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const result = await repo.releaseContact(id, authed.userId);
          if (!result) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "contacto no encontrado o no es tuyo"));
          }

          broadcastToCampaign(result.campaign_id, "contact.released", { id });

          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms release failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_RELEASE_ERROR", "error liberando contacto"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/hablado ───────────────────────────
    app.put(
      "/api/cms/contacts/:id/hablado",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const result = await repo.markHablado(id, authed.userId);
          if (!result) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "contacto no encontrado"));
          }

          // Resolve operator email and stats in parallel
          const [operatorEmail, stats] = await Promise.all([
            resolveOperatorEmail(authed.userId),
            repo.getCmsStats(result.campaign_id),
          ]);

          // Broadcast full contact so all operators can update their view
          broadcastToCampaign(result.campaign_id, "contact.updated", {
            contact: { ...result, claimed_by_email: operatorEmail },
            previous_status: "nuevo",
            operator_id: authed.userId,
            operator_email: operatorEmail,
            stats,
          });

          return reply.code(200).send({ ok: true, request_id: requestId, contact: result });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms hablado failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_HABLADO_ERROR", "error marcando como hablado"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/respondieron ─────────────────────
    app.put(
      "/api/cms/contacts/:id/respondieron",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const result = await repo.markRespondieron(id, authed.userId);
          if (!result) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "contacto no encontrado"));
          }

          // Resolve operator email and stats in parallel
          const [operatorEmail, stats] = await Promise.all([
            resolveOperatorEmail(authed.userId),
            repo.getCmsStats(result.campaign_id),
          ]);

          broadcastToCampaign(result.campaign_id, "contact.updated", {
            contact: { ...result, claimed_by_email: operatorEmail },
            previous_status: "hablado",
            operator_id: authed.userId,
            operator_email: operatorEmail,
            stats,
          });

          return reply.code(200).send({ ok: true, request_id: requestId, contact: result });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms respondieron failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_RESPONDIERON_ERROR", "error marcando como respondieron"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/revert ──────────────────────────────
    app.put(
      "/api/cms/contacts/:id/revert",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          // Atomic: CTE captures previous_status and guards on it
          const result = await repo.revertContact(id, authed.userId);
          if (!result) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "contacto no encontrado o no se puede revertir"));
          }

          const { previous_status: previousStatus, ...contact } = result;

          // Resolve operator emails and stats in parallel
          const [operatorEmail, actorEmail, stats] = await Promise.all([
            contact.cms_claimed_by ? resolveOperatorEmail(contact.cms_claimed_by) : Promise.resolve(""),
            resolveOperatorEmail(authed.userId),
            repo.getCmsStats(contact.campaign_id),
          ]);

          broadcastToCampaign(contact.campaign_id, "contact.updated", {
            contact: { ...contact, claimed_by_email: operatorEmail },
            previous_status: previousStatus,
            operator_id: authed.userId,
            operator_email: actorEmail,
            stats,
          });

          return reply.code(200).send({ ok: true, request_id: requestId, contact });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms revert failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_REVERT_ERROR", "error revirtiendo contacto"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/archive ────────────────────────────
    app.put(
      "/api/cms/contacts/:id/archive",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          // Atomic: CTE captures previous_status and guards against double-archive
          const result = await repo.archiveContact(id, authed.userId);
          if (!result) {
            return reply.code(409).send(errorPayload(requestId, "ALREADY_ARCHIVED", "contacto ya archivado o no encontrado"));
          }

          const { previous_status: previousStatus, ...contact } = result;

          // Resolve operator email and stats in parallel
          const [operatorEmail, stats] = await Promise.all([
            resolveOperatorEmail(authed.userId),
            repo.getCmsStats(contact.campaign_id),
          ]);

          broadcastToCampaign(contact.campaign_id, "contact.updated", {
            contact: { ...contact, claimed_by_email: operatorEmail },
            previous_status: previousStatus,
            operator_id: authed.userId,
            operator_email: operatorEmail,
            stats,
          });

          return reply.code(200).send({ ok: true, request_id: requestId, contact });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms archive failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_ARCHIVE_ERROR", "error archivando contacto"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/notes ──────────────────────────────
    app.put(
      "/api/cms/contacts/:id/notes",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const parsed = updateNotesSchema.safeParse(request.body);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((e) => e.message).join("; ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", msg));
        }

        try {
          const notes = parsed.data;

          const result = await repo.updateNotes(id, authed.userId, notes);
          if (!result) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "contacto no encontrado"));
          }

          // Broadcast notes update so all operators see the change
          const operatorEmail = await resolveOperatorEmail(authed.userId);
          broadcastToCampaign(result.campaign_id, "contact.notes_updated", {
            contact: { ...result, claimed_by_email: operatorEmail },
            operator_id: authed.userId,
            operator_email: operatorEmail,
          });

          return reply.code(200).send({ ok: true, request_id: requestId, contact: result });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms notes update failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_NOTES_ERROR", "error actualizando notas"));
        }
      },
    );

    // ── GET /api/cms/tags ──────────────────────────────────────────
    // List all distinct tags used in the campaign
    app.get(
      "/api/cms/tags",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const tags = await repo.getCampaignTags(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, tags });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms tags list failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_TAGS_ERROR", "error listando etiquetas"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/tags ──────────────────────────────
    // Set tags on a contact (replaces existing)
    const setTagsSchema = z.object({
      tags: z.array(z.string().min(1).max(32)).max(20),
    });

    app.put(
      "/api/cms/contacts/:id/tags",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const parsed = setTagsSchema.safeParse(request.body);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((e) => e.message).join("; ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", msg));
        }

        try {
          const result = await repo.setContactTags(id, parsed.data.tags);
          if (!result) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "contacto no encontrado"));
          }

          // Broadcast to all SSE clients
          const operatorEmail = await resolveOperatorEmail(authed.userId);
          broadcastToCampaign(result.campaign_id, "contact.tags_updated", {
            contact: { ...result, claimed_by_email: operatorEmail },
            operator_id: authed.userId,
            operator_email: operatorEmail,
          });

          return reply.code(200).send({ ok: true, request_id: requestId, contact: result });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms set tags failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_TAGS_ERROR", "error actualizando etiquetas"));
        }
      },
    );

    // ── GET /api/cms/stats ──────────────────────────────────────────
    app.get(
      "/api/cms/stats",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const stats = await repo.getCmsStats(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, stats });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms stats failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_STATS_ERROR", "error obteniendo stats"));
        }
      },
    );

    // ── GET /api/cms/metrics ────────────────────────────────────────
    app.get(
      "/api/cms/metrics",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        try {
          // If an explicit x-campaign-id header is sent, scope to that single campaign
          // (even for admins). Otherwise fall back to JWT-based scoping.
          const headerCampaignId =
            typeof request.headers["x-campaign-id"] === "string" && request.headers["x-campaign-id"].length > 0
              ? request.headers["x-campaign-id"]
              : null;

          const campaignScope = headerCampaignId
            ? [headerCampaignId]
            : authed.userRole === "admin"
              ? null
              : authed.campaignIds;

          const [campaigns, operators, timeMetrics] = await Promise.all([
            repo.getCmsMetricsByCampaign(campaignScope),
            repo.getCmsMetricsByOperator(campaignScope),
            repo.getTimeMetrics(campaignScope),
          ]);

          const globalTotals = campaigns.reduce(
            (acc, c) => ({
              total: acc.total + c.total,
              nuevos: acc.nuevos + c.nuevos,
              hablados: acc.hablados + c.hablados,
              respondieron: acc.respondieron + c.respondieron,
              archivados: acc.archivados + c.archivados,
            }),
            { total: 0, nuevos: 0, hablados: 0, respondieron: 0, archivados: 0 },
          );

          const contacted = globalTotals.hablados + globalTotals.respondieron;
          const globalRates = {
            contact_rate: globalTotals.total > 0
              ? Math.round((contacted / globalTotals.total) * 100) / 100
              : 0,
            response_rate: contacted > 0
              ? Math.round((globalTotals.respondieron / contacted) * 100) / 100
              : 0,
          };

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            metrics: {
              campaigns,
              operators,
              global_totals: { ...globalTotals, ...globalRates },
              time_metrics: timeMetrics,
            },
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms metrics failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_METRICS_ERROR", "error obteniendo metricas CMS"));
        }
      },
    );

    // ── GET /api/cms/metrics/brigadistas ──────────────────────────────
    // Per-brigadista (field agent) capture metrics with CMS pipeline progression.
    // Used by the tierra dashboard to show how each agent's captured data
    // flows through the CMS pipeline (nuevo → hablado → respondieron → archivado).
    // Dedup: first-write-wins on phone number.
    app.get(
      "/api/cms/metrics/brigadistas",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const query = request.query as { from?: string; to?: string };
          const from = query.from && !isNaN(Date.parse(query.from)) ? query.from : undefined;
          const to = query.to && !isNaN(Date.parse(query.to)) ? query.to : undefined;

          const brigadistas = await repo.getMetricsByBrigadista(campaignId, from, to);
          return reply.code(200).send({ ok: true, request_id: requestId, brigadistas });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms brigadista metrics failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_BRIGADISTA_METRICS_ERROR", "error obteniendo metricas de brigadistas"));
        }
      },
    );

    // ── GET /api/cms/stream ─────────────────────────────────────────
    // SSE for real-time contact updates across all operators
    app.get(
      "/api/cms/stream",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(String(request.id), "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        reply.raw.statusCode = 200;
        reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
        reply.raw.setHeader("Connection", "keep-alive");
        reply.raw.setHeader("X-Accel-Buffering", "no");

        // CORS headers for SSE — reply.raw bypasses @fastify/cors plugin
        const origin = request.headers.origin;
        if (origin) {
          reply.raw.setHeader("Access-Control-Allow-Origin", origin);
          reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
        }

        reply.raw.flushHeaders?.();

        const clientId = ++clientSeq;
        clients.set(clientId, {
          res: reply.raw,
          userId: authed.userId,
          campaignId,
        });

        reply.raw.write("retry: 5000\n\n");

        // Send connected confirmation
        writeSseEvent(reply.raw, "connected", { ts: Date.now() });

        const cleanup = () => { clients.delete(clientId); };
        request.raw.on("close", cleanup);
        request.raw.on("end", cleanup);
        request.raw.on("error", cleanup);

        return reply;
      },
    );

    // ── POST /api/cms/extension-event ──────────────────────────────────
    // Receives inbound-message events detected by the Chrome extension
    // via DOM observation on WhatsApp Web. Matches phone → contact,
    // optionally auto-transitions hablado → respondieron, and broadcasts
    // the event via SSE to all campaign operators.
    const extensionEventSchema = z.object({
      type: z.enum(["message_received"]),
      phone: z.string().min(7).max(20),
      preview: z.string().max(500).optional().default(""),
      detected_at: z.number().optional(),
    });

    app.post(
      "/api/cms/extension-event",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { userId } = request as AuthenticatedRequest;
        const campaignId = (request as AuthenticatedRequest).activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        const parsed = extensionEventSchema.safeParse(request.body);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((e) => e.message).join("; ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", msg));
        }

        const { type, phone, preview, detected_at } = parsed.data;

        // Find the contact by phone
        const contact = await repo.findContactByPhone(campaignId, phone);
        if (!contact) {
          // Not an error — the contact might not exist in this campaign
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            matched: false,
            message: "No contact found for this phone in campaign",
          });
        }

        app.log.info(
          { contact_id: contact.id, phone, type, preview: preview.slice(0, 50), operator: userId },
          "extension event received",
        );

        // Auto-transition: if contact is "hablado" and we detect an incoming reply,
        // automatically mark as "respondieron"
        let autoTransitioned = false;
        let updatedContact = contact;
        if (type === "message_received" && contact.cms_status === "hablado") {
          const transitioned = await repo.markRespondieron(contact.id, userId);
          if (transitioned) {
            autoTransitioned = true;
            updatedContact = transitioned;

            // Broadcast contact.updated SSE (same as manual respondieron)
            const operatorEmail = await resolveOperatorEmail(userId);
            const stats = await repo.getCmsStats(campaignId);
            broadcastToCampaign(campaignId, "contact.updated", {
              contact: updatedContact,
              previous_status: "hablado",
              operator_id: userId,
              operator_email: operatorEmail,
              stats,
              auto_transition: true,
              source: "extension",
            });
          }
        }

        // Broadcast the extension event for real-time dashboard updates
        cmsEvents.emitCms("extension.message_received", {
          campaignId,
          contactId: contact.id,
          phone,
          preview,
          detectedAt: detected_at ?? Date.now(),
          operatorId: userId,
        });

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          matched: true,
          contact_id: contact.id,
          contact_name: contact.nombre,
          contact_status: updatedContact.cms_status,
          auto_transitioned: autoTransitioned,
        });
      },
    );

    // ── POST /api/cms/contacts/public ───────────────────────────────────
    // Public endpoint (no auth) — creates a contact for a campaign by slug.
    // Designed for external integrations / frontends that don't have JWT.
    const publicContactSchema = z.object({
      campaign_slug: z.string().min(1, "campaign_slug es requerido"),
      nombre: z.string().min(1, "nombre es requerido").max(200),
      telefono: z.string().min(6, "telefono es requerido").max(20),
      zona: z.string().max(200).optional().default(""),
      distrito: z.string().max(200).optional().default(""),
      comentarios: z.string().max(2000).optional().default(""),
    });

    app.post(
      "/api/cms/contacts/public",
      async (request, reply) => {
        const requestId = String(request.id);

        const parsed = publicContactSchema.safeParse(request.body);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((e) => e.message).join("; ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", msg));
        }

        const { campaign_slug, nombre, telefono, zona, distrito, comentarios } = parsed.data;

        // Resolve campaign by slug
        const campaignRes = await pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM campaigns WHERE slug = $1 LIMIT 1`,
          [campaign_slug],
        );

        if (campaignRes.rows.length === 0) {
          return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", `Campaña '${campaign_slug}' no encontrada`));
        }

        const campaign = campaignRes.rows[0]!;

        // Check for duplicate phone in same campaign
        const dupeRes = await pool.query<{ id: string }>(
          `SELECT id FROM form_submissions
           WHERE campaign_id = $1 AND data->>'telefono' = $2 AND deleted_at IS NULL
           LIMIT 1`,
          [campaign.id, telefono.replace(/[^\d]/g, "")],
        );

        if (dupeRes.rows.length > 0) {
          return reply.code(409).send(errorPayload(requestId, "DUPLICATE", `Ya existe un contacto con teléfono ${telefono} en esta campaña`));
        }

        // Insert contact
        const cleanPhone = telefono.replace(/[^\d]/g, "");
        const data: Record<string, string> = { nombre, telefono: cleanPhone };
        if (zona) data.zona = zona;
        if (distrito) data.distrito = distrito;
        if (comentarios) data.comentarios = comentarios;

        const insertRes = await pool.query<{ id: string; created_at: string }>(
          `INSERT INTO form_submissions (campaign_id, data, client_id, cms_status)
           VALUES ($1, $2, $3, 'nuevo')
           RETURNING id, created_at`,
          [campaign.id, JSON.stringify(data), `public-api-${Date.now()}`],
        );

        const contact = insertRes.rows[0]!;

        app.log.info(
          { contact_id: contact.id, campaign: campaign_slug, phone: cleanPhone, request_id: requestId },
          "public contact created",
        );

        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          contact: {
            id: contact.id,
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            nombre,
            telefono: cleanPhone,
            cms_status: "nuevo",
            created_at: contact.created_at,
          },
        });
      },
    );
  };
}
