import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createVoluntarioSchema } from "./schemas";

export function buildVoluntariosRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // POST /api/voluntarios — public, no auth required
    app.post("/api/voluntarios", async (request, reply) => {
      const requestId = String(request.id);
      const parsed = createVoluntarioSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send(
            errorPayload(
              requestId,
              "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "datos invalidos",
            ),
          );
      }
      const voluntario = await repo.create(parsed.data);
      return reply.code(201).send({ ok: true, request_id: requestId, voluntario });
    });

    // GET /api/voluntarios — admin / jefe_campana only
    app.get(
      "/api/voluntarios",
      { preHandler: [app.authenticate, authorize({ roles: ["admin", "candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const q = request.query as { limit?: string; offset?: string; candidato_slug?: string };
        const result = await repo.list(
          Math.min(Number(q.limit) || 50, 200),
          Math.max(Number(q.offset) || 0, 0),
          q.candidato_slug,
        );
        return reply.send({ ok: true, request_id: requestId, ...result });
      },
    );
  };
}
