import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { waValidatorResultsBatchSchema } from "./schemas";
import * as repo from "./repository";

export function buildWaValidatorRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── Bootstrap columns once on startup ───────────────────────────
    await repo.ensureWaValidatorColumns();

    // ───────────────────────────────────────────────────────────────────
    // GET /api/wa-validator/contacts
    // Returns contacts pending WA validation for the operator's campaign.
    // Auth: any authenticated user with campaign access.
    // Query: ?limit=500&offset=0
    // ───────────────────────────────────────────────────────────────────
    app.get(
      "/api/wa-validator/contacts",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);

        const qs = request.query as Record<string, string>;
        const limit  = Math.min(500, Math.max(1, parseInt(qs.limit  ?? "500", 10)));
        const offset = Math.max(0,             parseInt(qs.offset ?? "0",   10));

        const campaignId = req.activeCampaignId!;

        try {
          const { contacts, total } = await repo.getPendingContacts(
            campaignId,
            limit,
            offset
          );

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            contacts,
            total,
            limit,
            offset,
          });
        } catch (err) {
          app.log.error({ err }, "[wa-validator] getPendingContacts failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener contactos")
          );
        }
      }
    );

    // ───────────────────────────────────────────────────────────────────
    // POST /api/wa-validator/results
    // Saves a batch of { id, wa_valid } results from the Chrome extension.
    // Auth: any authenticated user with campaign access.
    // ───────────────────────────────────────────────────────────────────
    app.post(
      "/api/wa-validator/results",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);

        const parsed = waValidatorResultsBatchSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(
              requestId,
              "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido"
            )
          );
        }

        const campaignId = req.activeCampaignId!;
        const userId     = req.userId;

        try {
          const updated = await repo.saveResults(
            campaignId,
            parsed.data.results,
            userId ?? null
          );

          app.log.info(
            { campaignId, userId, total: parsed.data.results.length, updated },
            "[wa-validator] saved results batch"
          );

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            updated,
          });
        } catch (err) {
          app.log.error({ err }, "[wa-validator] saveResults failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al guardar resultados")
          );
        }
      }
    );

    // ───────────────────────────────────────────────────────────────────
    // GET /api/wa-validator/stats
    // Returns global summary + per-brigadista breakdown.
    // Auth: candidato+ (accountability data — managers only)
    // ───────────────────────────────────────────────────────────────────
    app.get(
      "/api/wa-validator/stats",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["candidato"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);

        const campaignId = req.activeCampaignId!;

        try {
          const [summary, by_brigadista] = await Promise.all([
            repo.getSummary(campaignId),
            repo.getStatsByBrigadista(campaignId),
          ]);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            summary,
            by_brigadista,
          });
        } catch (err) {
          app.log.error({ err }, "[wa-validator] getStats failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener estadísticas")
          );
        }
      }
    );
  };
}
