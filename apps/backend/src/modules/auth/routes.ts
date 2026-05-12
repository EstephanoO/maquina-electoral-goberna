import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import type { AppEnv } from "../../config/env";
import { pool } from "../../db";
import { errorPayload } from "../../infra/http";
import { AUTH_COOKIE_NAMES, parseCookies, type AuthenticatedRequest } from "../../infra/auth";
import { AuthRepository } from "./repository";
import { changePasswordSchema, joinCampaignSchema, loginSchema, refreshSchema, registerFirebaseSchema, registerSchema, resetPasswordSchema, setInitialPasswordSchema, whatsappRegisterSchema, whatsappSendSchema, whatsappVerifyLoginSchema } from "./schemas";
import { authorize } from "../../infra/authorize";
import { AppError, AuthService } from "./service";
import { verifyFirebaseIdToken } from "./firebase-verify";
import { normalizePhone, sendOtp, verifyOtp } from "./whatsapp-otp";
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

    // ── POST /api/auth/set-initial-password ────────────────────────────
    // Setea password POR PRIMERA VEZ. Solo válido si user.password_hash IS
    // NULL (caso típico: cuenta creada por wizard onboarding sin password,
    // que después de Fase 3 elige una contraseña).
    //
    // Si el user ya tiene password, devuelve 409. Para cambiar password
    // existente usar /api/auth/change-password (requiere current_password).
    app.post(
      "/api/auth/set-initial-password",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as AuthenticatedRequest).userId;

        const parsed = setInitialPasswordSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const user = await repo.findUserById(userId);
          if (!user) {
            return reply.code(404).send(errorPayload(requestId, "USER_NOT_FOUND", "user no encontrado"));
          }
          if (user.password_hash) {
            return reply.code(409).send(
              errorPayload(requestId, "PASSWORD_ALREADY_SET", "ya existe contraseña — usá change-password"),
            );
          }
          const hash = await service.hashPassword(parsed.data.new_password);
          await repo.updatePasswordHash(userId, hash);
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

    // ── POST /api/auth/register-firebase ───────────────────────────────
    // Registro OTP-only via Firebase. El cliente envía:
    //   { id_token, full_name, region, [invitation_code | access_code | campaign_id], email? }
    //
    // El phone se DERIVA del token (anti-spoofing) — no se acepta phone en
    // el body. Si el user ya existe (por phone o firebase_uid), responde
    // 409 USER_EXISTS sugiriendo usar /api/auth/firebase-verify (login).
    //
    // Crea user con password_hash=NULL, firebase_uid=verified.uid, agrega
    // a la campaña como agente_campo, y emite JWT idéntico a /login.
    app.post("/api/auth/register-firebase", {
      config: {
        rateLimit: {
          max: env.rateLimitAuthPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.ip,
        },
      },
    }, async (request, reply) => {
      const requestId = String(request.id);

      const parsed = registerFirebaseSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      if (!env.firebaseProjectId) {
        return reply.code(503).send(errorPayload(requestId, "FIREBASE_NOT_CONFIGURED", "FIREBASE_PROJECT_ID no configurado"));
      }

      const { id_token, full_name, region, invitation_code, access_code, campaign_id, email: providedEmail } = parsed.data;

      // 1. Verificar id_token
      let verified: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
      try {
        verified = await verifyFirebaseIdToken(id_token, env.firebaseProjectId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "verificación falló";
        app.log.warn({ err: msg, request_id: requestId }, "register-firebase: token rechazado");
        return reply.code(401).send(errorPayload(requestId, "FIREBASE_INVALID_TOKEN", msg.slice(0, 120)));
      }
      if (!verified.phone_number) {
        return reply.code(400).send(errorPayload(requestId, "FIREBASE_PHONE_MISSING", "id_token no incluye phone_number"));
      }
      const normalizedPhone = verified.phone_number.replace(/\D/g, "");

      try {
        // 2. Anti-duplicado: si ya existe por phone o firebase_uid, rechazar.
        const existingByPhone = await repo.findUserByPhone(normalizedPhone);
        if (existingByPhone) {
          return reply.code(409).send(errorPayload(requestId, "USER_EXISTS", "usuario ya existe — usar /api/auth/firebase-verify para login"));
        }
        const existingByUid = await repo.findUserByFirebaseUid(verified.uid);
        if (existingByUid) {
          return reply.code(409).send(errorPayload(requestId, "USER_EXISTS", "firebase_uid ya registrado — usar /api/auth/firebase-verify"));
        }

        // 3. Resolver campaign_id desde invitation/access_code (mismo flow
        // que /api/auth/register).
        let invitationRow: Awaited<ReturnType<typeof invitationsRepo.findByCode>> = null;
        let resolvedCampaignId = campaign_id ?? null;

        if (invitation_code) {
          invitationRow = await invitationsRepo.findByCode(invitation_code);
          if (!invitationRow) {
            return reply.code(400).send(errorPayload(requestId, "INVITATION_NOT_FOUND", "codigo de invitacion invalido"));
          }
          if (!invitationsRepo.isValid(invitationRow)) {
            return reply.code(400).send(errorPayload(requestId, "INVITATION_EXPIRED", "codigo de invitacion expirado o agotado"));
          }
          resolvedCampaignId = invitationRow.campaign_id;
        } else if (access_code) {
          const accessCodeRow = await accessCodesRepo.findByCode(access_code);
          if (!accessCodeRow) {
            return reply.code(400).send(errorPayload(requestId, "ACCESS_CODE_NOT_FOUND", "codigo de acceso invalido"));
          }
          resolvedCampaignId = accessCodeRow.campaign_id;
        }

        if (!resolvedCampaignId) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "campaign_id requerido"));
        }

        // 4. Verificar que la campaña existe + activa (skip si invitation/access_code ya validó).
        if (!invitationRow && !access_code) {
          const { rows: campaignRows } = await pool.query(
            "SELECT id FROM campaigns WHERE id = $1 AND status = 'active'",
            [resolvedCampaignId],
          );
          if (campaignRows.length === 0) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campaña no encontrada"));
          }
        }

        // 5. Crear user OTP-only (password_hash=NULL, firebase_uid set).
        const email = providedEmail ?? `${normalizedPhone}@goberna.pe`;
        const user = await repo.createUser(
          email,
          null,
          full_name,
          normalizedPhone,
          region,
          undefined,
          undefined,
          verified.uid,
        );

        // 6. Linkear a campaña como agente_campo (mismo flujo que /register).
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            `INSERT INTO access_requests (user_id, campaign_id, region, perm_tierra, perm_digital, status, resolved_at)
             VALUES ($1, $2, $3, true, true, 'approved', now())
             ON CONFLICT (user_id, campaign_id) WHERE status = 'pending' DO NOTHING`,
            [user.id, resolvedCampaignId, region],
          );
          await client.query(
            `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital, region)
             VALUES ($1, $2, 'agente_campo', 'active', true, true, $3)
             ON CONFLICT (user_id, campaign_id)
             DO UPDATE SET role = 'agente_campo', status = 'active', perm_tierra = true, perm_digital = true, region = $3, assigned_at = now()`,
            [user.id, resolvedCampaignId, region],
          );
          await client.query("COMMIT");
        } catch (txErr) {
          await client.query("ROLLBACK");
          throw txErr;
        } finally {
          client.release();
        }

        if (invitationRow) {
          await invitationsRepo.incrementUsage(invitationRow.id);
        }

        // 7. Emitir JWT idéntico a /login + setear cookies.
        const result = await service.issueTokensForUser(user);
        setAuthCookies(reply, result.access_token, result.refresh_token, isProd);

        app.log.info({
          user_id: user.id,
          campaign_id: resolvedCampaignId,
          firebase_uid: verified.uid,
          phone: normalizedPhone,
          request_id: requestId,
        }, "user registered via OTP (firebase) and auto-accepted as agente_campo");

        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          firebase: { uid: verified.uid, phone_number: verified.phone_number },
          ...result,
        });
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        app.log.error({ err: error, request_id: requestId }, "register-firebase failed");
        return reply.code(500).send(errorPayload(requestId, "REGISTER_FIREBASE_ERROR", "error registrando user OTP"));
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
          whatsapp_number:
            typeof c.campaign_config?.whatsapp_number === "string"
              ? (c.campaign_config.whatsapp_number as string)
              : null,
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

    // ── POST /api/auth/firebase-verify ─────────────────────────────────
    // Endpoint canónico de login OTP-only para mobile. Recibe el ID token
    // emitido por Firebase Phone Auth, lo valida contra Google, matchea
    // contra users por firebase_uid o phone, y emite JWT propio (access +
    // refresh) idéntico a /api/auth/login.
    //
    // Resolución de user:
    //   1. firebase_uid (linkeo previo migración 059 — máxima confianza).
    //   2. phone match → auto-link uid (si user no tiene otro uid).
    //   3. nada → 412 USER_NOT_FOUND_FOR_FIREBASE (registro previo requerido).
    //
    // Response (200) idéntica a /login: { access_token, refresh_token, user,
    // campaigns } + setea httpOnly cookies. Mobile guarda en expo-secure-store.
    //
    // Si FIREBASE_PROJECT_ID está vacío, el endpoint responde 503.
    const firebaseVerifyOpts = {
      config: {
        rateLimit: {
          max: env.rateLimitAuthPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request: FastifyRequest) => request.ip,
        },
      },
    } as const;

    app.post("/api/auth/firebase-verify", firebaseVerifyOpts, async (request, reply) => {
      const requestId = String(request.id);

      if (!env.firebaseProjectId) {
        return reply.code(503).send(errorPayload(requestId, "FIREBASE_NOT_CONFIGURED", "FIREBASE_PROJECT_ID no configurado"));
      }

      const body = request.body as { id_token?: unknown };
      if (typeof body?.id_token !== "string" || body.id_token.length < 50) {
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "id_token requerido"));
      }

      let verified: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
      try {
        verified = await verifyFirebaseIdToken(body.id_token, env.firebaseProjectId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "verificación falló";
        app.log.warn({ err: msg, request_id: requestId }, "firebase-verify: token rechazado");
        return reply.code(401).send(errorPayload(requestId, "FIREBASE_INVALID_TOKEN", msg.slice(0, 120)));
      }

      // Resolución del user en orden de confianza:
      //   1. firebase_uid (linkeo previo en migración 059 — máxima confianza)
      //   2. phone match (auto-link si coincide y no tiene uid)
      //   3. nada → 412 (cliente debe completar registro o pedir admin)
      const normalizedPhone = (verified.phone_number ?? "").replace(/\D/g, "");
      let user = await repo.findUserByFirebaseUid(verified.uid);
      let autoLinked = false;

      if (!user && normalizedPhone) {
        user = await repo.findUserByPhone(normalizedPhone);
        if (user) {
          const linked = await repo.linkUserFirebaseUid(user.id, verified.uid);
          if (!linked) {
            return reply.code(409).send(errorPayload(
              requestId,
              "FIREBASE_UID_CONFLICT",
              "el usuario ya tiene otra cuenta Firebase asociada — contactar admin",
            ));
          }
          autoLinked = true;
        }
      }

      app.log.info({
        request_id: requestId,
        firebase_uid: verified.uid,
        phone_present: !!verified.phone_number,
        user_matched: !!user,
        auto_linked: autoLinked,
      }, "firebase-verify: token válido");

      if (!user) {
        // TODO follow-up: si hay candidatos.postulacion pendiente con este
        // telefono_e164, auto-crear users row + linkear vía user_campaigns
        // con role 'candidato'. Por ahora el cliente debe completar registro.
        return reply.code(412).send(errorPayload(
          requestId,
          "USER_NOT_FOUND_FOR_FIREBASE",
          "phone verificado pero el usuario no existe — completar registro primero",
        ));
      }

      // Emite JWT cookie (web) + body con tokens (mobile guarda en expo-secure-store)
      try {
        const result = await service.issueTokensForUser(user);
        setAuthCookies(reply, result.access_token, result.refresh_token, isProd);
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          firebase: {
            uid: verified.uid,
            phone_number: verified.phone_number,
          },
          auto_linked: autoLinked,
          ...result,
        });
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        throw error;
      }
    });

    // ── POST /api/auth/whatsapp/send ───────────────────────────────────
    // Envía un código OTP de 6 dígitos al número via WhatsApp (bot Baileys
    // leads-crm). Body: { phone }. Rate limit: 1 send/60s por número en Redis
    // + rate limit por IP via fastify-rate-limit. Si bot no configurado,
    // responde 503.
    const whatsappSendOpts = {
      config: {
        rateLimit: {
          max: env.rateLimitAuthPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request: FastifyRequest) => request.ip,
        },
      },
    } as const;

    app.post("/api/auth/whatsapp/send", whatsappSendOpts, async (request, reply) => {
      const requestId = String(request.id);

      const parsed = whatsappSendSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      const result = await sendOtp(parsed.data.phone, {
        botUrl: env.whatsappBotUrl,
        botInstance: env.whatsappBotInstance,
        botToken: env.botSharedSecret || undefined,
        log: (msg, payload) => app.log.warn({ ...((payload as object) ?? {}), request_id: requestId }, msg),
      });

      if (!result.ok) {
        if (result.code === "RATE_LIMITED") {
          return reply.code(429).send({
            ok: false,
            request_id: requestId,
            code: "RATE_LIMITED",
            message: `Esperá ${result.retryAfterSeconds}s antes de pedir otro código.`,
            retry_after_seconds: result.retryAfterSeconds,
          });
        }
        if (result.code === "BOT_NOT_CONFIGURED") {
          return reply.code(503).send(errorPayload(requestId, "BOT_NOT_CONFIGURED", "WhatsApp OTP no configurado en backend"));
        }
        return reply.code(502).send(errorPayload(requestId, "BOT_SEND_FAILED", `no se pudo enviar el código por WhatsApp: ${result.detail}`));
      }

      app.log.info({ phone: normalizePhone(parsed.data.phone), request_id: requestId }, "whatsapp-otp: sent");
      return reply.code(200).send({
        ok: true,
        request_id: requestId,
        expires_in: result.expiresIn,
      });
    });

    // ── POST /api/auth/whatsapp/verify ─────────────────────────────────
    // Login OTP-only via WhatsApp. Recibe { phone, code }, valida contra Redis
    // y emite JWT. Si el user no existe → 412 (registrar primero via
    // /api/auth/whatsapp/register). Mismo shape de respuesta que firebase-verify.
    app.post("/api/auth/whatsapp/verify", whatsappSendOpts, async (request, reply) => {
      const requestId = String(request.id);

      const parsed = whatsappVerifyLoginSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      const verify = await verifyOtp(parsed.data.phone, parsed.data.code);
      if (!verify.ok) {
        const httpCode =
          verify.code === "OTP_NOT_FOUND" || verify.code === "OTP_EXPIRED" ? 410 :
          verify.code === "OTP_LOCKED" ? 429 : 401;
        return reply.code(httpCode).send({
          ok: false,
          request_id: requestId,
          code: verify.code,
          message: verify.code === "OTP_INVALID"
            ? `Código incorrecto. Te quedan ${verify.attemptsLeft} intentos.`
            : verify.code === "OTP_NOT_FOUND" ? "El código expiró o nunca fue enviado. Pedí uno nuevo."
            : verify.code === "OTP_LOCKED" ? "Demasiados intentos fallidos. Pedí un código nuevo."
            : "Código inválido.",
          ...(verify.code === "OTP_INVALID" ? { attempts_left: verify.attemptsLeft } : {}),
        });
      }

      const normalizedPhone = normalizePhone(parsed.data.phone);
      const user = await repo.findUserByPhone(normalizedPhone);
      if (!user) {
        return reply.code(412).send(errorPayload(
          requestId,
          "USER_NOT_FOUND",
          "phone verificado pero el usuario no existe — completar registro primero",
        ));
      }

      try {
        const result = await service.issueTokensForUser(user);
        setAuthCookies(reply, result.access_token, result.refresh_token, isProd);
        // needs_campaign: user existe pero no tiene campañas activas asignadas.
        // El cliente debe pedirle un access_code y llamar /auth/join-campaign.
        const needsCampaign = result.campaigns.length === 0;
        app.log.info(
          { user_id: user.id, phone: normalizedPhone, needs_campaign: needsCampaign, request_id: requestId },
          "whatsapp-otp: login OK",
        );
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          ...result,
          needs_campaign: needsCampaign,
        });
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        throw error;
      }
    });

    // ── POST /api/auth/whatsapp/register ───────────────────────────────
    // Registro OTP-only via WhatsApp. Body: { phone, code, full_name, region,
    // [invitation_code | access_code | campaign_id], email? }. Verifica el OTP
    // contra Redis, crea user + user_campaign como agente_campo, emite JWT.
    app.post("/api/auth/whatsapp/register", whatsappSendOpts, async (request, reply) => {
      const requestId = String(request.id);

      const parsed = whatsappRegisterSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      const verify = await verifyOtp(parsed.data.phone, parsed.data.code);
      if (!verify.ok) {
        const httpCode =
          verify.code === "OTP_NOT_FOUND" || verify.code === "OTP_EXPIRED" ? 410 :
          verify.code === "OTP_LOCKED" ? 429 : 401;
        return reply.code(httpCode).send({
          ok: false,
          request_id: requestId,
          code: verify.code,
          message: verify.code === "OTP_INVALID"
            ? `Código incorrecto. Te quedan ${verify.attemptsLeft} intentos.`
            : "Código inválido o expirado. Pedí uno nuevo.",
        });
      }

      const { full_name, region, invitation_code, access_code, campaign_id, email: providedEmail } = parsed.data;
      const normalizedPhone = normalizePhone(parsed.data.phone);

      try {
        // Anti-duplicado por phone (mismo patrón que register-firebase).
        const existing = await repo.findUserByPhone(normalizedPhone);
        if (existing) {
          return reply.code(409).send(errorPayload(requestId, "USER_EXISTS", "usuario ya existe — usar /api/auth/whatsapp/verify para login"));
        }

        // Resolver campaign_id desde invitation/access_code.
        let invitationRow: Awaited<ReturnType<typeof invitationsRepo.findByCode>> = null;
        let resolvedCampaignId = campaign_id ?? null;

        if (invitation_code) {
          invitationRow = await invitationsRepo.findByCode(invitation_code);
          if (!invitationRow) {
            return reply.code(400).send(errorPayload(requestId, "INVITATION_NOT_FOUND", "codigo de invitacion invalido"));
          }
          if (!invitationsRepo.isValid(invitationRow)) {
            return reply.code(400).send(errorPayload(requestId, "INVITATION_EXPIRED", "codigo de invitacion expirado o agotado"));
          }
          resolvedCampaignId = invitationRow.campaign_id;
        } else if (access_code) {
          const accessCodeRow = await accessCodesRepo.findByCode(access_code);
          if (!accessCodeRow) {
            return reply.code(400).send(errorPayload(requestId, "ACCESS_CODE_NOT_FOUND", "codigo de acceso invalido"));
          }
          resolvedCampaignId = accessCodeRow.campaign_id;
        }

        if (!resolvedCampaignId) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "campaign_id requerido"));
        }

        if (!invitationRow && !access_code) {
          const { rows: campaignRows } = await pool.query(
            "SELECT id FROM campaigns WHERE id = $1 AND status = 'active'",
            [resolvedCampaignId],
          );
          if (campaignRows.length === 0) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campaña no encontrada"));
          }
        }

        // Crear user OTP-only (password_hash=NULL, sin firebase_uid).
        const email = providedEmail ?? `${normalizedPhone}@goberna.pe`;
        const user = await repo.createUser(email, null, full_name, normalizedPhone, region);

        // Linkear a campaña como agente_campo.
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            `INSERT INTO access_requests (user_id, campaign_id, region, perm_tierra, perm_digital, status, resolved_at)
             VALUES ($1, $2, $3, true, true, 'approved', now())
             ON CONFLICT (user_id, campaign_id) WHERE status = 'pending' DO NOTHING`,
            [user.id, resolvedCampaignId, region],
          );
          await client.query(
            `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital, region)
             VALUES ($1, $2, 'agente_campo', 'active', true, true, $3)
             ON CONFLICT (user_id, campaign_id)
             DO UPDATE SET role = 'agente_campo', status = 'active', perm_tierra = true, perm_digital = true, region = $3, assigned_at = now()`,
            [user.id, resolvedCampaignId, region],
          );
          await client.query("COMMIT");
        } catch (txErr) {
          await client.query("ROLLBACK");
          throw txErr;
        } finally {
          client.release();
        }

        if (invitationRow) {
          await invitationsRepo.incrementUsage(invitationRow.id);
        }

        const result = await service.issueTokensForUser(user);
        setAuthCookies(reply, result.access_token, result.refresh_token, isProd);

        app.log.info({
          user_id: user.id,
          campaign_id: resolvedCampaignId,
          phone: normalizedPhone,
          request_id: requestId,
        }, "user registered via WhatsApp OTP and auto-accepted as agente_campo");

        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          ...result,
        });
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        app.log.error({ err: error, request_id: requestId }, "whatsapp/register failed");
        throw error;
      }
    });

    // ── POST /api/auth/join-campaign ───────────────────────────────────
    // Para users ya autenticados (OTP verify devolvió needs_campaign:true).
    // Recibe { access_code } y crea/reactiva user_campaign como agente_campo
    // contra la campaña que resuelva ese código. Devuelve user + campaigns
    // actualizados para que el cliente reconstruya el AppConfig.
    app.post(
      "/api/auth/join-campaign",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        const parsed = joinCampaignSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        const user = await repo.findUserById(authed.userId);
        if (!user) {
          return reply.code(404).send(errorPayload(requestId, "USER_NOT_FOUND", "usuario no encontrado"));
        }

        const accessCodeRow = await accessCodesRepo.findByCode(parsed.data.access_code);
        if (!accessCodeRow) {
          return reply.code(400).send(errorPayload(requestId, "ACCESS_CODE_NOT_FOUND", "codigo de acceso invalido"));
        }

        const campaignId = accessCodeRow.campaign_id;
        const region = user.region ?? "";

        try {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              `INSERT INTO access_requests (user_id, campaign_id, region, perm_tierra, perm_digital, status, resolved_at)
               VALUES ($1, $2, $3, true, true, 'approved', now())
               ON CONFLICT (user_id, campaign_id) WHERE status = 'pending' DO NOTHING`,
              [user.id, campaignId, region],
            );
            await client.query(
              `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital, region)
               VALUES ($1, $2, 'agente_campo', 'active', true, true, $3)
               ON CONFLICT (user_id, campaign_id)
               DO UPDATE SET role = 'agente_campo', status = 'active', perm_tierra = true, perm_digital = true, region = COALESCE(EXCLUDED.region, user_campaigns.region), assigned_at = now()`,
              [user.id, campaignId, region],
            );
            await client.query("COMMIT");
          } catch (txErr) {
            await client.query("ROLLBACK");
            throw txErr;
          } finally {
            client.release();
          }

          const campaigns = user.role === "admin"
            ? await repo.getAllActiveCampaigns()
            : await repo.getUserCampaigns(user.id);

          const campaignsList = campaigns.map((c) => ({
            id: c.campaign_id,
            name: c.campaign_name,
            slug: c.campaign_slug,
            role: c.role,
            perm_audio_admin: c.perm_audio_admin,
            whatsapp_number:
              typeof c.campaign_config?.whatsapp_number === "string"
                ? (c.campaign_config.whatsapp_number as string)
                : null,
          }));

          app.log.info(
            { user_id: user.id, campaign_id: campaignId, request_id: requestId },
            "user joined campaign via access_code",
          );

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
        } catch (error) {
          if (error instanceof AppError) {
            return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
          }
          app.log.error({ err: error, request_id: requestId }, "join-campaign failed");
          throw error;
        }
      },
    );

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
