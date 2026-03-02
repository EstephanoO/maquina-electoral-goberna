import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { updateStatusSchema, VALIDATION_STATUSES } from "./schemas";

export function buildValidacionRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {

    // ── Ensure table on startup ──
    await repo.ensureValidacionTable();

    // ── POST /api/validacion/sync — sync forms into validations table ──
    app.post("/api/validacion/sync", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      const count = await repo.syncValidations(campaignId);
      return reply.send({ ok: true, request_id: requestId, synced: count });
    });

    // ── GET /api/validacion — list validations for campaign ──
    app.get("/api/validacion", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const query = request.query as { status?: string; page?: string; limit?: string };
      const status = query.status && VALIDATION_STATUSES.includes(query.status as never)
        ? query.status as typeof VALIDATION_STATUSES[number]
        : undefined;

      const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
      const page = Math.max(Number(query.page) || 1, 1);
      const offset = (page - 1) * limit;

      // Auto-sync on first list call
      await repo.syncValidations(campaignId);
      const [items, total] = await Promise.all([
        repo.listByCampaign(campaignId, status, limit, offset),
        repo.countByCampaign(campaignId, status),
      ]);
      return reply.send({ ok: true, request_id: requestId, items, total, page, limit });
    });

    // ── GET /api/validacion/stats — counts by status ──
    app.get("/api/validacion/stats", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));
      const stats = await repo.statsByCampaign(campaignId);
      return reply.send({ ok: true, request_id: requestId, stats });
    });

    // ── PUT /api/validacion/:id/status — update validation status ──
    app.put<{ Params: { id: string } }>("/api/validacion/:id/status", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const parsed = updateStatusSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));

      const authed = request as unknown as AuthenticatedRequest;
      const result = await repo.updateStatus(request.params.id, campaignId, parsed.data.status, parsed.data.notes ?? null, authed.userId, parsed.data.vote_class);
      if (!result) return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "validacion no encontrada"));
      return reply.send({ ok: true, request_id: requestId, item: result });
    });

    // ── PUT /api/validacion/:id/claim — claim a contact ──
    app.put<{ Params: { id: string } }>("/api/validacion/:id/claim", {
      preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato", "consultor"] })],
    }, async (request, reply) => {
      const requestId = String(request.id);
      const campaignId = request.headers["x-campaign-id"] as string;
      if (!campaignId) return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "x-campaign-id header requerido"));

      const authed = request as unknown as AuthenticatedRequest;
      const result = await repo.claim(request.params.id, campaignId, authed.userId);
      if (!result) return reply.code(409).send(errorPayload(requestId, "ALREADY_CLAIMED", "contacto ya tomado por otro operador"));
      return reply.send({ ok: true, request_id: requestId, item: result });
    });
  };
}
