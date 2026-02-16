import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createCampaignSchema, updateCampaignSchema } from "./schemas";

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "supervisor", "agent"]),
});

export function buildCampaignsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── GET /api/candidates ──────────────────────────────────────────
    // Public endpoint for registration flow — lists active candidates
    app.get("/api/candidates", async (request, reply) => {
      const requestId = String(request.id);
      try {
        const campaigns = await repo.listActive();
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          candidates: campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            cargo: c.cargo,
            numero: c.numero,
            partido: c.partido,
            foto_url: c.foto_url,
          })),
        });
      } catch (error) {
        app.log.error({ err: error, request_id: requestId }, "candidates list failed");
        return reply.code(500).send(errorPayload(requestId, "CANDIDATES_LIST_ERROR", "error listando candidatos"));
      }
    });

    // ── GET /api/campaigns ────────────────────────────────────────────
    app.get(
      "/api/campaigns",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        try {
          if (authed.userRole === "admin") {
            const campaigns = await repo.listAll();
            return reply.code(200).send({ ok: true, request_id: requestId, campaigns });
          }

          const campaigns = await repo.listForUser(authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId, campaigns });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaigns list failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGNS_LIST_ERROR", "error listando campanas"));
        }
      },
    );

    // ── POST /api/campaigns ───────────────────────────────────────────
    app.post(
      "/api/campaigns",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);

        const parsed = createCampaignSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const existing = await repo.findBySlug(parsed.data.slug);
          if (existing) {
            return reply.code(409).send(errorPayload(requestId, "CAMPAIGN_SLUG_EXISTS", "slug ya existe"));
          }

          const campaign = await repo.create(parsed.data);
          return reply.code(201).send({ ok: true, request_id: requestId, campaign });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign create failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_CREATE_ERROR", "error creando campana"));
        }
      },
    );

    // ── GET /api/campaigns/:campaignId ────────────────────────────────
    app.get(
      "/api/campaigns/:campaignId",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, campaign });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign get failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_GET_ERROR", "error obteniendo campana"));
        }
      },
    );

    // ── PUT /api/campaigns/:campaignId ────────────────────────────────
    app.put(
      "/api/campaigns/:campaignId",
      { preHandler: [app.authenticate, authorize({ roles: ["admin", "supervisor"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        const parsed = updateCampaignSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const campaign = await repo.update(campaignId, parsed.data);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, campaign });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign update failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_UPDATE_ERROR", "error actualizando campana"));
        }
      },
    );

    // ── POST /api/campaigns/:campaignId/members ───────────────────────
    app.post(
      "/api/campaigns/:campaignId/members",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        const parsed = addMemberSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          await repo.addUserToCampaign(parsed.data.user_id, campaignId, parsed.data.role);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign add member failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_MEMBER_ERROR", "error agregando miembro"));
        }
      },
    );

    // ── DELETE /api/campaigns/:campaignId/members/:userId ─────────────
    app.delete(
      "/api/campaigns/:campaignId/members/:userId",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId, userId } = request.params as { campaignId: string; userId: string };

        try {
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          await repo.removeUserFromCampaign(userId, campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign remove member failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_MEMBER_ERROR", "error removiendo miembro"));
        }
      },
    );
  };
}
