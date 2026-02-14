import Fastify from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import type { AppEnv } from "./config/env";
import { errorPayload } from "./infra/http";
import { metricsRegistry } from "./infra/metrics";
import { buildAgentsRoutes } from "./modules/agents/routes";
import { buildFormsRoutes } from "./modules/forms/routes";
import { buildHealthRoutes } from "./modules/health/routes";
import { buildMapRoutes } from "./modules/map/routes";

export function buildApp(env: AppEnv) {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: env.logLevel,
    },
  });

  app.register(helmet);
  app.register(compress);
  app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.frontendOrigins.includes("*") || env.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  });
  app.register(rateLimit, {
    max: env.rateLimitMaxPerMinute,
    timeWindow: "1 minute",
    errorResponseBuilder: (request, context) => {
      return {
        ok: false,
        request_id: String(request.id),
        code: "RATE_LIMITED",
        message: `demasiadas requests, reintentar en ${context.after}s`,
      };
    },
  });

  app.addHook("onRequest", (request, _reply, done) => {
    (request as unknown as { __startAtMs?: number }).__startAtMs = Date.now();
    done();
  });

  app.addHook("onResponse", (request, _reply, done) => {
    const start = (request as unknown as { __startAtMs?: number }).__startAtMs;
    if (start && request.url.startsWith("/api/")) {
      const route = request.routeOptions.url ?? request.url;
      metricsRegistry.observeLatency(route, Date.now() - start);
    }
    done();
  });

  app.register(buildHealthRoutes(env));
  app.register(buildFormsRoutes(env));
  app.register(buildMapRoutes(env));
  app.register(buildAgentsRoutes(env));

  app.get("/api/metrics", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      ok: true,
      ...metricsRegistry.snapshot(),
    };
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send(errorPayload(String(request.id), "NOT_FOUND", "ruta no encontrada"));
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = String(request.id);
    const message = error instanceof Error ? error.message : "error desconocido";
    const statusCode = typeof (error as { statusCode?: number }).statusCode === "number" ? (error as { statusCode?: number }).statusCode ?? 500 : 500;
    const isTimeout = message.includes("aborted") || message.includes("timeout");
    const status = isTimeout ? 504 : statusCode >= 400 && statusCode < 600 ? statusCode : 502;
    const code = status >= 500 ? "UPSTREAM_ERROR" : "REQUEST_ERROR";
    reply.code(status).send(errorPayload(requestId, code, status >= 500 ? "error consultando servicio" : message));
  });

  return app;
}
