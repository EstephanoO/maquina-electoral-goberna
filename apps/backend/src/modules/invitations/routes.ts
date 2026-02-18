import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createInvitationSchema } from "./schemas";

export function buildInvitationsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/invitations ───────────────────────────────────────
    app.post(
      "/api/invitations",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        const parsed = createInvitationSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        if (authed.userRole !== "admin" && !authed.campaignIds.includes(parsed.data.campaign_id)) {
          return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
        }

        try {
          const invitation = await repo.create(parsed.data, authed.userId);
          return reply.code(201).send({ ok: true, request_id: requestId, invitation });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "invitation create failed");
          return reply.code(500).send(errorPayload(requestId, "INVITATION_CREATE_ERROR", "error creando invitacion"));
        }
      },
    );

    // ── GET /api/invitations/campaign/:campaignId ────────────────────
    app.get(
      "/api/invitations/campaign/:campaignId",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const invitations = await repo.listByCampaign(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, invitations });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "invitations list failed");
          return reply.code(500).send(errorPayload(requestId, "INVITATIONS_LIST_ERROR", "error listando invitaciones"));
        }
      },
    );

    // ── GET /api/invitations/validate/:code ──────────────────────────
    // Public endpoint: validate an invitation code before registration
    app.get(
      "/api/invitations/validate/:code",
      async (request, reply) => {
        const requestId = String(request.id);
        const { code } = request.params as { code: string };

        try {
          const invitation = await repo.findByCode(code);
          if (!invitation) {
            return reply.code(404).send(errorPayload(requestId, "INVITATION_NOT_FOUND", "codigo de invitacion no encontrado"));
          }

          const valid = await repo.isValid(invitation);
          if (!valid) {
            return reply.code(410).send(errorPayload(requestId, "INVITATION_EXPIRED", "invitacion expirada o agotada"));
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            invitation: {
              campaign_name: invitation.campaign_name,
              campaign_slug: invitation.campaign_slug,
              role: invitation.role,
            },
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "invitation validate failed");
          return reply.code(500).send(errorPayload(requestId, "INVITATION_VALIDATE_ERROR", "error validando invitacion"));
        }
      },
    );

    // ── DELETE /api/invitations/:id ─────────────────────────────────
    app.delete(
      "/api/invitations/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        try {
          const deleted = await repo.remove(id);
          if (!deleted) {
            return reply.code(404).send(errorPayload(requestId, "INVITATION_NOT_FOUND", "invitacion no encontrada"));
          }
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "invitation delete failed");
          return reply.code(500).send(errorPayload(requestId, "INVITATION_DELETE_ERROR", "error eliminando invitacion"));
        }
      },
    );
  };
}
