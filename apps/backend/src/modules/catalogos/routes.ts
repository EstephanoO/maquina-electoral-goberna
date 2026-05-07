import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import {
  cargosQuerySchema,
  jurisdiccionesQuerySchema,
  organizacionesPoliticasQuerySchema,
} from "./schemas";

export function buildCatalogosRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── GET /api/catalogos/cargos?pais=PE&nivel=local ─────────────────
    // Público — alimenta los selectores del wizard de onboarding.
    // Devuelve cargo_gobierno con su nivel_gobierno joined.
    app.get("/api/catalogos/cargos", async (request, reply) => {
      const requestId = String(request.id);
      const parsed = cargosQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      try {
        const cargos = await repo.listCargos(parsed.data.pais, parsed.data.nivel);
        return reply.code(200).send({ ok: true, request_id: requestId, cargos });
      } catch (error) {
        app.log.error({ err: error, request_id: requestId }, "catalogos cargos failed");
        return reply.code(500).send(
          errorPayload(requestId, "CATALOGOS_LIST_ERROR", "error listando cargos"),
        );
      }
    });

    // ── GET /api/catalogos/organizaciones-politicas?pais=PE ────────────
    app.get("/api/catalogos/organizaciones-politicas", async (request, reply) => {
      const requestId = String(request.id);
      const parsed = organizacionesPoliticasQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      try {
        const organizaciones = await repo.listOrganizacionesPoliticas(parsed.data.pais);
        return reply.code(200).send({ ok: true, request_id: requestId, organizaciones });
      } catch (error) {
        app.log.error({ err: error, request_id: requestId }, "catalogos OPs failed");
        return reply.code(500).send(
          errorPayload(requestId, "CATALOGOS_LIST_ERROR", "error listando organizaciones políticas"),
        );
      }
    });

    // ── GET /api/catalogos/jurisdicciones?ambito=distrito&parent_id=123 ─
    // STUB: hasta que las tablas geografia_politica.* lleguen al repo
    // (migración del geógrafo, otro PR), este endpoint devuelve []. El
    // wizard debe permitir continuar igual con los IDs en null y el endpoint
    // de provisioning los persiste tal cual; cuando geografia_politica esté,
    // se reemplaza esta lógica por queries reales.
    app.get("/api/catalogos/jurisdicciones", async (request, reply) => {
      const requestId = String(request.id);
      const parsed = jurisdiccionesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join(", ");
        return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
      }

      try {
        const jurisdicciones = await repo.listJurisdicciones(
          parsed.data.ambito,
          parsed.data.parent_id ?? null,
        );
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          ambito: parsed.data.ambito,
          jurisdicciones,
          stub: true,
        });
      } catch (error) {
        app.log.error({ err: error, request_id: requestId }, "catalogos jurisdicciones failed");
        return reply.code(500).send(
          errorPayload(requestId, "CATALOGOS_LIST_ERROR", "error listando jurisdicciones"),
        );
      }
    });
  };
}
