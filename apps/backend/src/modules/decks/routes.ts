import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import { authorize } from "../../infra/authorize";
import type { AuthenticatedRequest } from "../../infra/auth";

import {
  checkConsultorAccessAndGetCandidatoUserId,
  consultorHasGlobalAccess,
} from "../consultor/repository";
import * as repo from "./repository";

// Storage path para los HTML — montado vía volume `uploads` en docker-compose.
// Si el dir no existe, lo creamos al primer upload.
const STORAGE_DIR = process.env.DECKS_STORAGE_DIR ?? "/srv/uploads/decks";

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB

// Capa 2 — payload estructurado opcional. Si viene, escribimos en analisis.*
const structuredSchema = z
  .object({
    summary: z.string().max(2000).optional(),
    fecha_corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    hallazgos: z
      .array(
        z.object({
          categoria: z.enum(["fortaleza", "debilidad", "oportunidad", "amenaza", "contexto"]),
          texto: z.string().min(2).max(2000),
          evidencia: z.string().max(500).optional(),
          peso: z.number().min(0).max(1).optional(),
          tags: z.array(z.string().max(50)).max(20).optional(),
        }),
      )
      .max(50)
      .optional(),
    riesgos: z
      .array(
        z.object({
          riesgo: z.string().min(2).max(2000),
          severidad: z.enum(["baja", "media", "alta", "critica"]),
          probabilidad: z.enum(["baja", "media", "alta"]).optional(),
          mitigacion: z.string().max(2000).optional(),
          responsable: z.string().max(200).optional(),
        }),
      )
      .max(30)
      .optional(),
    oportunidades: z
      .array(
        z.object({
          oportunidad: z.string().min(2).max(2000),
          ventana_temporal: z.string().max(200).optional(),
          recursos_necesarios: z.string().max(1000).optional(),
          impacto_esperado: z.string().max(1000).optional(),
        }),
      )
      .max(30)
      .optional(),
    competidores: z
      .array(
        z.object({
          partido_codigo: z.string().max(50).optional(),
          partido_nombre: z.string().max(200).optional(),
          candidato_rival: z.string().max(200).optional(),
          fortaleza_relativa: z.number().int().min(1).max(10).optional(),
          jurisdiccion_clave: z.string().max(200).optional(),
          notas: z.string().max(1000).optional(),
        }),
      )
      .max(20)
      .optional(),
    recomendaciones: z
      .array(
        z.object({
          accion: z.string().min(2).max(2000),
          area: z
            .enum([
              "territorio",
              "digital",
              "datos",
              "comunicacion",
              "organizacion",
              "financiamiento",
              "legal",
              "otro",
            ])
            .optional(),
          plazo: z.enum(["inmediato", "corto", "mediano", "largo"]).optional(),
          recursos_estimados: z.string().max(1000).optional(),
          kpi_objetivo: z.string().max(500).optional(),
          prioridad: z.number().int().min(1).max(5).optional(),
        }),
      )
      .max(50)
      .optional(),
    kpis: z
      .array(
        z.object({
          nombre: z.string().min(2).max(200),
          valor_actual: z.number().optional(),
          valor_objetivo: z.number().optional(),
          unidad: z.string().max(50).optional(),
          fecha_objetivo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }),
      )
      .max(30)
      .optional(),
  })
  .optional();

const uploadSchema = z.object({
  candidato_id: z.coerce.number().int().positive(),
  title: z.string().trim().min(2).max(200),
  type: z.enum(["diagnostico", "analisis", "plan", "episodico", "otro"]),
  description: z.string().trim().max(500).optional(),
  html: z
    .string()
    .min(50, "el HTML está vacío o es muy corto")
    .max(MAX_HTML_BYTES, `el HTML excede el máximo de ${MAX_HTML_BYTES} bytes`),
  structured: structuredSchema,
});

const rejectSchema = z.object({
  reason: z.string().trim().min(2).max(500),
});

