import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";

export function buildAccessCodesRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {

    // ── GET /api/access-codes/validate/:code ────────────────────────────
    // Publico — valida un codigo de acceso de campana y devuelve info basica.
    // Usado por mobile antes de mostrar la pantalla de registro con codigo.
    app.get(
      "/api/access-codes/validate/:code",
      async (request, reply) => {
        const requestId = String(request.id);
        const { code } = request.params as { code: string };

        if (!code || code.trim().length === 0) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "codigo requerido"));
        }

        try {
          const accessCode = await repo.findByCode(code);
          if (!accessCode) {
            return reply.code(404).send(errorPayload(requestId, "ACCESS_CODE_NOT_FOUND", "codigo de acceso no encontrado"));
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            campaign: {
              id: accessCode.campaign_id,
              name: accessCode.campaign_name,
              slug: accessCode.campaign_slug,
            },
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "access-code validate failed");
          return reply.code(500).send(errorPayload(requestId, "ACCESS_CODE_VALIDATE_ERROR", "error validando codigo"));
        }
      },
    );

    // ── GET /api/access-codes/campaign/:campaignId ───────────────────────
    // Autenticado, candidato+ — obtiene (o crea) el codigo de acceso de la campana.
    // El codigo se crea lazy la primera vez que se pide.
    app.get(
      "/api/access-codes/campaign/:campaignId",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { campaignId } = request.params as { campaignId: string };

        if (authed.userRole !== "admin" && !authed.campaignIds.includes(campaignId)) {
          return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
        }

        try {
          const accessCode = await repo.getOrCreateForCampaign(campaignId, authed.userId);
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            access_code: accessCode.code,
            campaign_id: accessCode.campaign_id,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "access-code get failed");
          return reply.code(500).send(errorPayload(requestId, "ACCESS_CODE_GET_ERROR", "error obteniendo codigo de acceso"));
        }
      },
    );

    // ── POST /api/access-codes/campaign/:campaignId/regenerate ───────────
    // Autenticado, candidato+ — regenera el codigo de acceso de la campana.
    // Invalida el codigo anterior inmediatamente.
    app.post(
      "/api/access-codes/campaign/:campaignId/regenerate",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { campaignId } = request.params as { campaignId: string };

        if (authed.userRole !== "admin" && !authed.campaignIds.includes(campaignId)) {
          return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
        }

        try {
          const accessCode = await repo.regenerateForCampaign(campaignId, authed.userId);
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            access_code: accessCode.code,
            campaign_id: accessCode.campaign_id,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "access-code regenerate failed");
          return reply.code(500).send(errorPayload(requestId, "ACCESS_CODE_REGENERATE_ERROR", "error regenerando codigo de acceso"));
        }
      },
    );
  };
}
