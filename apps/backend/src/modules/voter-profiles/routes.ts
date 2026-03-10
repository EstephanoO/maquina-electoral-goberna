import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { listQuerySchema, idParamSchema, updateBodySchema, pipelineStatusSchema } from "./schemas";

export function buildVoterProfileRoutes(_env: AppEnv): FastifyPluginAsync {
  return async function voterProfileRoutes(app) {

    // ── GET /api/voter-profiles — List profiles (paginated, filterable) ──
    app.get("/api/voter-profiles", {
      preHandler: [app.authenticate, authorize({ requireCampaign: true })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.activeCampaignId;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
      }

      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.message));
      }

      try {
        const result = await repo.list({
          campaign_id: campaignId,
          pipeline_status: parsed.data.pipeline_status,
          vote_class: parsed.data.vote_class,
          search: parsed.data.search,
          has_wa: parsed.data.has_wa === "true",
          limit: parsed.data.limit,
          offset: parsed.data.offset,
        });

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          items: result.items,
          total: result.total,
        });
      } catch (err) {
        request.log.error({ err }, "voter-profiles list error");
        return reply.code(500).send(errorPayload(requestId, "UPSTREAM_ERROR", "Error listando perfiles de votantes"));
      }
    });

    // ── GET /api/voter-profiles/stats — Aggregate stats ──
    app.get("/api/voter-profiles/stats", {
      preHandler: [app.authenticate, authorize({ requireCampaign: true })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.activeCampaignId;
      if (!campaignId) {
        return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
      }

      try {
        const stats = await repo.getStats(campaignId);
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          stats,
        });
      } catch (err) {
        request.log.error({ err }, "voter-profiles stats error");
        return reply.code(500).send(errorPayload(requestId, "UPSTREAM_ERROR", "Error consultando stats de votantes"));
      }
    });

    // ── GET /api/voter-profiles/:id — Get single profile ──
    app.get("/api/voter-profiles/:id", {
      preHandler: [app.authenticate, authorize({ requireCampaign: true })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.message));
      }

      try {
        const profile = await repo.getById(parsed.data.id);
        if (!profile) {
          return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "Perfil no encontrado"));
        }

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          profile,
        });
      } catch (err) {
        request.log.error({ err }, "voter-profiles getById error");
        return reply.code(500).send(errorPayload(requestId, "UPSTREAM_ERROR", "Error consultando perfil"));
      }
    });

    // ── PUT /api/voter-profiles/:id — Update profile (manual edit) ──
    app.put("/api/voter-profiles/:id", {
      preHandler: [app.authenticate, authorize({ requireCampaign: true })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const authed = request as unknown as AuthenticatedRequest;

      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", paramsParsed.error.message));
      }

      const bodyParsed = updateBodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", bodyParsed.error.message));
      }

      try {
        const { pipeline_status, ...rest } = bodyParsed.data;

        let profile: repo.VoterProfile | null = null;

        // Update fields first
        if (Object.keys(rest).length > 0) {
          const updates = { ...rest } as Record<string, unknown>;
          if (rest.vote_class !== undefined) {
            updates.vote_class_source = "manual";
          }
          profile = await repo.update(paramsParsed.data.id, updates as any);
        }

        // Then update pipeline status if provided
        if (pipeline_status) {
          profile = await repo.updatePipelineStatus(
            paramsParsed.data.id,
            pipeline_status,
            authed.userId,
          );
        }

        if (!profile) {
          profile = await repo.getById(paramsParsed.data.id);
        }

        if (!profile) {
          return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "Perfil no encontrado"));
        }

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          profile,
        });
      } catch (err) {
        request.log.error({ err }, "voter-profiles update error");
        return reply.code(500).send(errorPayload(requestId, "UPSTREAM_ERROR", "Error actualizando perfil"));
      }
    });

    // ── PUT /api/voter-profiles/:id/status — Quick pipeline status change ──
    app.put("/api/voter-profiles/:id/status", {
      preHandler: [app.authenticate, authorize({ requireCampaign: true })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const authed = request as unknown as AuthenticatedRequest;

      const paramsParsed = idParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", paramsParsed.error.message));
      }

      const bodyParsed = pipelineStatusSchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", bodyParsed.error.message));
      }

      try {
        const profile = await repo.updatePipelineStatus(
          paramsParsed.data.id,
          bodyParsed.data.status,
          authed.userId,
        );

        if (!profile) {
          return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "Perfil no encontrado"));
        }

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          profile,
        });
      } catch (err) {
        request.log.error({ err }, "voter-profiles status update error");
        return reply.code(500).send(errorPayload(requestId, "UPSTREAM_ERROR", "Error actualizando status"));
      }
    });
  };
}
