/**
 * /api/onboarding-fase1/candidatos/* — CRM endpoints.
 *
 * Auth: requiere empleado Goberna autenticado (cookie session contra appdb).
 * Cada operación de escritura registra evento auditable.
 */
import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../../config/env";
import { isOnboardingEnabled } from "../../../db";
import type { AuthenticatedRequest } from "../../../infra/auth";
import { errorPayload } from "../../../infra/http";
import {
  candidatoCreateSchema,
  candidatoListQuerySchema,
  candidatoUpdateSchema,
  formulaCreateSchema,
  notaCreateSchema,
  postulacionUpsertSchema,
  transicionSchema,
} from "../_schemas";
import * as repo from "./repository";
import { CandidatoNotFoundError, DniConflictError, TransicionInvalidaError } from "./repository";

export function buildOnboardingFase1CandidatosRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.addHook("preHandler", async (_req, reply) => {
      if (!isOnboardingEnabled()) {
        return reply.status(503).send(errorPayload(
          "ONBOARDING_FASE1_NOT_CONFIGURED",
          "ONBOARDING_DATABASE_URL no configurada",
        ));
      }
    });

    // POST /api/onboarding-fase1/candidatos — crear lead
    app.post(
      "/api/onboarding-fase1/candidatos",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = candidatoCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const userId = (req as AuthenticatedRequest).userId;
        try {
          const cand = await repo.createCandidato(parsed.data, userId);
          return reply.status(201).send(cand);
        } catch (e) {
          if (e instanceof DniConflictError) {
            return reply.status(409).send(errorPayload("DNI_CONFLICT", e.message));
          }
          throw e;
        }
      },
    );

    // GET /api/onboarding-fase1/candidatos — listar
    app.get(
      "/api/onboarding-fase1/candidatos",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = candidatoListQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const result = await repo.listCandidatos(parsed.data);
        return reply.send(result);
      },
    );

    // GET /api/onboarding-fase1/candidatos/:slug — detalle
    app.get<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const cand = await repo.getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        return reply.send(cand);
      },
    );

    // PATCH /api/onboarding-fase1/candidatos/:slug — actualizar campos
    app.patch<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = candidatoUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const userId = (req as AuthenticatedRequest).userId;
        const cand = await repo.updateCandidato(req.params.slug, parsed.data, userId);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        return reply.send(cand);
      },
    );

    // POST /api/onboarding-fase1/candidatos/:slug/postulacion — upsert
    app.post<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/postulacion",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = postulacionUpsertSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const userId = (req as AuthenticatedRequest).userId;
        const cand = await repo.getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        const postulacion = await repo.upsertPostulacion(cand.id, parsed.data, userId);
        return reply.send(postulacion);
      },
    );

    // POST /api/onboarding-fase1/candidatos/:slug/formula — agregar/actualizar compañero
    app.post<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/formula",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = formulaCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const userId = (req as AuthenticatedRequest).userId;
        const cand = await repo.getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        const f = await repo.addFormula(cand.id, parsed.data, userId);
        return reply.status(201).send(f);
      },
    );

    // POST /api/onboarding-fase1/candidatos/:slug/notas — agregar nota interna
    app.post<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/notas",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = notaCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const userId = (req as AuthenticatedRequest).userId;
        const cand = await repo.getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        const n = await repo.addNota(cand.id, parsed.data, userId);
        return reply.status(201).send(n);
      },
    );

    // POST /api/onboarding-fase1/candidatos/:slug/transicion — cambiar estado_pipeline
    app.post<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/transicion",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = transicionSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const userId = (req as AuthenticatedRequest).userId;
        try {
          const cand = await repo.transicionar(
            req.params.slug,
            parsed.data.nuevo_estado,
            userId,
            parsed.data.motivo,
          );
          return reply.send(cand);
        } catch (e) {
          if (e instanceof CandidatoNotFoundError) {
            return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", e.message));
          }
          if (e instanceof TransicionInvalidaError) {
            return reply.status(422).send(errorPayload("TRANSICION_INVALIDA", e.message));
          }
          throw e;
        }
      },
    );
  };
}
