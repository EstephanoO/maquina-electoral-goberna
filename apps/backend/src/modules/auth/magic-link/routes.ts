import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { randomBytes, timingSafeEqual } from "node:crypto";

import type { AppEnv } from "../../../config/env";
import { pool } from "../../../db";
import { errorPayload } from "../../../infra/http";
import { AUTH_COOKIE_NAMES } from "../../../infra/auth";
import { AuthService } from "../service";
import { AuthRepository } from "../repository";
import * as repo from "./repository";
import { requestMagicLinkSchema, consumeMagicLinkSchema } from "./schemas";

const SERVICE_TOKEN_HEADER = "x-goberna-service-token";

function tokenHeaderMatches(provided: string, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function generateMagicToken(): string {
  // 32 bytes = 64 hex chars. Espacio 2^256 — guess-resistant.
  return randomBytes(32).toString("hex");
}

/**
 * Mismo patrón que el setAuthCookies del login handler (auth/routes.ts).
 * Usa reply.header("Set-Cookie", ...) directo porque el repo no registra
 * @fastify/cookie como plugin — todas las cookies se setean a mano.
 */
function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string, isProd: boolean): void {
  const secure = isProd ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.accessToken}=${accessToken}; Path=/; SameSite=Lax${secure}; HttpOnly; Max-Age=31536000`,
  );
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.refreshToken}=${refreshToken}; Path=/; SameSite=Lax${secure}; HttpOnly; Max-Age=2592000`,
  );
  // Non-httpOnly session flag for Next.js middleware to detect auth state
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.session}=1; Path=/; SameSite=Lax${secure}; Max-Age=31536000`,
  );
}

export function buildMagicLinkRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const isProd = env.nodeEnv === "production";
    const authRepo = new AuthRepository(pool);
    const authService = new AuthService(authRepo, env);

    // ── POST /api/auth/magic-link/request ────────────────────────────
    // Internal: solo nexus-control (con service token) emite tokens. Genera
    // un token random + lo persiste + devuelve la URL para que nexus la
    // mande por WhatsApp en el step whatsapp_welcome.
    app.post("/api/auth/magic-link/request", async (request, reply) => {
      const requestId = String(request.id);

      if (!env.onboardingServiceToken) {
        return reply.code(503).send(
          errorPayload(requestId, "MAGIC_LINK_NOT_CONFIGURED", "endpoint no configurado"),
        );
      }
      const headerValue = request.headers[SERVICE_TOKEN_HEADER];
      const provided = typeof headerValue === "string" ? headerValue : "";
      if (!tokenHeaderMatches(provided, env.onboardingServiceToken)) {
        return reply.code(401).send(
          errorPayload(requestId, "AUTH_TOKEN_INVALID", "service token invalido"),
        );
      }

      const parsed = requestMagicLinkSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }
      const input = parsed.data;

      // Si ya hay user con ese phone, lo linkea al token. Si no, queda
      // user_id null y consume hace match contra postulación pendiente.
      const existingUser = await authRepo.findUserByPhone(input.phone_e164);

      try {
        const token = generateMagicToken();
        const expiresAt = new Date(Date.now() + input.expires_in_hours * 3600 * 1000);

        const row = await repo.create({
          token,
          user_id: existingUser?.id ?? null,
          phone_e164: input.phone_e164,
          purpose: input.purpose,
          redirect_url: input.redirect_url ?? null,
          expires_at: expiresAt,
        });

        const consumeUrl = `${env.publicBaseUrl}/magic?token=${token}`;
        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          token,
          consume_url: consumeUrl,
          expires_at: row.expires_at.toISOString(),
          existing_user: !!existingUser,
        });
      } catch (error) {
        app.log.error({ err: error, request_id: requestId }, "magic-link request failed");
        return reply.code(500).send(
          errorPayload(requestId, "MAGIC_LINK_REQUEST_ERROR", "error generando magic link"),
        );
      }
    });

    // ── POST /api/auth/magic-link/consume ────────────────────────────
    // Público (rate-limited). Browser lo llama tras abrir el link recibido
    // por WhatsApp. Atomic consume → emite JWT cookie + body con user info.
    app.post("/api/auth/magic-link/consume", {
      config: {
        rateLimit: {
          max: env.rateLimitAuthPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (req) => req.ip,
        },
      },
    }, async (request, reply) => {
      const requestId = String(request.id);

      const parsed = consumeMagicLinkSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      try {
        const ip = (request.ip ?? null) as string | null;
        const consumed = await repo.consume(parsed.data.token, ip);
        if (!consumed) {
          // Diferenciamos no-encontrado vs ya-consumido vs expirado:
          // el UPDATE atómico no nos lo dice, así que hacemos un SELECT.
          const existing = await repo.findByToken(parsed.data.token);
          if (!existing) {
            return reply.code(404).send(errorPayload(requestId, "MAGIC_LINK_NOT_FOUND", "link inválido"));
          }
          if (existing.consumed_at) {
            return reply.code(410).send(errorPayload(requestId, "MAGIC_LINK_USED", "link ya usado"));
          }
          return reply.code(410).send(errorPayload(requestId, "MAGIC_LINK_EXPIRED", "link expirado"));
        }

        // Resolver user del token consumido.
        let user = consumed.user_id ? await authRepo.findUserById(consumed.user_id) : null;
        let autoLinked = false;

        if (!user && consumed.phone_e164) {
          user = await authRepo.findUserByPhone(consumed.phone_e164);
          if (user) {
            autoLinked = true;
          } else {
            // No hay user pre-creado. El auto-create pleno (con linkeo a
            // candidatos.postulacion + user_campaigns) llega en follow-up
            // — por ahora pedimos que el cliente complete registro Firebase
            // o que el admin termine de crear el user.
            return reply.code(412).send(
              errorPayload(requestId, "MAGIC_LINK_NO_USER", "magic link válido pero el usuario no existe — completar registro primero"),
            );
          }
        }

        if (!user) {
          return reply.code(404).send(errorPayload(requestId, "USER_NOT_FOUND", "usuario asociado al link no existe"));
        }

        const result = await authService.issueTokensForUser(user);
        setAuthCookies(reply, result.access_token, result.refresh_token, isProd);

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          auto_linked: autoLinked,
          redirect_url: consumed.redirect_url,
          ...result,
        });
      } catch (error) {
        app.log.error({ err: error, request_id: requestId }, "magic-link consume failed");
        return reply.code(500).send(
          errorPayload(requestId, "MAGIC_LINK_CONSUME_ERROR", "error consumiendo magic link"),
        );
      }
    });
  };
}
