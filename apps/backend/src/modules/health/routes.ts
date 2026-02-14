import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import { db } from "../../db";
import { redisClient } from "../../infra/redis";
import { fetchWithRetry } from "../../infra/upstream";

async function checkDatabase(): Promise<boolean> {
  const result = await db.execute("SELECT 1 AS ok");
  return result.rowCount === 1;
}

async function checkTegola(env: AppEnv): Promise<boolean> {
  const response = await fetchWithRetry(`${env.tegolaBaseUrl}/capabilities`, env);
  return response.ok;
}

async function checkRedis(): Promise<boolean> {
  const pong = await redisClient.ping();
  return pong === "PONG";
}

export function buildHealthRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return { ok: true, service: "backend-fastify", map: env.tegolaMap, ts: new Date().toISOString() };
    });

    app.get("/api/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return { ok: true, service: "backend-fastify", map: env.tegolaMap, ts: new Date().toISOString() };
    });

    app.get("/api/ready", async (_request, reply) => {
      try {
        const [databaseOk, tegolaOk, redisOk] = await Promise.all([checkDatabase(), checkTegola(env), checkRedis()]);
        const ok = databaseOk && tegolaOk && redisOk;
        return reply.code(ok ? 200 : 503).send({
          ok,
          checks: {
            database: databaseOk,
            tegola: tegolaOk,
            redis: redisOk,
          },
          ts: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "error desconocido";
        return reply.code(503).send({
          ok: false,
          checks: { database: false, tegola: false, redis: false },
          error: message,
          ts: new Date().toISOString(),
        });
      }
    });
  };
}
