import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createOrgNodeSchema, updateOrgNodeSchema } from "./schemas";

export function buildOrgHierarchyRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/org-hierarchy ──────────────────────────────────────
    app.post(
      "/api/org-hierarchy",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const parsed = createOrgNodeSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        const authed = request as AuthenticatedRequest;
        if (authed.userRole !== "admin" && !authed.campaignIds.includes(parsed.data.campaign_id)) {
          return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
        }

        try {
          const node = await repo.create(parsed.data);
          return reply.code(201).send({ ok: true, request_id: requestId, node });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "org hierarchy create failed");
          return reply.code(500).send(errorPayload(requestId, "ORG_CREATE_ERROR", "error creando nodo organizacional"));
        }
      },
    );

    // ── GET /api/org-hierarchy/campaign/:campaignId ──────────────────
    app.get(
      "/api/org-hierarchy/campaign/:campaignId",
      { preHandler: [app.authenticate, authorize({ roles: ["brigadista_zonal"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const hierarchy = await repo.getFullHierarchy(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, hierarchy });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "org hierarchy list failed");
          return reply.code(500).send(errorPayload(requestId, "ORG_LIST_ERROR", "error listando jerarquia"));
        }
      },
    );

    // ── GET /api/org-hierarchy/campaign/:campaignId/subordinates/:userId ─
    app.get(
      "/api/org-hierarchy/campaign/:campaignId/subordinates/:userId",
      { preHandler: [app.authenticate, authorize({ roles: ["brigadista_zonal"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId, userId } = request.params as { campaignId: string; userId: string };

        try {
          const subordinates = await repo.getSubordinates(userId, campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, subordinates });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "org subordinates failed");
          return reply.code(500).send(errorPayload(requestId, "ORG_SUBORDINATES_ERROR", "error obteniendo subordinados"));
        }
      },
    );

    // ── PUT /api/org-hierarchy/:id ──────────────────────────────────
    app.put(
      "/api/org-hierarchy/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        const parsed = updateOrgNodeSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const node = await repo.update(id, parsed.data);
          if (!node) {
            return reply.code(404).send(errorPayload(requestId, "ORG_NODE_NOT_FOUND", "nodo no encontrado"));
          }
          return reply.code(200).send({ ok: true, request_id: requestId, node });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "org hierarchy update failed");
          return reply.code(500).send(errorPayload(requestId, "ORG_UPDATE_ERROR", "error actualizando nodo"));
        }
      },
    );

    // ── DELETE /api/org-hierarchy/campaign/:campaignId/user/:userId ──
    app.delete(
      "/api/org-hierarchy/campaign/:campaignId/user/:userId",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId, userId } = request.params as { campaignId: string; userId: string };

        try {
          const removed = await repo.remove(campaignId, userId);
          if (!removed) {
            return reply.code(404).send(errorPayload(requestId, "ORG_NODE_NOT_FOUND", "nodo no encontrado"));
          }
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "org hierarchy remove failed");
          return reply.code(500).send(errorPayload(requestId, "ORG_REMOVE_ERROR", "error removiendo nodo"));
        }
      },
    );
  };
}
