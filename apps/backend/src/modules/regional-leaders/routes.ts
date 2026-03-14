import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import { createRegionalLeaderSchema, listRegionalLeadersQuerySchema } from "./schemas";

export function buildRegionalLeadersRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.post("/api/regional-leaders", async (request, reply) => {
      const requestId = String(request.id);
      const parsed = createRegionalLeaderSchema.safeParse(request.body);

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

      const regionalLeader = await repo.create({
        ...parsed.data,
        nombres: parsed.data.nombres.toUpperCase(),
        apellidos: parsed.data.apellidos.toUpperCase(),
      });
      return reply.code(201).send({ ok: true, request_id: requestId, regional_leader: regionalLeader });
    });

    app.get(
      "/api/regional-leaders",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const parsed = listRegionalLeadersQuerySchema.safeParse(request.query);

        if (!parsed.success) {
          return reply
            .code(400)
            .send(
              errorPayload(
                requestId,
                "VALIDATION_ERROR",
                parsed.error.issues[0]?.message ?? "query invalida",
              ),
            );
        }

        const result = await repo.list(parsed.data.limit, parsed.data.offset);
        return reply.send({ ok: true, request_id: requestId, ...result });
      },
    );
  };
}
