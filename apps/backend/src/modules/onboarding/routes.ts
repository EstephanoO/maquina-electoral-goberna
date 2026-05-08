import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { timingSafeEqual } from "node:crypto";

import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import { AUTH_COOKIE_NAMES, type AuthenticatedRequest } from "../../infra/auth";
import { AuthService } from "../auth/service";
import { AuthRepository } from "../auth/repository";
import { pool } from "../../db";
import { createDefaultForCampaign } from "../form-definitions/repository";
import * as repo from "./repository";
import {
  AmbitoMismatchError,
  CatalogResolutionError,
  EmailConflictError,
  SlugConflictError,
} from "./repository";
import { provisionedSchema, wizardInputSchema } from "./schemas";

const SERVICE_TOKEN_HEADER = "x-goberna-service-token";

function tokenMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function buildDashboardUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/c/${slug}`;
}

/** Wizard público: post-provisioning va a Fase 2 (contexto + análisis
 *  electoral). Fase 3 (estrategias) cierra el flujo y pide password. */
function buildWizardDashboardUrl(baseUrl: string): string {
  return `${baseUrl}/onboarding/fase-2`;
}

// Mismo set de cookies que auth/routes.ts:setAuthCookies. Duplicado intencional
// para no exponer una función privada de auth/routes.ts; si esto crece, mover
// a infra/auth.ts.
function setAuthCookiesInline(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
  isProd: boolean,
): void {
  const secure = isProd ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.accessToken}=${accessToken}; Path=/; SameSite=Lax${secure}; HttpOnly; Max-Age=31536000`,
  );
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.refreshToken}=${refreshToken}; Path=/api/auth; SameSite=Lax${secure}; HttpOnly; Max-Age=31536000`,
  );
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.session}=1; Path=/; SameSite=Lax${secure}; Max-Age=31536000`,
  );
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
            user_id: existing.user_id,
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

      let result: Awaited<ReturnType<typeof repo.provisionFromOnboarding>>;
      try {
        result = await repo.provisionFromOnboarding(input);
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
        if (error instanceof EmailConflictError) {
          return reply.code(409).send(
            errorPayload(requestId, "USER_EMAIL_EXISTS", error.message),
          );
        }
        app.log.error({ err: error, request_id: requestId }, "onboarding provisioned failed");
        return reply.code(500).send(
          errorPayload(requestId, "ONBOARDING_PROVISIONED_ERROR", "error registrando postulación"),
        );
      }

      // Default forms — non-fatal. Mismo patrón que campaigns/routes.ts:146.
      // El postulante puede crear forms desde el dashboard si esto falla.
      if (result.user_id) {
        try {
          await createDefaultForCampaign(result.campaign_id, result.user_id);
        } catch (err) {
          app.log.warn(
            { err, campaign_id: result.campaign_id, request_id: requestId },
            "default form creation failed (non-fatal)",
          );
        }
      }

      return reply.code(201).send({
        ok: true,
        request_id: requestId,
        idempotent: false,
        campaign_id: result.campaign_id,
        candidato_id: result.candidato_id,
        postulacion_id: result.postulacion_id,
        user_id: result.user_id,
        slug: result.slug,
        dashboard_url: buildDashboardUrl(env.publicBaseUrl, result.slug),
      });
    });

    // ── POST /api/onboarding/wizard ───────────────────────────────────
    // Endpoint público: wizard de /onboarding (apps/web) crea cuenta del
    // candidato + campaign mínima. Sin DNS/Hestia/Mailu/Nexus. Auto-login
    // via cookies httpOnly al terminar — el frontend redirige al dashboard.
    //
    // Idempotencia: cada llamada genera nexus_tenant_id nuevo (`wizard_<uuid>`),
    // entonces NO es idempotente por defecto. El cliente debe deduplicar.
    app.post("/api/onboarding/wizard", async (request, reply) => {
      const requestId = String(request.id);

      const parsed = wizardInputSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      let result: Awaited<ReturnType<typeof repo.provisionFromWizard>>;
      try {
        result = await repo.provisionFromWizard(parsed.data);
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
          // Improbable: pickAvailableSlug ya hizo el check. Si pasa, retry.
          return reply.code(409).send(
            errorPayload(requestId, "CAMPAIGN_SLUG_EXISTS", error.message),
          );
        }
        if (error instanceof EmailConflictError) {
          return reply.code(409).send(
            errorPayload(requestId, "USER_EMAIL_EXISTS", error.message),
          );
        }
        app.log.error({ err: error, request_id: requestId }, "wizard provision failed");
        return reply.code(500).send(
          errorPayload(requestId, "ONBOARDING_WIZARD_ERROR", "error creando cuenta"),
        );
      }

      // Default forms — non-fatal.
      if (result.user_id) {
        try {
          await createDefaultForCampaign(result.campaign_id, result.user_id);
        } catch (err) {
          app.log.warn(
            { err, campaign_id: result.campaign_id, request_id: requestId },
            "default form creation failed (non-fatal)",
          );
        }
      }

      // Si el wizard mandó password, lo hasheamos y persistimos antes
      // del auto-login (sino el user queda solo OTP-able).
      const authRepo = new AuthRepository(pool);
      const authService = new AuthService(authRepo, env);
      if (parsed.data.password && result.user_id) {
        try {
          const hash = await authService.hashPassword(parsed.data.password);
          await repo.setUserPasswordHash(result.user_id, hash);
        } catch (err) {
          app.log.warn(
            { err, request_id: requestId },
            "wizard password hash failed (cuenta creada sin password)",
          );
        }
      }

      // Auto-login: emite cookies httpOnly como /api/auth/login.
      try {
        if (!result.user_id) throw new Error("user_id missing after wizard provision");
        const userRow = await authRepo.findUserById(result.user_id);
        if (!userRow) throw new Error("user not found after wizard provision");
        const loginResult = await authService.issueTokensForUser({
          id: userRow.id,
          email: userRow.email,
          full_name: userRow.full_name,
          phone: userRow.phone,
          region: userRow.region,
          role: userRow.role,
          status: userRow.status,
        });
        const isProd = env.nodeEnv === "production";
        setAuthCookiesInline(reply, loginResult.access_token, loginResult.refresh_token, isProd);
      } catch (err) {
        app.log.warn(
          { err, request_id: requestId },
          "wizard auto-login failed (cuenta creada igualmente)",
        );
      }

      return reply.code(201).send({
        ok: true,
        request_id: requestId,
        campaign_id: result.campaign_id,
        candidato_id: result.candidato_id,
        postulacion_id: result.postulacion_id,
        user_id: result.user_id,
        slug: result.slug,
        // Wizard va a /onboarding/fase-2 — informe inicial + análisis.
        // Fase 3 cierra el flujo y pide password.
        dashboard_url: buildWizardDashboardUrl(env.publicBaseUrl),
      });
    });

    // ── GET /api/onboarding/me ────────────────────────────────────────
    // Contexto completo del candidato logged-in para Fase 2 / Fase 3:
    // identidad, campaign, cargo, jurisdicción, organización política,
    // has_password (para saber si Fase 3 debe pedir contraseña).
    app.get(
      "/api/onboarding/me",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as AuthenticatedRequest).userId;
        try {
          const ctx = await repo.findCandidatoContext(userId);
          if (!ctx) {
            return reply.code(404).send(
              errorPayload(requestId, "CANDIDATO_NOT_FOUND", "no se encontró candidatura para este user"),
            );
          }
          return reply.code(200).send({ ok: true, request_id: requestId, ...ctx });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "onboarding/me failed");
          return reply.code(500).send(
            errorPayload(requestId, "ONBOARDING_ME_ERROR", "error obteniendo contexto"),
          );
        }
      },
    );
  };
}
