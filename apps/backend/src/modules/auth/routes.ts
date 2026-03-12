import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import type { AppEnv } from "../../config/env";
import { pool } from "../../db";
import { errorPayload } from "../../infra/http";
import { AUTH_COOKIE_NAMES, parseCookies, type AuthenticatedRequest } from "../../infra/auth";
import { AuthRepository } from "./repository";
import { changePasswordSchema, loginSchema, refreshSchema, registerSchema, resetPasswordSchema } from "./schemas";
import { authorize } from "../../infra/authorize";
import { AppError, AuthService } from "./service";
import * as invitationsRepo from "../invitations/repository";
import * as accessCodesRepo from "../access-codes/repository";

// ── Cookie helpers ──────────────────────────────────────────────────

/**
 * Set auth cookies (httpOnly for tokens, plain for session indicator).
 * Fastify supports multiple Set-Cookie values via reply.header() — each call appends.
 * `isProd` controls the Secure flag — derived from `env.nodeEnv` at build-time.
 */
function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
  isProd: boolean,
): void {
  const secure = isProd ? "; Secure" : "";

  // httpOnly access token — 1 year (matches JWT_ACCESS_EXPIRES_IN default)
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.accessToken}=${accessToken}; Path=/; SameSite=Lax${secure}; HttpOnly; Max-Age=31536000`,
  );

  // httpOnly refresh token — 1 year, restricted to /api/auth paths only
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.refreshToken}=${refreshToken}; Path=/api/auth; SameSite=Lax${secure}; HttpOnly; Max-Age=31536000`,
  );

  // Non-httpOnly session flag — lets Next.js middleware detect auth state
  // Contains no sensitive data, just "1" to indicate a session exists
  reply.header(
    "Set-Cookie",
    `${AUTH_COOKIE_NAMES.session}=1; Path=/; SameSite=Lax${secure}; Max-Age=31536000`,
  );
}

/** Clear all auth cookies on logout or failed refresh */
function clearAuthCookies(reply: FastifyReply, isProd: boolean): void {
  const secure = isProd ? "; Secure" : "";

  reply.header("Set-Cookie", `${AUTH_COOKIE_NAMES.accessToken}=; Path=/; SameSite=Lax${secure}; HttpOnly; Max-Age=0`);
  reply.header("Set-Cookie", `${AUTH_COOKIE_NAMES.refreshToken}=; Path=/api/auth; SameSite=Lax${secure}; HttpOnly; Max-Age=0`);
  reply.header("Set-Cookie", `${AUTH_COOKIE_NAMES.session}=; Path=/; SameSite=Lax${secure}; Max-Age=0`);
}

