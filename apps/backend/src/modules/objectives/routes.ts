/**
 * Objectives Routes
 * API endpoints for managing zone and user objectives
 */

import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import * as schemas from "./schemas";

export function buildObjectivesRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ═══════════════════════════════════════════════════════════════════════
    // Zone Objectives
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * GET /api/objectives/zones
     * List all zone objectives for the active campaign
     */
    app.get(
      "/api/objectives/zones",
      { preHandler: [app.authenticate, authorize({ roles: ["brigadista_zonal"], requireCampaign: true })] },
      async (request, reply) => {
        const campaignId = request.activeCampaignId!;
        const zones = await repo.listZoneObjectives(campaignId);
        return reply.send({ ok: true, request_id: String(request.id), zones });
      }
    );

    /**
     * PUT /api/objectives/zones/:region
     * Create or update a zone objective
     */
    app.put(
      "/api/objectives/zones/:region",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const authed = request as unknown as AuthenticatedRequest;
        const campaignId = request.activeCampaignId!;
        const { region } = request.params as { region: string };
        
        const parsed = schemas.upsertZoneObjectiveSchema.safeParse({
          ...(request.body as object),
          region: decodeURIComponent(region),
        });
        
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(String(request.id), "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input")
          );
        }

        const objective = await repo.upsertZoneObjective({
          campaign_id: campaignId,
          region: parsed.data.region,
          target_forms: parsed.data.target_forms,
          description: parsed.data.description,
          created_by: authed.userId,
        });

        return reply.send({ ok: true, request_id: String(request.id), objective });
      }
    );

    /**
     * POST /api/objectives/zones/bulk
     * Bulk create/update zone objectives
     */
    app.post(
      "/api/objectives/zones/bulk",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const authed = request as unknown as AuthenticatedRequest;
        const campaignId = request.activeCampaignId!;
        
        const parsed = schemas.bulkUpsertZoneObjectivesSchema.safeParse(request.body);
        
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(String(request.id), "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input")
          );
        }

        const objectives = await repo.bulkUpsertZoneObjectives(
          campaignId,
          parsed.data.objectives,
          authed.userId
        );

        return reply.send({ 
          ok: true, 
          request_id: String(request.id), 
          objectives,
          count: objectives.length,
        });
      }
    );

    /**
     * DELETE /api/objectives/zones/:region
     * Delete a zone objective
     */
    app.delete(
      "/api/objectives/zones/:region",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const campaignId = request.activeCampaignId!;
        const { region } = request.params as { region: string };
        
        const deleted = await repo.deleteZoneObjective(campaignId, decodeURIComponent(region));
        
        if (!deleted) {
          return reply.code(404).send(
            errorPayload(String(request.id), "NOT_FOUND", "Zone objective not found")
          );
        }

        return reply.send({ ok: true, request_id: String(request.id), deleted: true });
      }
    );

    // ═══════════════════════════════════════════════════════════════════════
    // User Objectives
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * GET /api/objectives/users
     * Get effective objectives for all users in the campaign
     */
    app.get(
      "/api/objectives/users",
      { preHandler: [app.authenticate, authorize({ roles: ["brigadista_zonal"], requireCampaign: true })] },
      async (request, reply) => {
        const campaignId = request.activeCampaignId!;
        const users = await repo.getUserEffectiveObjectives(campaignId);
        return reply.send({ ok: true, request_id: String(request.id), users });
      }
    );

    /**
     * PUT /api/objectives/users/:userId
     * Set or clear a user objective override
     */
    app.put(
      "/api/objectives/users/:userId",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const campaignId = request.activeCampaignId!;
        const { userId } = request.params as { userId: string };
        
        const parsed = schemas.setUserObjectiveSchema.safeParse({
          ...(request.body as object),
          user_id: userId,
        });
        
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(String(request.id), "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input")
          );
        }

        // If target_forms is null, clear the override
        if (parsed.data.target_forms === null) {
          await repo.clearUserObjective(campaignId, userId);
          return reply.send({ ok: true, request_id: String(request.id), cleared: true });
        }

        const objective = await repo.setUserObjective({
          campaign_id: campaignId,
          user_id: userId,
          target_forms: parsed.data.target_forms,
          notes: parsed.data.notes,
        });

        return reply.send({ ok: true, request_id: String(request.id), objective });
      }
    );

    // ═══════════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * GET /api/objectives/summary
     * Get overall objectives progress summary
     */
    app.get(
      "/api/objectives/summary",
      { preHandler: [app.authenticate, authorize({ roles: ["brigadista_zonal"], requireCampaign: true })] },
      async (request, reply) => {
        const campaignId = request.activeCampaignId!;
        const summary = await repo.getObjectivesSummary(campaignId);
        return reply.send({ ok: true, request_id: String(request.id), ...summary });
      }
    );
  };
}
