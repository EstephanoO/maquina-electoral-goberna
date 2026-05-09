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
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as decksRepo from "../decks/repository";

const DECKS_STORAGE_DIR = process.env.DECKS_STORAGE_DIR ?? "/srv/uploads/decks";

function buildStubDiagnosticoHtml(snap: repo.CandidatoSnapshot): string {
  const jurisdiccion =
    snap.jurisdiccion.distrito?.nombre ??
    snap.jurisdiccion.provincia?.nombre ??
    snap.jurisdiccion.departamento?.nombre ??
    snap.jurisdiccion.pais.nombre;
  const partido = snap.organizacion_politica?.nombre ?? "[partido]";
  const partidoSiglas = snap.organizacion_politica?.siglas ?? "";
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Diagnóstico Inicial — ${escape(snap.user.full_name)}</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>body{font-family:Montserrat,system-ui,sans-serif} .navy{background:#0a1f4a;color:#fff} .gold{color:#fbbf24} .gold-bg{background:#fbbf24} .gold-bar{height:6px;background:#fbbf24}</style>
</head>
<body>
<!-- COVER -->
<section class="navy h-screen flex flex-col justify-between p-16">
  <div>
    <div class="text-xs uppercase tracking-[0.3em] text-amber-300 font-bold">Diagnóstico Inicial</div>
    <div class="mt-1 text-xs text-white/60">Generado automáticamente · listo para editar</div>
  </div>
  <div>
    <h1 class="text-7xl font-black tracking-tight uppercase leading-[0.95]">${escape(snap.user.full_name)}</h1>
    <div class="mt-3 text-2xl text-white/80">${escape(snap.cargo.nombre)} · ${escape(jurisdiccion)}</div>
    <div class="mt-6 inline-block px-4 py-1.5 border border-amber-300/40 rounded text-amber-300 text-sm font-bold uppercase tracking-wider">
      ${escape(partidoSiglas || partido)}
    </div>
  </div>
  <div class="gold-bar w-32"></div>
</section>

<!-- IDENTIDAD -->
<section class="bg-white p-16">
  <div class="text-xs uppercase tracking-[0.3em] text-[#0a1f4a] font-bold mb-2">Identidad</div>
  <div class="gold-bar w-12 mb-8"></div>
  <h2 class="text-4xl font-black uppercase text-[#0a1f4a] leading-tight mb-6">¿Quién es ${escape(snap.user.full_name.split(" ")[0] ?? snap.user.full_name)}?</h2>
  <div class="grid grid-cols-2 gap-12 mt-12">
    <div>
      <div class="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Cargo al que postula</div>
      <div class="text-2xl font-bold text-[#0a1f4a]">${escape(snap.cargo.nombre)}</div>
    </div>
    <div>
      <div class="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Jurisdicción</div>
      <div class="text-2xl font-bold text-[#0a1f4a]">${escape(jurisdiccion)}</div>
    </div>
    <div>
      <div class="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Partido</div>
      <div class="text-2xl font-bold text-[#0a1f4a]">${escape(partido)}</div>
    </div>
    <div>
      <div class="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Estado</div>
      <div class="text-2xl font-bold text-[#0a1f4a]">[A completar por el consultor]</div>
    </div>
  </div>
</section>

<!-- PLACEHOLDER -->
<section class="navy p-16">
  <div class="text-xs uppercase tracking-[0.3em] text-amber-300 font-bold mb-2">Próximos slides</div>
  <div class="gold-bar w-12 mb-8"></div>
  <p class="text-2xl text-white/80 max-w-3xl leading-relaxed">
    Este es un <strong class="text-amber-300">borrador automático</strong> con los datos básicos del candidato.
    El consultor político lo va a completar con análisis electoral, contexto, ideas fuerza y plan operativo
    usando Claude Code + el kit Goberna Decks.
  </p>
  <div class="mt-10 grid grid-cols-3 gap-6">
    <div class="border border-white/20 p-6 rounded">
      <div class="text-amber-300 text-sm font-bold uppercase tracking-wider mb-1">Slide 4</div>
      <div class="text-lg">Análisis electoral</div>
    </div>
    <div class="border border-white/20 p-6 rounded">
      <div class="text-amber-300 text-sm font-bold uppercase tracking-wider mb-1">Slide 5</div>
      <div class="text-lg">Competencia</div>
    </div>
    <div class="border border-white/20 p-6 rounded">
      <div class="text-amber-300 text-sm font-bold uppercase tracking-wider mb-1">Slide 6+</div>
      <div class="text-lg">Recomendaciones</div>
    </div>
  </div>
</section>
</body></html>`;
}

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

    // ── POST /api/onboarding/seed-deck ────────────────────────────────
    // Cuando el wizard de fase 1 termina, generamos un stub diagnóstico
    // pre-poblado con los datos del candidato (cover + identidad +
    // placeholders). Status='draft', uploaded_by_user_id=admin (si lo
    // hay) o el propio candidato. Idempotente: si ya hay un deck con
    // status='draft' del tipo diagnostico para este candidato_id, no
    // crea otro.
    app.post(
      "/api/onboarding/seed-deck",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as AuthenticatedRequest).userId;
        try {
          const snap = await repo.getCandidatoSnapshot(userId);
          if (!snap) {
            return reply.code(404).send(
              errorPayload(requestId, "CANDIDATO_NOT_FOUND", "no se encontró candidatura"),
            );
          }
          // Buscar candidato_id (decks usa el id de candidatos.candidato, no user_id)
          const { rows: candRows } = await pool.query<{ id: number }>(
            `SELECT cand.id
               FROM candidatos.postulacion p
               JOIN candidatos.candidato cand ON cand.id = p.id_candidato
              WHERE p.campaign_id = $1
              LIMIT 1`,
            [snap.campaign.id],
          );
          if (!candRows[0]) {
            return reply.code(409).send(
              errorPayload(requestId, "CANDIDATO_ROW_MISSING", "no se encontró fila en candidatos.candidato"),
            );
          }
          const candidatoId = candRows[0].id;

          // Idempotente: si ya hay un draft diagnóstico, devolver ese.
          const existing = await decksRepo.findDraftByKey(candidatoId, userId, "diagnostico");
          if (existing) {
            return reply.code(200).send({
              ok: true,
              request_id: requestId,
              created: false,
              deck: { id: existing.id, status: existing.status, preview_url: `/api/decks/${existing.id}/raw` },
            });
          }

          const html = buildStubDiagnosticoHtml(snap);
          const id = randomUUID();
          const storagePath = join(DECKS_STORAGE_DIR, `${id}.html`);
          await fs.mkdir(DECKS_STORAGE_DIR, { recursive: true });
          await fs.writeFile(storagePath, html, "utf8");

          const row = await decksRepo.insertDeck({
            id,
            candidato_id: candidatoId,
            campaign_id: snap.campaign.id,
            uploaded_by_user_id: userId,
            title: `Diagnóstico Inicial — ${snap.user.full_name}`,
            type: "diagnostico",
            description: "Stub auto-generado al finalizar fase 1. Listo para editar por el consultor.",
            storage_path: storagePath,
            size_bytes: Buffer.byteLength(html, "utf8"),
          });

          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            created: true,
            deck: {
              id: row.id,
              status: row.status,
              title: row.title,
              preview_url: `/api/decks/${row.id}/raw`,
            },
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "onboarding/seed-deck failed");
          return reply.code(500).send(
            errorPayload(requestId, "SEED_DECK_ERROR", "error generando deck inicial"),
          );
        }
      },
    );

    // ── GET /api/onboarding/snapshot ──────────────────────────────────
    // Snapshot completo del candidato (ctx + polígono + progress) para
    // la pantalla "Carta del candidato" cinematográfica.
    app.get(
      "/api/onboarding/snapshot",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as AuthenticatedRequest).userId;
        const snap = await repo.getCandidatoSnapshot(userId);
        if (!snap) {
          return reply.code(404).send(
            errorPayload(requestId, "CANDIDATO_NOT_FOUND", "no se encontró candidatura"),
          );
        }
        return reply.code(200).send({ ok: true, request_id: requestId, snapshot: snap });
      },
    );

    // ── GET /api/onboarding/snapshot/:campaignId ─────────────────────
    // Versión admin: lookup de la carta para cualquier campaign.
    app.get<{ Params: { campaignId: string } }>(
      "/api/onboarding/snapshot/:campaignId",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const role = (request as AuthenticatedRequest).userRole;
        if (role !== "admin" && role !== "consultor") {
          return reply.code(403).send(
            errorPayload(requestId, "FORBIDDEN", "solo admin/consultor puede ver la carta de otros candidatos"),
          );
        }
        const snap = await repo.getCandidatoSnapshotByCampaign(request.params.campaignId);
        if (!snap) {
          return reply.code(404).send(
            errorPayload(requestId, "CANDIDATO_NOT_FOUND", "no se encontró candidatura para esa campaña"),
          );
        }
        return reply.code(200).send({ ok: true, request_id: requestId, snapshot: snap });
      },
    );

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