export function buildAuthRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const repo = new AuthRepository(pool);
    const service = new AuthService(repo, env);
    const isProd = env.nodeEnv === "production";

    // ── POST /api/auth/login ───────────────────────────────────────────
    // Supports login by email OR phone number
    app.post("/api/auth/login", {
      config: {
        rateLimit: {
          max: env.rateLimitAuthPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.ip,
        },
      },
    }, async (request, reply) => {
      const requestId = String(request.id);

      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      try {
        const { identifier, password } = parsed.data;
        
        // Determine if identifier is email or phone
        const isEmail = identifier.includes("@");
        
        // Try to find user by email or phone
        const user = isEmail
          ? await repo.findUserByEmail(identifier)
          : await repo.findUserByPhone(identifier);

        if (!user) {
          return reply.code(401).send(errorPayload(requestId, "AUTH_INVALID_CREDENTIALS", "credenciales incorrectas"));
        }

        const result = await service.loginWithUser(user, password);
        setAuthCookies(reply, result.access_token, result.refresh_token, isProd);
        return reply.code(200).send({ ok: true, request_id: requestId, ...result });
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        throw error;
      }
    });

    // ── POST /api/auth/refresh ─────────────────────────────────────────
    // Accepts refresh_token from JSON body (mobile) OR httpOnly cookie (web)
    app.post("/api/auth/refresh", {
      config: {
        rateLimit: {
          max: env.rateLimitAuthPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.ip,
        },
      },
    }, async (request, reply) => {
      const requestId = String(request.id);

      // Try body first (mobile), then httpOnly cookie (web)
      const parsed = refreshSchema.safeParse(request.body);
      let refreshToken: string | undefined;

      if (parsed.success) {
        refreshToken = parsed.data.refresh_token;
      } else {
        // Fall back to httpOnly cookie (reuse shared parser)
        const cookies = parseCookies(request.headers.cookie);
        refreshToken = cookies[AUTH_COOKIE_NAMES.refreshToken];
      }

      if (!refreshToken) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "refresh_token requerido"));
      }

      try {
        const result = await service.refresh(refreshToken);
        setAuthCookies(reply, result.access_token, result.refresh_token, isProd);
        return reply.code(200).send({ ok: true, request_id: requestId, ...result });
      } catch (error) {
        // Clear stale cookies so the browser doesn't get stuck retrying
        clearAuthCookies(reply, isProd);
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        throw error;
      }
    });

    // ── POST /api/auth/logout ──────────────────────────────────────────
    app.post(
      "/api/auth/logout",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as AuthenticatedRequest).userId;

        await service.logout(userId);
        clearAuthCookies(reply, isProd);
        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // ── POST /api/auth/change-password ─────────────────────────────────
    app.post(
      "/api/auth/change-password",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as AuthenticatedRequest).userId;

        const parsed = changePasswordSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          await service.changePassword(userId, parsed.data.current_password, parsed.data.new_password);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          if (error instanceof AppError) {
            return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
          }
          throw error;
        }
      },
    );

    // ── POST /api/auth/register ────────────────────────────────────────
    // Creates user with phone as primary identifier
    // Email is optional - if not provided, generates {phone}@goberna.pe
    app.post("/api/auth/register", {
      config: {
        rateLimit: {
          max: env.rateLimitAuthPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.ip,
        },
      },
    }, async (request, reply) => {
      const requestId = String(request.id);

      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      try {
        const { phone, password, full_name, region, campaign_id, email: providedEmail, invitation_code, access_code } = parsed.data;

        // ── Validate invitation code if provided ──────────────────────────
        let invitationRow: Awaited<ReturnType<typeof invitationsRepo.findByCode>> = null;
        if (invitation_code) {
          invitationRow = await invitationsRepo.findByCode(invitation_code);
          if (!invitationRow) {
            return reply.code(400).send(errorPayload(requestId, "INVITATION_NOT_FOUND", "codigo de invitacion invalido"));
          }
          if (!invitationsRepo.isValid(invitationRow)) {
            return reply.code(400).send(errorPayload(requestId, "INVITATION_EXPIRED", "codigo de invitacion expirado o agotado"));
          }
          // Code must match the campaign they're registering for
          if (invitationRow.campaign_id !== campaign_id) {
            return reply.code(400).send(errorPayload(requestId, "INVITATION_CAMPAIGN_MISMATCH", "codigo no corresponde a este candidato"));
          }
        }

        // ── Validate access code (4-char campaign code) if provided ──────
        // El access code valida que el campaign_id corresponde al codigo,
        // pero no requiere campaign_id en el body — lo podemos resolver desde el codigo.
        let accessCodeCampaignId = campaign_id;
        if (access_code) {
          const accessCodeRow = await accessCodesRepo.findByCode(access_code);
          if (!accessCodeRow) {
            return reply.code(400).send(errorPayload(requestId, "ACCESS_CODE_NOT_FOUND", "codigo de acceso invalido"));
          }
          // Si se provee campaign_id tambien, debe coincidir
          if (campaign_id && accessCodeRow.campaign_id !== campaign_id) {
            return reply.code(400).send(errorPayload(requestId, "ACCESS_CODE_CAMPAIGN_MISMATCH", "codigo no corresponde a este candidato"));
          }
          // El campaign_id viene del access code (no necesita que el usuario lo sepa)
          accessCodeCampaignId = accessCodeRow.campaign_id;
        }

        // Check if phone already registered
        const existingByPhone = await repo.findUserByPhone(phone);
        if (existingByPhone) {
          return reply.code(409).send(errorPayload(requestId, "AUTH_PHONE_EXISTS", "telefono ya registrado"));
        }

        // Generate email if not provided: {phone}@goberna.pe
        const email = providedEmail ?? `${phone.replace(/\D/g, "")}@goberna.pe`;

        // Check if email already exists (in case they provided one)
        if (providedEmail) {
          const existingByEmail = await repo.findUserByEmail(email);
          if (existingByEmail) {
            return reply.code(409).send(errorPayload(requestId, "AUTH_EMAIL_EXISTS", "email ya registrado"));
          }
        }

        // Effective campaign_id: from access_code or from body
        const effectiveCampaignId = accessCodeCampaignId;

        // Verify campaign exists (skip if invitation or access_code already validated — they joined campaigns)
        if (!invitationRow && !access_code) {
          const { rows: campaignRows } = await pool.query(
            "SELECT id FROM campaigns WHERE id = $1 AND status = 'active'",
            [effectiveCampaignId],
          );
          if (campaignRows.length === 0) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "candidato no encontrado"));
          }
        }

        const passwordHash = await service.hashPassword(password);
        const user = await repo.createUser(
          email,
          passwordHash,
          full_name,
          phone,
          region,
        );

        // Auto-accept: create approved access request + add to campaign directly
        // (temporary: skip pending state so mobile users get immediate access)
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Create access request as already approved
          await client.query(
            `INSERT INTO access_requests (user_id, campaign_id, region, perm_tierra, perm_digital, status, resolved_at)
             VALUES ($1, $2, $3, true, true, 'approved', now())
             ON CONFLICT (user_id, campaign_id) WHERE status = 'pending' DO NOTHING`,
            [user.id, effectiveCampaignId, region],
          );

          // Add user directly to campaign as agente_campo
          await client.query(
            `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital, region)
             VALUES ($1, $2, 'agente_campo', 'active', true, true, $3)
             ON CONFLICT (user_id, campaign_id)
             DO UPDATE SET role = 'agente_campo', status = 'active', perm_tierra = true, perm_digital = true, region = $3, assigned_at = now()`,
            [user.id, effectiveCampaignId, region],
          );

          await client.query("COMMIT");
        } catch (txErr) {
          await client.query("ROLLBACK");
          throw txErr;
        } finally {
          client.release();
        }

        // ── Consume invitation code (after successful registration) ───────
        if (invitationRow) {
          await invitationsRepo.incrementUsage(invitationRow.id);
        }

        app.log.info({
          user_id: user.id,
          campaign_id: effectiveCampaignId,
          region,
          phone,
          invitation_code: invitation_code ?? null,
          access_code: access_code ?? null,
          request_id: requestId,
        }, "user registered and auto-accepted as agente_campo (phone-based)");

        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            phone: user.phone,
            region: user.region,
            role: user.role,
            status: user.status,
          },
        });
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        throw error;
      }
    });

    // ── GET /api/auth/me ───────────────────────────────────────────────
    app.get(
      "/api/auth/me",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        const user = await repo.findUserById(authed.userId);
        if (!user) {
          return reply.code(404).send(errorPayload(requestId, "USER_NOT_FOUND", "usuario no encontrado"));
        }

        // Admin users see ALL active campaigns; others only their assigned ones
        const campaigns = user.role === "admin"
          ? await repo.getAllActiveCampaigns()
          : await repo.getUserCampaigns(user.id);

        const campaignsList = campaigns.map((c) => ({
          id: c.campaign_id,
          name: c.campaign_name,
          slug: c.campaign_slug,
          role: c.role,
          perm_audio_admin: c.perm_audio_admin,
        }));

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            status: user.status,
          },
          campaigns: campaignsList,
        });
      },
    );

    // ── POST /api/auth/reset-password ──────────────────────────────────
    // For users who were marked for password reset (password_reset_required = true)
    // User provides their identifier (phone/email), current password, and new password
    // This clears the password_reset_required flag
    const resetPasswordOpts = {
      config: {
        rateLimit: {
          max: env.rateLimitAuthPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request: FastifyRequest) => request.ip,
        },
      },
    } as const;

    const resetPasswordHandler = async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = String(request.id);

      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      try {
        const { identifier, current_password, new_password } = parsed.data;
        
        // Find user by email or phone
        const isEmail = identifier.includes("@");
        const user = isEmail
          ? await repo.findUserByEmail(identifier)
          : await repo.findUserByPhone(identifier);

        if (!user) {
          return reply.code(401).send(errorPayload(requestId, "AUTH_INVALID_CREDENTIALS", "credenciales incorrectas"));
        }

        // Verify user is marked for reset
        if (!user.password_reset_required) {
          return reply.code(400).send(errorPayload(requestId, "AUTH_RESET_NOT_REQUIRED", "no se requiere cambio de password"));
        }

        // Use existing change password logic (verifies current password)
        await service.changePassword(user.id, current_password, new_password);
        
        // Clear the reset flag
        await repo.clearPasswordResetRequired(user.id);

        app.log.info({ user_id: user.id, request_id: requestId }, "user reset password successfully");

        return reply.code(200).send({ ok: true, request_id: requestId, message: "password actualizada" });
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        throw error;
      }
    };

    app.post("/api/auth/reset-password", resetPasswordOpts, resetPasswordHandler);
    // Compat alias: mobile app sends /api/api/auth/reset-password (API_BASE already includes /api)
    app.post("/api/api/auth/reset-password", resetPasswordOpts, resetPasswordHandler);

    // ── POST /api/users/:userId/set-password ───────────────────────────
    // Admin/Candidato sets a new password directly for a team member.
    // Does NOT require the current password — admin-only operation.
    // Cannot target admin accounts.
    app.post(
      "/api/users/:userId/set-password",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { userId } = request.params as { userId: string };
        const body = request.body as { password?: string };

        if (!body.password || body.password.length < 6) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "la contraseña debe tener al menos 6 caracteres"));
        }

        const targetUser = await repo.findUserById(userId);
        if (!targetUser) {
          return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "usuario no encontrado"));
        }

        // Protect admin accounts
        if (targetUser.role === "admin") {
          return reply.code(403).send(errorPayload(requestId, "FORBIDDEN", "no se puede cambiar la contraseña de un admin"));
        }

        const newHash = await service.hashPassword(body.password);
        await repo.updatePasswordHash(userId, newHash);
        await repo.setPasswordResetRequired(userId, false);

        app.log.info({
          target_user_id: userId,
          requester_id: (request as AuthenticatedRequest).userId,
          request_id: requestId,
        }, "admin set password for user");

        return reply.code(200).send({ ok: true, request_id: requestId, message: "contraseña actualizada" });
      },
    );

    // ── POST /api/users/:userId/require-password-reset ─────────────────
    // Admin/Consultor marks a user as requiring password reset on next login
    // The user will see a "set new password" screen when they try to login
    app.post(
      "/api/users/:userId/require-password-reset",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { userId } = request.params as { userId: string };

        // Find the target user
        const targetUser = await repo.findUserById(userId);
        if (!targetUser) {
          return reply.code(404).send(errorPayload(requestId, "USER_NOT_FOUND", "usuario no encontrado"));
        }

        // Cannot reset admin passwords (for security)
        if (targetUser.role === "admin") {
          return reply.code(403).send(errorPayload(requestId, "FORBIDDEN", "no se puede reiniciar password de admin"));
        }

        // Mark user for password reset
        await repo.setPasswordResetRequired(userId, true);

        app.log.info({ 
          target_user_id: userId,
          requester_id: (request as AuthenticatedRequest).userId,
          request_id: requestId,
        }, "user marked for password reset");

        return reply.code(200).send({ 
          ok: true, 
          request_id: requestId, 
          message: "usuario marcado para reiniciar password",
        });
      },
    );
  };
}
