import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createLeadSchema } from "./schemas";
import { notifyTelegram } from "./telegram";

export function buildLeadsRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // POST /api/leads — public (no auth), creates a lead + notifies Telegram
    app.post("/api/leads", async (request, reply) => {
      const requestId = String(request.id);
      const parsed = createLeadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "datos invalidos"));
      }
      const lead = await repo.create(parsed.data);
      notifyTelegram(env, lead.nombre, lead.correo, lead.plataforma);
      return reply.code(201).send({ ok: true, request_id: requestId, lead });
    });

    // GET /api/leads — admin only, list leads with pagination
    app.get("/api/leads", { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] }, async (request, reply) => {
      const requestId = String(request.id);
      const { limit, offset } = request.query as { limit?: string; offset?: string };
      const result = await repo.list(
        Math.min(Number(limit) || 50, 200),
        Math.max(Number(offset) || 0, 0),
      );
      return reply.send({ ok: true, request_id: requestId, ...result });
    });
  };
}
