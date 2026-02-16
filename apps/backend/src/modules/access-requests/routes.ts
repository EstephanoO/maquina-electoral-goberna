import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createAccessRequestSchema, resolveAccessRequestSchema } from "./schemas";
import { findById as findCampaignById } from "../campaigns/repository";

export function buildAccessRequestsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/access-requests ───────────────────────────────────
    // Authenticated user requests access to a campaign.
    app.post(
      "/api/access-requests",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        const parsed = createAccessRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          // Verify campaign exists
          const campaign = await findCampaignById(parsed.data.campaign_id);
          if (!campaign) {
            return reply
              .code(404)
              .send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          const created = await repo.create(authed.userId, parsed.data.campaign_id);
          if (!created) {
            return reply
              .code(409)
              .send(errorPayload(requestId, "ACCESS_REQUEST_DUPLICATE", "ya existe una solicitud pendiente para esta campana"));
          }

          return reply.code(201).send({ ok: true, request_id: requestId, access_request: created });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "access request create failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "ACCESS_REQUEST_CREATE_ERROR", "error creando solicitud de acceso"));
        }
      },
    );

    // ── GET /api/access-requests/mine ───────────────────────────────
    // Authenticated user sees their own requests.
    app.get(
      "/api/access-requests/mine",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        try {
          const requests = await repo.findByUser(authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId, access_requests: requests });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "access requests mine failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "ACCESS_REQUEST_LIST_ERROR", "error listando solicitudes"));
        }
      },
    );

    // ── GET /api/access-requests ────────────────────────────────────
    // Admin lists all access requests. Optional ?status= filter.
    app.get(
      "/api/access-requests",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { status } = request.query as { status?: string };

        try {
          let requests: repo.AccessRequestRow[];

          if (status === "pending") {
            requests = await repo.listPending();
          } else {
            requests = await repo.listAll();
          }

          return reply.code(200).send({ ok: true, request_id: requestId, access_requests: requests });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "access requests list failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "ACCESS_REQUEST_LIST_ERROR", "error listando solicitudes"));
        }
      },
    );

    // ── PUT /api/access-requests/:requestId ─────────────────────────
    // Admin approves or rejects an access request.
    app.put(
      "/api/access-requests/:requestId",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { requestId: accessRequestId } = request.params as { requestId: string };

        const parsed = resolveAccessRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const resolved = await repo.resolve(
            accessRequestId,
            parsed.data.status,
            authed.userId,
            parsed.data.note,
            parsed.data.perm_tierra,
            parsed.data.perm_digital,
          );

          if (!resolved) {
            return reply
              .code(404)
              .send(errorPayload(requestId, "ACCESS_REQUEST_NOT_FOUND", "solicitud no encontrada o ya resuelta"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, access_request: resolved });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "access request resolve failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "ACCESS_REQUEST_RESOLVE_ERROR", "error resolviendo solicitud"));
        }
      },
    );
  };
}
