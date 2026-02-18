import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createZoneSchema, updateZoneSchema } from "./schemas";

export function buildZonesRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/zones ─────────────────────────────────────────────
    app.post(
      "/api/zones",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const parsed = createZoneSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        const authed = request as AuthenticatedRequest;
        if (authed.userRole !== "admin" && !authed.campaignIds.includes(parsed.data.campaign_id)) {
          return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
        }

        try {
          const zone = await repo.create(parsed.data);
          return reply.code(201).send({ ok: true, request_id: requestId, zone });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "zone create failed");
          return reply.code(500).send(errorPayload(requestId, "ZONE_CREATE_ERROR", "error creando zona"));
        }
      },
    );

    // ── GET /api/zones/campaign/:campaignId ──────────────────────────
    app.get(
      "/api/zones/campaign/:campaignId",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const zones = await repo.listByCampaign(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, zones });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "zones list failed");
          return reply.code(500).send(errorPayload(requestId, "ZONES_LIST_ERROR", "error listando zonas"));
        }
      },
    );

    // ── GET /api/zones/campaign/:campaignId/geojson ──────────────────
    app.get(
      "/api/zones/campaign/:campaignId/geojson",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const geojson = await repo.getGeoJsonByCampaign(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, geojson });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "zones geojson failed");
          return reply.code(500).send(errorPayload(requestId, "ZONES_GEOJSON_ERROR", "error generando geojson"));
        }
      },
    );

    // ── GET /api/zones/:id ──────────────────────────────────────────
    app.get(
      "/api/zones/:id",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        try {
          const zone = await repo.findById(id);
          if (!zone) {
            return reply.code(404).send(errorPayload(requestId, "ZONE_NOT_FOUND", "zona no encontrada"));
          }

          const authed = request as AuthenticatedRequest;
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(zone.campaign_id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, zone });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "zone get failed");
          return reply.code(500).send(errorPayload(requestId, "ZONE_GET_ERROR", "error obteniendo zona"));
        }
      },
    );

    // ── PUT /api/zones/:id ──────────────────────────────────────────
    app.put(
      "/api/zones/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        const parsed = updateZoneSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const zone = await repo.update(id, parsed.data);
          if (!zone) {
            return reply.code(404).send(errorPayload(requestId, "ZONE_NOT_FOUND", "zona no encontrada"));
          }
          return reply.code(200).send({ ok: true, request_id: requestId, zone });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "zone update failed");
          return reply.code(500).send(errorPayload(requestId, "ZONE_UPDATE_ERROR", "error actualizando zona"));
        }
      },
    );

    // ── DELETE /api/zones/:id ───────────────────────────────────────
    app.delete(
      "/api/zones/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["jefe_campana"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        try {
          const deleted = await repo.remove(id);
          if (!deleted) {
            return reply.code(404).send(errorPayload(requestId, "ZONE_NOT_FOUND", "zona no encontrada"));
          }
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "zone delete failed");
          return reply.code(500).send(errorPayload(requestId, "ZONE_DELETE_ERROR", "error eliminando zona"));
        }
      },
    );
  };
}
