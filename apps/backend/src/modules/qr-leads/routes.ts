import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { recordScanSchema } from "./schemas";
import * as repo from "./repository";

export function buildQrLeadsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    await repo.ensureQrLeadsTable();

    // ──────────────────────────────────────────────────────────────────
    // POST /api/qr-leads/scan
    // Mobile calls this when the brigadista shows their QR and someone
    // taps "Contactado" or when the app self-registers a scan event.
    // brigadista_id = JWT userId. campaign_id = x-campaign-id header.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/qr-leads/scan",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req       = request as AuthenticatedRequest;
        const requestId = String(request.id);

        const parsed = recordScanSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload inválido")
          );
        }

        const campaignId   = req.activeCampaignId!;
        const brigadistaId = req.userId!;

        try {
          const lead = await repo.recordScan({
            campaign_id:   campaignId,
            brigadista_id: brigadistaId,
            phone:         parsed.data.phone,
            message_text:  parsed.data.message_text,
            scan_source:   parsed.data.scan_source,
            user_agent:    request.headers["user-agent"] ?? null,
          });

          app.log.info({ campaignId, brigadistaId }, "[qr-leads] scan recorded");

          return reply.code(201).send({
            ok:         true,
            request_id: requestId,
            id:         lead.id,
            scanned_at: lead.scanned_at,
          });
        } catch (err) {
          app.log.error({ err }, "[qr-leads] recordScan failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al registrar el scan")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/qr-leads/my-stats
    // Returns total / today / this_week scan counts for the authenticated
    // brigadista in their active campaign.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/qr-leads/my-stats",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req       = request as AuthenticatedRequest;
        const requestId = String(request.id);

        const campaignId   = req.activeCampaignId!;
        const brigadistaId = req.userId!;

        try {
          const stats = await repo.getMyStats(brigadistaId, campaignId);
          return reply.code(200).send({
            ok:         true,
            request_id: requestId,
            stats,
          });
        } catch (err) {
          app.log.error({ err }, "[qr-leads] getMyStats failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener estadísticas")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/qr-leads/leaderboard
    // Campaign-level leaderboard. candidato+ only.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/qr-leads/leaderboard",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["candidato"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req       = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        try {
          const leaderboard = await repo.getCampaignLeaderboard(campaignId);
          return reply.code(200).send({
            ok:          true,
            request_id:  requestId,
            leaderboard,
          });
        } catch (err) {
          app.log.error({ err }, "[qr-leads] leaderboard failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener leaderboard")
          );
        }
      }
    );
  };
}
