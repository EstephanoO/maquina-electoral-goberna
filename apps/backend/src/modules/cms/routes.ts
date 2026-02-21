import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { pool } from "../../db";
import * as repo from "./repository";

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

export function buildCmsRoutes(_env: AppEnv): FastifyPluginAsync {
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

  return async (app) => {
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
          const query = request.query as { status?: string; limit?: string; offset?: string; search?: string };
          const status = query.status ?? "nuevo";
          const limit = Math.min(Number(query.limit) || 100, 500);
          const offset = Number(query.offset) || 0;
          const search = query.search ?? "";

          const result = await repo.listContacts(campaignId, status, limit, offset, search);
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
        const body = request.body as {
          local_votacion?: string;
          domicilio?: string;
          comentarios?: string;
        };

        try {
          const notes = {
            local_votacion: body.local_votacion ?? "",
            domicilio: body.domicilio ?? "",
            comentarios: body.comentarios ?? "",
          };

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
  };
}
