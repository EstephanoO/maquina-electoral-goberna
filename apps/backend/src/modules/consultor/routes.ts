/**
 * Routes del módulo consultor — endpoints que consume el MCP server.
 *
 * Auth: rol "consultor" o superior (admin). Cada endpoint es scoped al
 * usuario que llama (consultor solo ve sus candidatos asignados).
 *
 * Fase A (read-only):
 *   GET  /api/consultor/candidates                 — listado para el menú
 *   GET  /api/consultor/candidates/:id/context     — contexto completo
 *
 * Fase B (write — agregada después):
 *   POST /api/consultor/decks                      — upload de un deck
 *   GET  /api/consultor/decks?candidate_id=X       — listar decks
 */
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { AppEnv } from "../../config/env";
import { pool } from "../../db";
import { errorPayload } from "../../infra/http";
import { authorize } from "../../infra/authorize";
import type { AuthenticatedRequest } from "../../infra/auth";
import { AuthRepository } from "../auth/repository";
import { AuthService } from "../auth/service";

import * as repo from "./repository";

export function buildConsultorRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const authRepo = new AuthRepository(pool);
    const authService = new AuthService(authRepo, env);

    // ── POST /api/admin/consultor/users/:id/token ─────────────────────
    // Admin emite un access_token long-lived (default 365d) para el
    // consultor del id dado. El consultor lo guarda en
    // ~/.config/goberna/token y el MCP server lo usa para llamar a la API.
    //
    // Uso: el admin ejecuta esto, copia el token, lo manda por canal seguro
    // al consultor.
    app.post<{ Params: { id: string } }>(
      "/api/admin/consultor/users/:id/token",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["admin"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = request.params.id;
        try {
          const user = await authRepo.findUserById(userId);
          if (!user) {
            return reply.code(404).send(
              errorPayload(requestId, "USER_NOT_FOUND", "usuario no encontrado"),
            );
          }
          if (user.role !== "consultor" && user.role !== "admin") {
            return reply.code(409).send(
              errorPayload(
                requestId,
                "ROLE_NOT_CONSULTOR",
                `el usuario tiene rol "${user.role}" — solo emitimos tokens a rol consultor o admin`,
              ),
            );
          }
          const tokens = await authService.issueTokensForUser({
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            phone: user.phone,
            region: user.region,
            role: user.role,
            status: user.status,
          });
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            user: { id: user.id, email: user.email, role: user.role },
            access_token: tokens.access_token,
            expires_in: env.jwtAccessExpiresIn,
            note: "Pegar este token en ~/.config/goberna/token de la PC del consultor.",
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "consultor/token failed");
          return reply.code(500).send(
            errorPayload(requestId, "CONSULTOR_TOKEN_ERROR", "error emitiendo token"),
          );
        }
      },
    );

    // ── GET /api/consultor/candidates ─────────────────────────────────
    // Devuelve la lista de candidatos asignados al consultor del token.
    // Admins ven todos los candidatos (sin filtro por consultor_candidato).
    app.get(
      "/api/consultor/candidates",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["consultor"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        try {
          const rows =
            req.userRole === "admin"
              ? await repo.listConsultorCandidates(req.userId).catch(() => [])
              : await repo.listConsultorCandidates(req.userId);
          // Si admin y no tiene asignaciones (lo más común), traer TODOS los
          // candidatos para que pueda probar/operar. En Fase B: filtrarlo.
          if (req.userRole === "admin" && rows.length === 0) {
            const adminAll = await repo.listAllCandidatesForAdmin();
            return reply.code(200).send({
              ok: true,
              request_id: requestId,
              candidates: adminAll,
              admin_all: true,
            });
          }
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            candidates: rows,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "consultor/candidates failed");
          return reply.code(500).send(
            errorPayload(requestId, "CONSULTOR_CANDIDATES_ERROR", "error listando candidatos"),
          );
        }
      },
    );

    // ── GET /api/admin/consultores ────────────────────────────────────
    // Lista todos los consultores con asignaciones + flag global access.
    app.get(
      "/api/admin/consultores",
      {
        preHandler: [app.authenticate, authorize({ roles: ["admin"] })],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const consultores = await repo.listConsultorUsers();
        return reply.code(200).send({ ok: true, request_id: requestId, consultores });
      },
    );

    // GET /api/admin/consultores/:id/assignments
    app.get<{ Params: { id: string } }>(
      "/api/admin/consultores/:id/assignments",
      {
        preHandler: [app.authenticate, authorize({ roles: ["admin"] })],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const assignments = await repo.listAssignmentsForConsultor(request.params.id);
        return reply.code(200).send({ ok: true, request_id: requestId, assignments });
      },
    );

    // POST /api/admin/consultores/:id/assignments  body: { candidato_id, campaign_id? }
    app.post<{ Params: { id: string } }>(
      "/api/admin/consultores/:id/assignments",
      {
        preHandler: [app.authenticate, authorize({ roles: ["admin"] })],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const schema = z.object({
          candidato_id: z.coerce.number().int().positive(),
          campaign_id: z.string().uuid().optional().nullable(),
        });
        const parsed = schema.safeParse(request.body);
        if (!parsed.success) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "candidato_id requerido"));
        }
        await repo.assignCandidatoToConsultor(
          request.params.id,
          parsed.data.candidato_id,
          parsed.data.campaign_id ?? null,
          req.userId,
        );
        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // DELETE /api/admin/consultores/:id/assignments/:candidatoId
    app.delete<{ Params: { id: string; candidatoId: string } }>(
      "/api/admin/consultores/:id/assignments/:candidatoId",
      {
        preHandler: [app.authenticate, authorize({ roles: ["admin"] })],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const candidatoId = Number.parseInt(request.params.candidatoId, 10);
        if (!Number.isInteger(candidatoId) || candidatoId <= 0) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "candidatoId inválido"));
        }
        await repo.unassignCandidatoFromConsultor(request.params.id, candidatoId);
        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // POST /api/admin/consultores/:id/global-access  body: { notes? }
    app.post<{ Params: { id: string } }>(
      "/api/admin/consultores/:id/global-access",
      {
        preHandler: [app.authenticate, authorize({ roles: ["admin"] })],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const schema = z.object({ notes: z.string().max(500).optional() });
        const parsed = schema.safeParse(request.body ?? {});
        const notes = parsed.success ? parsed.data.notes ?? null : null;
        await repo.grantGlobalAccess(request.params.id, req.userId, notes);
        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // DELETE /api/admin/consultores/:id/global-access
    app.delete<{ Params: { id: string } }>(
      "/api/admin/consultores/:id/global-access",
      {
        preHandler: [app.authenticate, authorize({ roles: ["admin"] })],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        await repo.revokeGlobalAccess(request.params.id);
        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // ── GET /api/consultor/candidates/:id/context ─────────────────────
    // Devuelve el CandidatoContext completo. Valida ownership.
    app.get<{ Params: { id: string } }>(
      "/api/consultor/candidates/:id/context",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["consultor"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const parsed = z.coerce.number().int().positive().safeParse(request.params.id);
        if (!parsed.success) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "id de candidato inválido"));
        }
        const candidatoId = parsed.data;
        try {
          const ctx =
            req.userRole === "admin"
              ? await repo.adminGetCandidatoContext(candidatoId)
              : await repo.getCandidatoContextForConsultor(req.userId, candidatoId);
          if (!ctx) {
            return reply.code(404).send(
              errorPayload(
                requestId,
                "CANDIDATO_NOT_ACCESSIBLE",
                "candidato no existe o no está asignado a este consultor",
              ),
            );
          }
          return reply
            .code(200)
            .send({ ok: true, request_id: requestId, candidato_id: candidatoId, ...ctx });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "consultor/candidate-context failed");
          return reply.code(500).send(
            errorPayload(requestId, "CONSULTOR_CONTEXT_ERROR", "error obteniendo contexto"),
          );
        }
      },
    );
  };
}
