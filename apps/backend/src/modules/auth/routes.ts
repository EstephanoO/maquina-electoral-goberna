import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import { pool } from "../../db";
import { errorPayload } from "../../infra/http";
import type { AuthenticatedRequest } from "../../infra/auth";
import { AuthRepository } from "./repository";
import { changePasswordSchema, loginSchema, refreshSchema, registerSchema } from "./schemas";
import { AppError, AuthService } from "./service";

export function buildAuthRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const repo = new AuthRepository(pool);
    const service = new AuthService(repo, env);

    // ── POST /api/auth/login ───────────────────────────────────────────
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
        const result = await service.login(parsed.data.email, parsed.data.password);
        return reply.code(200).send({ ok: true, request_id: requestId, ...result });
      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send(errorPayload(requestId, error.code, error.message));
        }
        throw error;
      }
    });

    // ── POST /api/auth/refresh ─────────────────────────────────────────
    app.post("/api/auth/refresh", async (request, reply) => {
      const requestId = String(request.id);

      const parsed = refreshSchema.safeParse(request.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      try {
        const result = await service.refresh(parsed.data.refresh_token);
        return reply.code(200).send({ ok: true, request_id: requestId, ...result });
      } catch (error) {
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
        const existing = await repo.findUserByEmail(parsed.data.email);
        if (existing) {
          return reply.code(409).send(errorPayload(requestId, "AUTH_EMAIL_EXISTS", "email ya registrado"));
        }

        const passwordHash = await service.hashPassword(parsed.data.password);
        const user = await repo.createUser(parsed.data.email, passwordHash, parsed.data.full_name);

        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
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
  };
}
