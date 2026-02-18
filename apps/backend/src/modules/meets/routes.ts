import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createMeetSchema, updateMeetSchema, updateMeetStatusSchema } from "./schema";

export function buildMeetsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/meets ─────────────────────────────────────────────
    // Create a meet. Agents create without lat/lng (pending_location).
    // Admins/candidatos create with lat/lng (scheduled).
    app.post(
      "/api/meets",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        const parsed = createMeetSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        // Verify user belongs to the campaign
        if (authed.userRole !== "admin" && !authed.campaignIds.includes(parsed.data.campaign_id)) {
          return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
        }

        try {
          const meet = await repo.create(parsed.data, authed.userId);
          // Auto-join creator as participant
          await repo.join(meet.id, authed.userId);
          return reply.code(201).send({ ok: true, request_id: requestId, meet });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet create failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_CREATE_ERROR", "error creando meet"));
        }
      },
    );

    // ── GET /api/meets/active ───────────────────────────────────────
    // List active/scheduled meets for a campaign (via x-campaign-id header)
    app.get(
      "/api/meets/active",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "CAMPAIGN_MISSING", "x-campaign-id requerido"));
        }

        try {
          const meets = await repo.listActiveByCampaign(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, meets });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meets list active failed");
          return reply.code(500).send(errorPayload(requestId, "MEETS_LIST_ERROR", "error listando meets"));
        }
      },
    );

    // ── GET /api/meets/campaign/:campaignId ──────────────────────────
    // List all meets for a campaign (all statuses). For web dashboard.
    app.get(
      "/api/meets/campaign/:campaignId",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };
        const { status } = request.query as { status?: string };

        // Parse optional status filter
        const statusFilter = status
          ? status.split(",").filter((s) => ["pending_location", "scheduled", "active", "completed", "cancelled"].includes(s)) as repo.MeetRow["status"][]
          : undefined;

        try {
          const meets = await repo.listByCampaign(campaignId, statusFilter);
          return reply.code(200).send({ ok: true, request_id: requestId, meets });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meets list failed");
          return reply.code(500).send(errorPayload(requestId, "MEETS_LIST_ERROR", "error listando meets"));
        }
      },
    );

    // ── GET /api/meets/:id ──────────────────────────────────────────
    app.get(
      "/api/meets/:id",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const meet = await repo.findById(id);
          if (!meet) {
            return reply.code(404).send(errorPayload(requestId, "MEET_NOT_FOUND", "meet no encontrado"));
          }

          // Non-admin users can only see meets for their campaigns
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(meet.campaign_id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, meet });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet get failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_GET_ERROR", "error obteniendo meet"));
        }
      },
    );

    // ── GET /api/meets/:id/summary ──────────────────────────────────
    // Full meet detail with participant list + form submission count
    app.get(
      "/api/meets/:id/summary",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const summary = await repo.getSummary(id);
          if (!summary) {
            return reply.code(404).send(errorPayload(requestId, "MEET_NOT_FOUND", "meet no encontrado"));
          }

          // Non-admin users can only see meets for their campaigns
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(summary.campaign_id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          const participants = await repo.listParticipants(id);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            meet: summary,
            participants,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet summary failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_SUMMARY_ERROR", "error obteniendo resumen"));
        }
      },
    );

    // ── PUT /api/meets/:id ──────────────────────────────────────────
    // Update meet details. Brigadista zonal and above.
    app.put(
      "/api/meets/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["brigadista_zonal"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        const parsed = updateMeetSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const meet = await repo.update(id, parsed.data);
          if (!meet) {
            return reply.code(404).send(errorPayload(requestId, "MEET_NOT_FOUND", "meet no encontrado"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, meet });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet update failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_UPDATE_ERROR", "error actualizando meet"));
        }
      },
    );

    // ── PUT /api/meets/:id/status ───────────────────────────────────
    // Change meet status (activate, complete, cancel). Brigadista zonal and above.
    app.put(
      "/api/meets/:id/status",
      { preHandler: [app.authenticate, authorize({ roles: ["brigadista_zonal"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        const parsed = updateMeetStatusSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const existing = await repo.findById(id);
          if (!existing) {
            return reply.code(404).send(errorPayload(requestId, "MEET_NOT_FOUND", "meet no encontrado"));
          }

          // Validate state transitions
          const { status } = parsed.data;
          const validTransitions: Record<string, string[]> = {
            pending_location: ["scheduled", "cancelled"],
            scheduled: ["active", "cancelled"],
            active: ["completed", "cancelled"],
            completed: [], // terminal
            cancelled: [], // terminal
          };

          const allowed = validTransitions[existing.status] ?? [];
          if (!allowed.includes(status)) {
            return reply.code(422).send(
              errorPayload(requestId, "INVALID_TRANSITION", `no se puede cambiar de '${existing.status}' a '${status}'`),
            );
          }

          const meet = await repo.updateStatus(id, status);
          return reply.code(200).send({ ok: true, request_id: requestId, meet });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet status update failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_STATUS_ERROR", "error actualizando status"));
        }
      },
    );

    // ── DELETE /api/meets/:id ───────────────────────────────────────
    // Delete a meet. Brigadista zonal and above.
    app.delete(
      "/api/meets/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["brigadista_zonal"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        try {
          const meet = await repo.findById(id);
          if (!meet) {
            return reply.code(404).send(errorPayload(requestId, "MEET_NOT_FOUND", "meet no encontrado"));
          }

          const deleted = await repo.remove(id);
          if (!deleted) {
            return reply.code(500).send(errorPayload(requestId, "MEET_DELETE_ERROR", "error eliminando meet"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet delete failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_DELETE_ERROR", "error eliminando meet"));
        }
      },
    );

    // ── POST /api/meets/:id/join ────────────────────────────────────
    // Join a meet as participant
    app.post(
      "/api/meets/:id/join",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const meet = await repo.findById(id);
          if (!meet) {
            return reply.code(404).send(errorPayload(requestId, "MEET_NOT_FOUND", "meet no encontrado"));
          }

          // Only allow joining scheduled or active meets
          if (!["scheduled", "active"].includes(meet.status)) {
            return reply.code(422).send(
              errorPayload(requestId, "MEET_NOT_JOINABLE", `meet en estado '${meet.status}' no permite unirse`),
            );
          }

          // Verify user belongs to the campaign
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(meet.campaign_id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          await repo.join(id, authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet join failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_JOIN_ERROR", "error uniendose al meet"));
        }
      },
    );

    // ── POST /api/meets/:id/leave ───────────────────────────────────
    // Leave a meet
    app.post(
      "/api/meets/:id/leave",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const meet = await repo.findById(id);
          if (!meet) {
            return reply.code(404).send(errorPayload(requestId, "MEET_NOT_FOUND", "meet no encontrado"));
          }

          // Non-admin users can only leave meets from their campaigns
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(meet.campaign_id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          await repo.leave(id, authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet leave failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_LEAVE_ERROR", "error saliendo del meet"));
        }
      },
    );

    // ── GET /api/meets/:id/participants ──────────────────────────────
    app.get(
      "/api/meets/:id/participants",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        try {
          const meet = await repo.findById(id);
          if (!meet) {
            return reply.code(404).send(errorPayload(requestId, "MEET_NOT_FOUND", "meet no encontrado"));
          }

          // Non-admin users can only see participants of meets from their campaigns
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(meet.campaign_id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          const participants = await repo.listParticipants(id);
          return reply.code(200).send({ ok: true, request_id: requestId, participants });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "meet participants list failed");
          return reply.code(500).send(errorPayload(requestId, "MEET_PARTICIPANTS_ERROR", "error listando participantes"));
        }
      },
    );
  };
}
