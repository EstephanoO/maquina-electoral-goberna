/**
 * GOBERNA — Analytics Routes
 * Endpoints for managing campaign GA4 analytics data.
 */

import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import * as campaignRepo from "../campaigns/repository";
import { saveAnalyticsSchema } from "./schemas";

export function buildAnalyticsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/campaigns/:campaignId/analytics ─────────────────────
    // Save GA4 analytics data for a campaign (admin or jefe_campana)
    app.post(
      "/api/campaigns/:campaignId/analytics",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        const parsed = saveAnalyticsSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          // Verify campaign exists
          const campaign = await campaignRepo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          // Save analytics data
          const analytics = await repo.save(campaignId, parsed.data.data);

          // Mark campaign as having GA4 data
          await repo.markCampaignHasGA4(campaignId, true);

          app.log.info({ campaign_id: campaignId, request_id: requestId }, "GA4 analytics saved");

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            analytics: {
              id: analytics.id,
              campaign_id: analytics.campaign_id,
              date_start: analytics.date_start,
              date_end: analytics.date_end,
              created_at: analytics.created_at,
              updated_at: analytics.updated_at,
            },
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "analytics save failed");
          return reply.code(500).send(errorPayload(requestId, "ANALYTICS_SAVE_ERROR", "error guardando analytics"));
        }
      },
    );

    // ── GET /api/campaigns/:campaignId/analytics ──────────────────────
    // Get GA4 analytics data for a campaign
    app.get(
      "/api/campaigns/:campaignId/analytics",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const analytics = await repo.findByCampaignId(campaignId);
          if (!analytics) {
            return reply.code(404).send(errorPayload(requestId, "ANALYTICS_NOT_FOUND", "no hay datos de analytics"));
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            analytics,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "analytics get failed");
          return reply.code(500).send(errorPayload(requestId, "ANALYTICS_GET_ERROR", "error obteniendo analytics"));
        }
      },
    );

    // ── GET /api/analytics/by-slug/:slug ──────────────────────────────
    // Get GA4 analytics data by campaign slug (for digital page)
    app.get(
      "/api/analytics/by-slug/:slug",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { slug } = request.params as { slug: string };

        try {
          // First get campaign to check access
          const campaign = await campaignRepo.findBySlug(slug);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          // Check access (admin can see all, others must belong to campaign)
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(campaign.id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          const analytics = await repo.findByCampaignSlug(slug);
          if (!analytics) {
            return reply.code(404).send(errorPayload(requestId, "ANALYTICS_NOT_FOUND", "no hay datos de analytics"));
          }

          // Include campaign info for the digital page
          const config = (campaign.config ?? {}) as { color_primario?: string; color_secundario?: string };

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            campaign: {
              id: campaign.id,
              name: campaign.name,
              slug: campaign.slug,
              cargo: campaign.cargo,
              numero: campaign.numero,
              partido: campaign.partido,
              foto_url: campaign.foto_url,
              color_primario: config.color_primario ?? "#1e40af",
              color_secundario: config.color_secundario ?? "#fbbf24",
            },
            analytics: analytics.data,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "analytics by slug failed");
          return reply.code(500).send(errorPayload(requestId, "ANALYTICS_GET_ERROR", "error obteniendo analytics"));
        }
      },
    );

    // ── DELETE /api/campaigns/:campaignId/analytics ───────────────────
    // Delete GA4 analytics data (admin only)
    app.delete(
      "/api/campaigns/:campaignId/analytics",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const deleted = await repo.deleteByCampaignId(campaignId);
          if (!deleted) {
            return reply.code(404).send(errorPayload(requestId, "ANALYTICS_NOT_FOUND", "no hay datos de analytics"));
          }

          // Mark campaign as not having GA4 data
          await repo.markCampaignHasGA4(campaignId, false);

          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "analytics delete failed");
          return reply.code(500).send(errorPayload(requestId, "ANALYTICS_DELETE_ERROR", "error eliminando analytics"));
        }
      },
    );
  };
}