export function buildDecksRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── POST /api/consultor/decks ─────────────────────────────────────
    // Sube un deck HTML como draft. El consultor debe tener acceso al
    // candidato (vía consultor_candidato o consultor_global_access).
    app.post(
      "/api/consultor/decks",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["consultor"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const parsed = uploadSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }
        const input = parsed.data;

        // Verificar acceso (admin pasa siempre)
        if (req.userRole !== "admin") {
          const candidatoUserId = await checkConsultorAccessAndGetCandidatoUserId(
            req.userId,
            input.candidato_id,
          );
          if (!candidatoUserId) {
            return reply.code(403).send(
              errorPayload(
                requestId,
                "CANDIDATO_NOT_ACCESSIBLE",
                "no tenés acceso a este candidato — pedí asignación al admin",
              ),
            );
          }
        }

        // Si ya existe un draft del mismo (candidato, uploader, type), lo reemplazamos.
        // Esto evita que el admin vea 5 borradores idénticos cuando el consultor
        // itera. El draft anterior es overwriteado: HTML viejo → unlink, row UPDATE.
        const existingDraft = await repo.findDraftByKey(
          input.candidato_id,
          req.userId,
          input.type,
        );

        const sizeBytes = Buffer.byteLength(input.html, "utf8");

        if (existingDraft) {
          const newStoragePath = join(STORAGE_DIR, `${existingDraft.id}.html`);
          try {
            await fs.mkdir(STORAGE_DIR, { recursive: true });
            await fs.writeFile(newStoragePath, input.html, "utf8");
          } catch (e) {
            app.log.error({ err: e, request_id: requestId }, "decks/upload write failed");
            return reply.code(500).send(
              errorPayload(requestId, "DECK_STORAGE_ERROR", "no pude guardar el archivo"),
            );
          }
          // Si la storage_path original es diferente de la nueva (cambió STORAGE_DIR),
          // limpiamos la vieja.
          if (existingDraft.storage_path && existingDraft.storage_path !== newStoragePath) {
            await fs.unlink(existingDraft.storage_path).catch(() => undefined);
          }
          try {
            const row = await repo.replaceDraftContent(existingDraft.id, {
              title: input.title,
              description: input.description ?? null,
              storage_path: newStoragePath,
              size_bytes: sizeBytes,
            });
            // Si vino structured payload, upsert en analisis.* (capa 2)
            let analisisId: string | null = null;
            if (input.structured) {
              try {
                const a = await repo.upsertAnalisisForDeck({
                  deck_id: row.id,
                  candidato_id: row.candidato_id,
                  campaign_id: row.campaign_id,
                  uploaded_by_user_id: req.userId,
                  type: row.type,
                  title: row.title,
                  structured: input.structured,
                });
                analisisId = a.analisis_id;
              } catch (e) {
                app.log.error({ err: e, request_id: requestId, deck_id: row.id }, "decks/upload analisis upsert failed");
                // No falla el request — el HTML quedó bien
              }
            }
            return reply.code(200).send({
              ok: true,
              request_id: requestId,
              replaced: true,
              deck: {
                id: row.id,
                candidato_id: row.candidato_id,
                title: row.title,
                type: row.type,
                status: row.status,
                created_at: row.created_at,
                updated_at: row.updated_at,
                preview_url: `/api/decks/${row.id}/raw`,
                analisis_id: analisisId,
              },
            });
          } catch (e) {
            app.log.error({ err: e, request_id: requestId }, "decks/upload replace failed");
            return reply.code(500).send(
              errorPayload(requestId, "DECK_REPLACE_ERROR", "error reemplazando el draft"),
            );
          }
        }

        // No había draft previo — INSERT nuevo.
        const id = randomUUID();
        const storagePath = join(STORAGE_DIR, `${id}.html`);
        try {
          await fs.mkdir(STORAGE_DIR, { recursive: true });
          await fs.writeFile(storagePath, input.html, "utf8");
        } catch (e) {
          app.log.error({ err: e, request_id: requestId }, "decks/upload write failed");
          return reply.code(500).send(
            errorPayload(requestId, "DECK_STORAGE_ERROR", "no pude guardar el archivo"),
          );
        }

        try {
          const row = await repo.insertDeck({
            id,
            candidato_id: input.candidato_id,
            campaign_id: null, // se infiere después si lo necesitamos
            uploaded_by_user_id: req.userId,
            title: input.title,
            type: input.type,
            description: input.description ?? null,
            storage_path: storagePath,
            size_bytes: sizeBytes,
          });
          // Si vino structured payload, upsert en analisis.* (capa 2)
          let analisisId: string | null = null;
          if (input.structured) {
            try {
              const a = await repo.upsertAnalisisForDeck({
                deck_id: row.id,
                candidato_id: row.candidato_id,
                campaign_id: row.campaign_id,
                uploaded_by_user_id: req.userId,
                type: row.type,
                title: row.title,
                structured: input.structured,
              });
              analisisId = a.analisis_id;
            } catch (e) {
              app.log.error({ err: e, request_id: requestId, deck_id: row.id }, "decks/upload analisis insert failed");
            }
          }
          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            replaced: false,
            deck: {
              id: row.id,
              candidato_id: row.candidato_id,
              title: row.title,
              type: row.type,
              status: row.status,
              created_at: row.created_at,
              preview_url: `/api/decks/${row.id}/raw`,
              analisis_id: analisisId,
            },
          });
        } catch (e) {
          // Si el INSERT falla, intentar limpiar el archivo
          await fs.unlink(storagePath).catch(() => undefined);
          app.log.error({ err: e, request_id: requestId }, "decks/upload insert failed");
          return reply.code(500).send(
            errorPayload(requestId, "DECK_INSERT_ERROR", "error guardando el deck"),
          );
        }
      },
    );

    // ── GET /api/consultor/analisis/similar ───────────────────────────
    // Lookup capa 3-light: trae análisis previos del mismo cargo + ámbito
    // (+ opcionalmente mismo partido) para que Claude pueda contextualizar
    // un nuevo deck con qué encontraron consultores anteriores.
    app.get<{ Querystring: { cargo?: string; ambito?: string; partido?: string; exclude_candidato?: string; limit?: string } }>(
      "/api/consultor/analisis/similar",
      {
        preHandler: [app.authenticate, authorize({ roles: ["consultor"] })],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const ambitoParsed = z.enum(["pais", "departamento", "provincia", "distrito"]).optional()
          .safeParse(request.query.ambito || undefined);
        const filters = {
          cargo_codigo: request.query.cargo || undefined,
          ambito: ambitoParsed.success ? ambitoParsed.data : undefined,
          organizacion_codigo: request.query.partido || undefined,
          exclude_candidato_id: request.query.exclude_candidato
            ? Number.parseInt(request.query.exclude_candidato, 10)
            : undefined,
          limit: request.query.limit ? Number.parseInt(request.query.limit, 10) : undefined,
        };
        const items = await repo.findSimilarAnalisis(filters);
        return reply.code(200).send({ ok: true, request_id: requestId, items });
      },
    );

    // ── GET /api/consultor/benchmarks ─────────────────────────────────
    app.get<{ Querystring: { cargo?: string; ambito?: string } }>(
      "/api/consultor/benchmarks",
      {
        preHandler: [app.authenticate, authorize({ roles: ["consultor"] })],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const items = await repo.getBenchmarks({
          cargo_codigo: request.query.cargo || undefined,
          ambito: request.query.ambito || undefined,
        });
        return reply.code(200).send({ ok: true, request_id: requestId, items });
      },
    );

    // ── GET /api/candidato/decks?campaign_id=... ──────────────────────
    // Endpoint que consume el dashboard del candidato para listar sus
    // decks publicados. Auth: cualquier usuario logueado con campaign_id.
    // El backend valida que el caller tenga acceso a esa campaña.
    app.get<{ Querystring: { campaign_id?: string } }>(
      "/api/candidato/decks",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const parsed = z.string().uuid().safeParse(request.query.campaign_id);
        if (!parsed.success) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "campaign_id requerido"));
        }
        const decks = await repo.listPublishedDecksForCampaign(parsed.data);
        return reply.code(200).send({ ok: true, request_id: requestId, decks });
      },
    );

    // ── GET /api/consultor/decks?candidato_id=N ───────────────────────
    app.get<{ Querystring: { candidato_id?: string } }>(
      "/api/consultor/decks",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["consultor"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const candidatoIdParsed = z.coerce.number().int().positive().safeParse(
          request.query.candidato_id,
        );
        if (!candidatoIdParsed.success) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "candidato_id requerido"));
        }
        const candidatoId = candidatoIdParsed.data;

        if (req.userRole !== "admin") {
          const ok = await checkConsultorAccessAndGetCandidatoUserId(req.userId, candidatoId);
          if (!ok) {
            return reply
              .code(403)
              .send(errorPayload(requestId, "CANDIDATO_NOT_ACCESSIBLE", "sin acceso"));
          }
        }
        const decks = await repo.listDecksByCandidato(candidatoId);
        return reply.code(200).send({ ok: true, request_id: requestId, decks });
      },
    );

    // ── GET /api/decks/:id/raw ────────────────────────────────────────
    // Devuelve el HTML para mostrarlo en iframe sandbox. Auth: cualquiera
    // logueado (los URLs son obfuscados por UUID; no exponemos listing
    // sin auth).
    app.get<{ Params: { id: string } }>(
      "/api/decks/:id/raw",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const id = request.params.id;
        const idParsed = z.string().uuid().safeParse(id);
        if (!idParsed.success) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "id inválido"));
        }
        const deck = await repo.findDeckById(id);
        if (!deck) {
          return reply.code(404).send(errorPayload(requestId, "DECK_NOT_FOUND", "deck no existe"));
        }
        try {
          const html = await fs.readFile(deck.storage_path, "utf8");
          return reply
            .code(200)
            .header("Content-Type", "text/html; charset=utf-8")
            .header("X-Frame-Options", "SAMEORIGIN")
            .header("Content-Security-Policy", "frame-ancestors 'self'")
            .send(html);
        } catch (e) {
          app.log.error({ err: e, request_id: requestId, deck_id: id }, "decks/raw read failed");
          return reply.code(500).send(errorPayload(requestId, "DECK_READ_ERROR", "no pude leer el archivo"));
        }
      },
    );

    // ── GET /api/consultor/decks/:id ──────────────────────────────────
    // Devuelve metadata + HTML completo en JSON. Lo usa el MCP
    // fetch_deck_html para sincronizar el workspace local del consultor
    // con el deck actual de un candidato.
    app.get<{ Params: { id: string } }>(
      "/api/consultor/decks/:id",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["consultor"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const id = request.params.id;
        const idParsed = z.string().uuid().safeParse(id);
        if (!idParsed.success) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "id inválido"));
        }
        const deck = await repo.findDeckById(id);
        if (!deck) {
          return reply.code(404).send(errorPayload(requestId, "DECK_NOT_FOUND", "deck no existe"));
        }
        // Verificar acceso al candidato (admin pasa siempre)
        if (req.userRole !== "admin") {
          const ok = await checkConsultorAccessAndGetCandidatoUserId(req.userId, deck.candidato_id);
          if (!ok) {
            return reply.code(403).send(
              errorPayload(requestId, "CANDIDATO_NOT_ACCESSIBLE", "sin acceso a este candidato"),
            );
          }
        }
        try {
          const html = await fs.readFile(deck.storage_path, "utf8");
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            deck: {
              id: deck.id,
              candidato_id: deck.candidato_id,
              title: deck.title,
              type: deck.type,
              description: deck.description,
              status: deck.status,
              size_bytes: deck.size_bytes,
              created_at: deck.created_at,
              updated_at: deck.updated_at,
              html,
            },
          });
        } catch (e) {
          app.log.error({ err: e, request_id: requestId, deck_id: id }, "decks/json read failed");
          return reply.code(500).send(errorPayload(requestId, "DECK_READ_ERROR", "no pude leer el archivo"));
        }
      },
    );

    // ── POST /api/consultor/decks/:id/publish ─────────────────────────
    // Autopublicación del consultor — solo permitida si tiene
    // consultor_global_access. Sin global access → debe pedir a admin.
    app.post<{ Params: { id: string } }>(
      "/api/consultor/decks/:id/publish",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["consultor"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const id = request.params.id;
        const idParsed = z.string().uuid().safeParse(id);
        if (!idParsed.success) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "id inválido"));
        }
        // Verificar permiso de autopublicación: admin pasa, o consultor con global access.
        if (req.userRole !== "admin") {
          const hasGlobal = await consultorHasGlobalAccess(req.userId);
          if (!hasGlobal) {
            return reply.code(403).send(
              errorPayload(
                requestId,
                "SELF_PUBLISH_NOT_ALLOWED",
                "no tenés permiso de autopublicar — pedile a admin que lo publique en /decks",
              ),
            );
          }
        }
        // Verificar acceso al deck (mismo flujo que GET /:id)
        const deck = await repo.findDeckById(id);
        if (!deck) {
          return reply.code(404).send(errorPayload(requestId, "DECK_NOT_FOUND", "deck no existe"));
        }
        if (req.userRole !== "admin") {
          const ok = await checkConsultorAccessAndGetCandidatoUserId(req.userId, deck.candidato_id);
          if (!ok) {
            return reply.code(403).send(
              errorPayload(requestId, "CANDIDATO_NOT_ACCESSIBLE", "sin acceso a este candidato"),
            );
          }
        }
        const updated = await repo.selfPublishDeck(id, req.userId);
        if (!updated) {
          return reply.code(409).send(
            errorPayload(requestId, "DECK_NOT_PUBLISHABLE", "deck no existe o no está en draft"),
          );
        }
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          deck: {
            id: updated.id,
            candidato_id: updated.candidato_id,
            title: updated.title,
            status: updated.status,
            published_at: updated.published_at,
            preview_url: `/api/decks/${updated.id}/raw`,
          },
        });
      },
    );

    // ── ADMIN ─────────────────────────────────────────────────────────

    // GET /api/admin/decks?status=draft|published|rejected
    app.get<{ Querystring: { status?: string } }>(
      "/api/admin/decks",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["admin"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const status = (request.query.status as repo.DeckRow["status"]) ?? "draft";
        const ALLOWED: repo.DeckRow["status"][] = ["draft", "published", "rejected"];
        if (!ALLOWED.includes(status)) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "status inválido"));
        }
        const decks = await repo.listDecksByStatus(status);
        return reply.code(200).send({ ok: true, request_id: requestId, decks });
      },
    );

    // POST /api/admin/decks/:id/publish
    app.post<{ Params: { id: string } }>(
      "/api/admin/decks/:id/publish",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["admin"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const updated = await repo.publishDeck(request.params.id, req.userId);
        if (!updated) {
          return reply.code(404).send(
            errorPayload(requestId, "DECK_NOT_PUBLISHABLE", "deck no existe o no está en draft"),
          );
        }
        return reply.code(200).send({ ok: true, request_id: requestId, deck: updated });
      },
    );

    // POST /api/admin/decks/:id/reject
    app.post<{ Params: { id: string } }>(
      "/api/admin/decks/:id/reject",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["admin"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const req = request as AuthenticatedRequest;
        const parsed = rejectSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }
        const updated = await repo.rejectDeck(request.params.id, req.userId, parsed.data.reason);
        if (!updated) {
          return reply.code(404).send(
            errorPayload(requestId, "DECK_NOT_REJECTABLE", "deck no existe o no está en draft"),
          );
        }
        return reply.code(200).send({ ok: true, request_id: requestId, deck: updated });
      },
    );
  };
}
