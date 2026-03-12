import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { formSubmissionSchema, formSubmissionBatchSchema } from "./schemas";

export function buildFormSubmissionsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/form-submissions ──────────────────────────────────
    // Submit a single form submission (new table, not legacy write-behind)
    app.post(
      "/api/form-submissions",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;

        const parsed = formSubmissionSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i: { message: string }) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          // Override campaign_id with the authenticated campaign context
          const submission = { ...parsed.data, campaign_id: campaignId ?? parsed.data.campaign_id };

          const result = await repo.insertBatch([submission], authed.userId);

          // If all submissions were rejected due to duplicate phones, return 409
          if (result.accepted === 0 && result.duplicated_phones.length > 0) {
            return reply.code(409).send({
              ok: false,
              request_id: requestId,
              code: "DUPLICATE_PHONE",
              message: `Este número ya está registrado: ${result.duplicated_phones.join(", ")}`,
              duplicated_phones: result.duplicated_phones,
            });
          }

          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            accepted: result.accepted,
            attempted: result.attempted,
            duplicated_phones: result.duplicated_phones,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submission create failed");
          return reply.code(500).send(errorPayload(requestId, "SUBMISSION_CREATE_ERROR", "error creando submission"));
        }
      },
    );

    // ── POST /api/form-submissions/batch ─────────────────────────────
    // Submit multiple form submissions in a single request
    app.post(
      "/api/form-submissions/batch",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;

        const parsed = formSubmissionBatchSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i: { message: string }) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          // Override campaign_id with authenticated campaign context for all submissions
          const submissions = parsed.data.submissions.map((s) => ({
            ...s,
            campaign_id: campaignId ?? s.campaign_id,
          }));

          const result = await repo.insertBatch(submissions, authed.userId);

          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            accepted: result.accepted,
            attempted: result.attempted,
            duplicated_phones: result.duplicated_phones,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submission batch create failed");
          return reply.code(500).send(errorPayload(requestId, "SUBMISSION_BATCH_ERROR", "error creando submissions en batch"));
        }
      },
    );

    // ── GET /api/form-submissions ────────────────────────────────────
    app.get(
      "/api/form-submissions",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const query = request.query as { limit?: string; offset?: string };
          const limit = Math.min(Number(query.limit) || 50, 200);
          const offset = Number(query.offset) || 0;

          const result = await repo.getByCampaign(campaignId, limit, offset);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            ...result,
            limit,
            offset,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submissions list failed");
          return reply.code(500).send(errorPayload(requestId, "SUBMISSIONS_LIST_ERROR", "error listando submissions"));
        }
      },
    );

    // ── GET /api/form-submissions/recent ─────────────────────────────
    app.get(
      "/api/form-submissions/recent",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const query = request.query as { limit?: string };
          const limit = Math.min(Number(query.limit) || 20, 100);

          const submissions = await repo.getRecent(campaignId, limit);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            submissions,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submissions recent failed");
          return reply.code(500).send(errorPayload(requestId, "SUBMISSIONS_RECENT_ERROR", "error obteniendo submissions recientes"));
        }
      },
    );

    // ── GET /api/form-submissions/meet/:meetId ───────────────────────
    app.get(
      "/api/form-submissions/meet/:meetId",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { meetId } = request.params as { meetId: string };

        try {
          // Verify the meet exists and user has access to its campaign
          const meet = await repo.getMeetCampaignId(meetId);
          if (!meet) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "meet no encontrado"));
          }
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(meet.campaign_id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          const submissions = await repo.getByMeet(meetId);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            submissions,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submissions by meet failed");
          return reply.code(500).send(errorPayload(requestId, "SUBMISSIONS_MEET_ERROR", "error obteniendo submissions del meet"));
        }
      },
    );

    // ── GET /api/form-submissions/my-stats ───────────────────────────
    // Returns submission counts for the authenticated agent in the active campaign.
    // Used by mobile dashboard to show accurate server-side totals.
    app.get(
      "/api/form-submissions/my-stats",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const stats = await repo.getMyStats(campaignId, authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId, stats });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submissions my-stats failed");
          return reply.code(500).send(errorPayload(requestId, "SUBMISSIONS_STATS_ERROR", "error obteniendo stats del agente"));
        }
      },
    );

    // ── GET /api/form-submissions/my-stats/ranking ─────────────────
    // Returns a ranking of agents within the requesting agent's department.
    // Department is determined by the most frequent departamento in the agent's submissions.
    app.get(
      "/api/form-submissions/my-stats/ranking",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const ranking = await repo.getMyDeptRanking(campaignId, authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId, ...ranking });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submissions dept ranking failed");
          return reply.code(500).send(errorPayload(requestId, "SUBMISSIONS_RANKING_ERROR", "error obteniendo ranking departamental"));
        }
      },
    );

    // ── GET /api/form-submissions/my-client-ids ────────────────────
    // Returns the list of client_ids the server has persisted for this agent.
    // Mobile uses this to reconcile local "synced" forms against server truth.
    app.get(
      "/api/form-submissions/my-client-ids",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const clientIds = await repo.getMyClientIds(campaignId, authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId, client_ids: clientIds });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submissions my-client-ids failed");
          return reply.code(500).send(errorPayload(requestId, "CLIENT_IDS_ERROR", "error obteniendo client_ids"));
        }
      },
    );

    // ── GET /api/form-submissions/my-stats/departments ──────────────
    // Returns all departments ranked by total unique phone registrations.
    app.get(
      "/api/form-submissions/my-stats/departments",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const departments = await repo.getDepartmentsRanking(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, departments });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submissions departments ranking failed");
          return reply.code(500).send(errorPayload(requestId, "DEPARTMENTS_RANKING_ERROR", "error obteniendo ranking departamental"));
        }
      },
    );

    // ── GET /api/form-submissions/stats ──────────────────────────────
    app.get(
      "/api/form-submissions/stats",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const stats = await repo.getCountByCampaign(campaignId);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            stats,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form submissions stats failed");
          return reply.code(500).send(errorPayload(requestId, "SUBMISSIONS_STATS_ERROR", "error obteniendo stats"));
        }
      },
    );
  };
}
