import Fastify from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";

import type { AppEnv } from "./config/env";
import { registerAuthDecorator } from "./infra/auth";
import { authorize } from "./infra/authorize";
import { errorPayload } from "./infra/http";
import type { IngestDomain, IngestOutcome } from "./infra/metrics";
import { metricsRegistry } from "./infra/metrics";
import { buildAgentsRoutes } from "./modules/agents/routes";
import { buildAuthRoutes } from "./modules/auth/routes";
import { buildFormsRoutes } from "./modules/forms/routes";
import { buildHealthRoutes } from "./modules/health/routes";
import { buildCampaignsRoutes } from "./modules/campaigns/routes";
import { buildAccessRequestsRoutes } from "./modules/access-requests/routes";
import { buildFormDefinitionsRoutes } from "./modules/form-definitions/routes";
import { buildMapRoutes } from "./modules/map/routes";
import { buildMeetsRoutes } from "./modules/meets/routes";
import { buildUploadsRoutes } from "./modules/uploads/routes";
import { buildZonesRoutes } from "./modules/zones/routes";
import { buildOrgHierarchyRoutes } from "./modules/org-hierarchy/routes";
import { buildInvitationsRoutes } from "./modules/invitations/routes";
import { buildFormSubmissionsRoutes } from "./modules/form-submissions/routes";
import { buildAnalyticsRoutes } from "./modules/analytics/routes";
import { buildObjectivesRoutes } from "./modules/objectives/routes";
import { buildCmsRoutes } from "./modules/cms/routes";
import { buildTwilioRoutes } from "./modules/twilio/twilio.routes";
import { buildLeadsRoutes } from "./modules/leads/routes";
import { buildSupportRoutes } from "./modules/support/routes";
import { buildChatRoutes } from "./modules/chat/routes";

export function buildApp(env: AppEnv) {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: env.logLevel,
    },
  });

  app.register(helmet);
  app.register(compress);
  app.register(formbody); // Twilio webhooks arrive as application/x-www-form-urlencoded
  // Warn at startup if CORS is misconfigured (wildcard + credentials is insecure)
  if (env.frontendOrigins.includes("*") && env.nodeEnv === "production") {
    app.log.error(
      "SECURITY: FRONTEND_ORIGINS=* with credentials:true in production allows any site to use victim cookies. Set explicit origins!",
    );
  }
   app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      // In production, never honour wildcard — require explicit origin match
      if (env.nodeEnv === "production" && env.frontendOrigins.includes("*")) {
        callback(new Error("Wildcard CORS blocked in production"), false);
        return;
      }

      if (env.frontendOrigins.includes("*") || env.frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Support suffix-wildcard patterns like *.vercel.app for preview deployments
      const hasWildcardMatch = env.frontendOrigins.some((allowed) => {
        if (!allowed.startsWith("https://*.")) return false;
        const suffix = allowed.slice("https://*".length); // e.g. ".vercel.app"
        return origin.startsWith("https://") && origin.endsWith(suffix);
      });
      if (hasWildcardMatch) {
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
      const elapsed = Date.now() - start;
      metricsRegistry.observeLatency(route, elapsed);

      const ingestRouteDomain: Record<string, IngestDomain> = {
        "/api/forms": "forms",
        "/api/forms/batch": "forms",
        "/api/agents/location": "tracking",
      };

      const domain = ingestRouteDomain[route];
      if (domain) {
        const contextualOutcome = (request as unknown as { __ingestOutcome?: IngestOutcome }).__ingestOutcome;
        const status = _reply.statusCode;
        const inferredOutcome: IngestOutcome | null =
          status === 429
            ? "rate_limited"
            : domain === "tracking" && status === 401
              ? "auth_failed"
              : status === 400 || status === 413
                ? "invalid_payload"
                : status === 503
                  ? "backpressure"
                  : status === 200
                    ? "deduped"
                    : status === 202
                      ? "accepted"
                      : null;

        const outcome = contextualOutcome ?? inferredOutcome;
        if (outcome) {
          metricsRegistry.observeIngestOutcomeLatency(domain, outcome, elapsed);
        }
      }
    }
    done();
  });

  // WebSocket support (must be before routes that use { websocket: true })
  app.register(websocket);

  // Auth decorator (must be before routes that use app.authenticate)
  registerAuthDecorator(app, env.jwtSecret);

  app.register(buildHealthRoutes(env));
  app.register(buildAuthRoutes(env));
  app.register(buildFormsRoutes(env));
  app.register(buildMapRoutes(env));
  app.register(buildAgentsRoutes(env));
  app.register(buildCampaignsRoutes(env));
  app.register(buildAccessRequestsRoutes(env));
  app.register(buildFormDefinitionsRoutes(env));
  app.register(buildMeetsRoutes(env));
  app.register(buildUploadsRoutes(env));
  app.register(buildZonesRoutes(env));
  app.register(buildOrgHierarchyRoutes(env));
  app.register(buildInvitationsRoutes(env));
  app.register(buildFormSubmissionsRoutes(env));
  app.register(buildAnalyticsRoutes(env));
  app.register(buildObjectivesRoutes(env));
  app.register(buildCmsRoutes(env));
  app.register(buildTwilioRoutes(env));
  app.register(buildLeadsRoutes(env));
  app.register(buildSupportRoutes(env));
  app.register(buildChatRoutes(env));

  app.get("/api/metrics", { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] }, async (_request, reply) => {
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
