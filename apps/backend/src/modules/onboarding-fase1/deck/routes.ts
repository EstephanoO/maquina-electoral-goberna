/**
 * /api/onboarding-fase1/candidatos/:slug/consultor-form
 *   GET   — lee form actual
 *   PATCH — upsert con merge top-level (auto-save del wizard)
 *
 * /api/onboarding-fase1/candidatos/:slug/deck
 *   GET   — última versión publicada
 *   POST  — publicar nueva versión (snapshot)
 *
 * /api/onboarding-fase1/candidatos/:slug/deck/versiones
 *   GET   — listado histórico de versiones
 */
import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../../config/env";
import { isOnboardingEnabled } from "../../../db";
import type { AuthenticatedRequest } from "../../../infra/auth";
import { errorPayload } from "../../../infra/http";
import { consultorFormUpdateSchema, deckPublishSchema } from "../_schemas";
import { getCandidatoBySlug } from "../candidatos/repository";
import * as repo from "./repository";

export function buildOnboardingFase1DeckRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.addHook("preHandler", async (_req, reply) => {
      if (!isOnboardingEnabled()) {
        return reply.status(503).send(errorPayload(
          "ONBOARDING_FASE1_NOT_CONFIGURED",
          "ONBOARDING_DATABASE_URL no configurada",
        ));
      }
    });

    // GET consultor_form
    app.get<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/consultor-form",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const cand = await getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        const form = await repo.getConsultorForm(cand.id);
        if (!form) {
          // Fila no creada todavía → devolver un default vacío para que el frontend pueda renderizar
          return reply.send({
            id_candidato: cand.id,
            payload: {},
            ultima_seccion: null,
            completado: false,
            actualizado_en: null,
            actualizado_por: null,
          });
        }
        return reply.send(form);
      },
    );

    // PATCH consultor_form (auto-save)
    app.patch<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/consultor-form",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = consultorFormUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const cand = await getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        const userId = (req as AuthenticatedRequest).userId;
        const form = await repo.upsertConsultorForm(cand.id, parsed.data, userId);
        return reply.send(form);
      },
    );

    // GET deck última versión
    app.get<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/deck",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const cand = await getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        const deck = await repo.getDeckUltimaVersion(cand.id);
        if (!deck) {
          return reply.status(404).send(errorPayload("DECK_NOT_PUBLISHED", "Deck aún no publicado"));
        }
        return reply.send(deck);
      },
    );

    // POST deck publicar
    app.post<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/deck",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const parsed = deckPublishSchema.safeParse(req.body);
        if (!parsed.success) {
          return reply.status(400).send(errorPayload("VALIDATION_ERROR", parsed.error.message));
        }
        const cand = await getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        const userId = (req as AuthenticatedRequest).userId;
        const snap = await repo.publishDeck(cand.id, parsed.data, userId);
        return reply.status(201).send(snap);
      },
    );

    // GET versiones
    app.get<{ Params: { slug: string } }>(
      "/api/onboarding-fase1/candidatos/:slug/deck/versiones",
      { preHandler: [app.authenticate] },
      async (req, reply) => {
        const cand = await getCandidatoBySlug(req.params.slug);
        if (!cand) {
          return reply.status(404).send(errorPayload("CANDIDATO_NOT_FOUND", `Slug ${req.params.slug}`));
        }
        const items = await repo.listDeckVersiones(cand.id);
        return reply.send({ items });
      },
    );
  };
}
