import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createAccessRequestSchema, resolveAccessRequestSchema } from "./schemas";
import { findById as findCampaignById } from "../campaigns/repository";

/**
 * Transform AccessRequestRow to mobile-friendly format.
 * Maps user_full_name -> full_name, user_email -> email, requested_at -> created_at
 */
function toMobileFormat(row: repo.AccessRequestRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    campaign_id: row.campaign_id,
    status: row.status,
    full_name: row.user_full_name ?? "",
    email: row.user_email ?? "",
    created_at: row.requested_at?.toISOString() ?? new Date().toISOString(),
    // Include extra fields that might be useful
    campaign_name: row.campaign_name,
  };
}

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

          const created = await repo.create(
            authed.userId,
            parsed.data.campaign_id,
            parsed.data.perm_tierra,
            parsed.data.perm_digital,
          );
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

    // ── GET /api/access-requests/pending ────────────────────────────
    // Consultor+ lists pending access requests.
    // Admins see all, others see only their campaigns.
    app.get(
      "/api/access-requests/pending",
      { preHandler: [app.authenticate, authorize({ roles: ["consultor"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        try {
          let requests: repo.AccessRequestRow[];

          if (authed.userRole === "admin") {
            // Admins see all pending requests
            requests = await repo.listPending();
          } else {
            // Consultors/jefes see only requests for their campaigns
            requests = await repo.listPendingByCampaigns(authed.campaignIds);
          }

          return reply.code(200).send({ 
            ok: true, 
            request_id: requestId, 
            pending_requests: requests.map(toMobileFormat),
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "access requests pending list failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "ACCESS_REQUEST_LIST_ERROR", "error listando solicitudes pendientes"));
        }
      },
    );

    // ── GET /api/access-requests ────────────────────────────────────
    // Admin/Supervisor lists access requests. Optional ?status= filter.
    // Supervisors see only their campaigns.
    app.get(
      "/api/access-requests",
      { preHandler: [app.authenticate, authorize({ roles: ["consultor"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { status } = request.query as { status?: string };

        try {
          let requests: repo.AccessRequestRow[];

          if (authed.userRole === "admin") {
            // Admins see all
            if (status === "pending") {
              requests = await repo.listPending();
            } else {
              requests = await repo.listAll();
            }
          } else {
            // Consultors/jefes see only their campaigns
            if (status === "pending") {
              requests = await repo.listPendingByCampaigns(authed.campaignIds);
            } else {
              requests = await repo.listPendingByCampaigns(authed.campaignIds);
              // TODO: Add listAllByCampaigns if needed
            }
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
    // Admin/Supervisor approves or rejects an access request.
    // Supervisors can only resolve requests for their campaigns.
    app.put(
      "/api/access-requests/:requestId",
      { preHandler: [app.authenticate, authorize({ roles: ["consultor"] })] },
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
          // Verify non-admin has access to this request's campaign
          if (authed.userRole !== "admin") {
            const accessRequest = await repo.findById(accessRequestId);
            if (!accessRequest) {
              return reply
                .code(404)
                .send(errorPayload(requestId, "ACCESS_REQUEST_NOT_FOUND", "solicitud no encontrada"));
            }
            if (!authed.campaignIds.includes(accessRequest.campaign_id)) {
              return reply
                .code(403)
                .send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campaña"));
            }
          }

          const resolved = await repo.resolve(
            accessRequestId,
            parsed.data.status,
            authed.userId,
            parsed.data.note,
            parsed.data.role,
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
