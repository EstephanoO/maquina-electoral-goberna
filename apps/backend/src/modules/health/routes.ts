import type { FastifyPluginAsync } from "fastify";
import { statfsSync } from "node:fs";
import os from "node:os";

import type { AppEnv } from "../../config/env";
import { db } from "../../db";
import { authorize } from "../../infra/authorize";
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

    app.get("/api/ops/system", { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] }, async (_request, reply) => {
      reply.header("Cache-Control", "no-store");

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsed = Math.max(0, totalMem - freeMem);
      const memPercent = totalMem > 0 ? Number(((memUsed / totalMem) * 100).toFixed(2)) : 0;

      const load = os.loadavg()[0] ?? 0;
      const cpuCount = os.cpus().length || 1;
      const cpuPercent = Number(Math.min(100, (load / cpuCount) * 100).toFixed(2));

      let diskPercent: number | null = null;
      try {
        const fsStats = statfsSync("/");
        const blocks = Number(fsStats.blocks);
        const available = Number(fsStats.bavail);
        if (Number.isFinite(blocks) && Number.isFinite(available) && blocks > 0) {
          diskPercent = Number((((blocks - available) / blocks) * 100).toFixed(2));
        }
      } catch {
        diskPercent = null;
      }

      return {
        ok: true,
        ts: new Date().toISOString(),
        cpu_percent: cpuPercent,
        mem_percent: memPercent,
        disk_percent: diskPercent,
        uptime_seconds: Math.floor(os.uptime()),
      };
    });
  };
}
