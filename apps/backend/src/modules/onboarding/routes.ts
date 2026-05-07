import type { FastifyPluginAsync } from "fastify";
import { timingSafeEqual } from "node:crypto";

import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import {
  AmbitoMismatchError,
  CatalogResolutionError,
  SlugConflictError,
} from "./repository";
import { provisionedSchema } from "./schemas";

const SERVICE_TOKEN_HEADER = "x-goberna-service-token";

function tokenMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function buildDashboardUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/c/${slug}`;
}

export function buildOnboardingRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/onboarding/provisioned ─────────────────────────────
    // Internal endpoint: nexus-control llama acá después de aprovisionar
    // DNS + Hestia + Mailu + tenant en su DB. Crea de forma atómica:
    //   1. campaigns row (si el slug está libre)
    //   2. candidatos.candidato (UPSERT por DNI si viene; INSERT si no)
    //   3. candidatos.postulacion (con FKs resueltos a catalogos.*)
    //
    // Auth: header X-Goberna-Service-Token contra env.onboardingServiceToken
    //       (timing-safe). Sin token → 401. Env vacía → 503.
    //
    // Idempotencia: nexus_tenant_id UNIQUE en postulacion. Reintentos
    // devuelven 200 con la postulación existente.
    app.post("/api/onboarding/provisioned", async (request, reply) => {
      const requestId = String(request.id);

      if (!env.onboardingServiceToken) {
        return reply.code(503).send(
          errorPayload(requestId, "ONBOARDING_NOT_CONFIGURED", "endpoint no configurado"),
        );
      }

      const headerValue = request.headers[SERVICE_TOKEN_HEADER];
      const provided = typeof headerValue === "string" ? headerValue : "";
      if (!provided || !tokenMatches(provided, env.onboardingServiceToken)) {
        return reply.code(401).send(
          errorPayload(requestId, "AUTH_TOKEN_INVALID", "service token invalido"),
        );
      }

      const parsed = provisionedSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }
      const input = parsed.data;

      // Idempotent retry detection BEFORE the transaction
      try {
        const existing = await repo.findByNexusTenantId(input.nexus_tenant_id);
        if (existing) {
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            idempotent: true,
            campaign_id: existing.campaign_id,
            candidato_id: existing.candidato_id,
            postulacion_id: existing.postulacion_id,
            slug: existing.slug,
            dashboard_url: buildDashboardUrl(env.publicBaseUrl, existing.slug),
          });
        }
      } catch (error) {
        app.log.error({ err: error, request_id: requestId }, "onboarding tenant lookup failed");
        return reply.code(500).send(
          errorPayload(requestId, "ONBOARDING_PROVISIONED_ERROR", "error consultando provisioning"),
        );
      }

      try {
        const result = await repo.provisionFromOnboarding(input);
        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          idempotent: false,
          campaign_id: result.campaign_id,
          candidato_id: result.candidato_id,
          postulacion_id: result.postulacion_id,
          slug: result.slug,
          dashboard_url: buildDashboardUrl(env.publicBaseUrl, result.slug),
        });
      } catch (error) {
        if (error instanceof CatalogResolutionError) {
          return reply.code(400).send(
            errorPayload(requestId, "CATALOG_NOT_FOUND", error.message),
          );
        }
        if (error instanceof AmbitoMismatchError) {
          return reply.code(400).send(
            errorPayload(requestId, "AMBITO_GEO_MISSING", error.message),
          );
        }
        if (error instanceof SlugConflictError) {
          return reply.code(409).send(
            errorPayload(requestId, "CAMPAIGN_SLUG_EXISTS", error.message),
          );
        }
        app.log.error({ err: error, request_id: requestId }, "onboarding provisioned failed");
        return reply.code(500).send(
          errorPayload(requestId, "ONBOARDING_PROVISIONED_ERROR", "error registrando postulación"),
        );
      }
    });
  };
}
