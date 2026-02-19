import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
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
    // List contacts for CMS operators (nuevo + claimed by others shown as locked)
    app.get(
      "/api/cms/contacts",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const query = request.query as { status?: string; limit?: string; offset?: string };
          const status = query.status ?? "nuevo";
          const limit = Math.min(Number(query.limit) || 100, 500);
          const offset = Number(query.offset) || 0;

          if (status === "hablado") {
            // Only show contacts that THIS operator talked to
            const result = await repo.getHabladoByOperator(campaignId, authed.userId, limit, offset);
            return reply.code(200).send({ ok: true, request_id: requestId, ...result });
          }

          // Show nuevo + claimed contacts (claimed by others shown as locked)
          const result = await repo.getNuevosForCms(campaignId, authed.userId, limit, offset);
          return reply.code(200).send({ ok: true, request_id: requestId, ...result });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms contacts list failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_LIST_ERROR", "error listando contactos"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/claim ─────────────────────────────
    // Operator claims a contact (locks it for others)
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

          // Broadcast lock to all CMS clients in this campaign
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
    // Operator releases a claimed contact back to pool
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
    // Mark contact as talked to
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
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "contacto no encontrado o no es tuyo"));
          }

          broadcastToCampaign(result.campaign_id, "contact.hablado", {
            id,
            operator_id: authed.userId,
          });

          return reply.code(200).send({ ok: true, request_id: requestId, contact: result });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms hablado failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_HABLADO_ERROR", "error marcando como hablado"));
        }
      },
    );

    // ── PUT /api/cms/contacts/:id/notes ──────────────────────────────
    // Update operator notes (local_votacion, domicilio, comentarios)
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
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "contacto no encontrado o no es tuyo"));
          }

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
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const stats = await repo.getCmsStats(campaignId, authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId, stats });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "cms stats failed");
          return reply.code(500).send(errorPayload(requestId, "CMS_STATS_ERROR", "error obteniendo stats"));
        }
      },
    );

    // ── GET /api/cms/stream ─────────────────────────────────────────
    // SSE for real-time lock/unlock/hablado events
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

        // Send current claimed contacts as initial snapshot
        const claimed = await repo.getClaimedSnapshot(campaignId);
        writeSseEvent(reply.raw, "snapshot", { claimed });

        const cleanup = () => { clients.delete(clientId); };
        request.raw.on("close", cleanup);
        request.raw.on("end", cleanup);
        request.raw.on("error", cleanup);

        return reply;
      },
    );
  };
}
