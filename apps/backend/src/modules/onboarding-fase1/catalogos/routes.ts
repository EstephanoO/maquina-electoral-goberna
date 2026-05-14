/**
 * /api/onboarding-fase1/catalogos/* — dropdowns para el wizard fase-1.
 *
 * Todo read-only. Sin auth (datos públicos / no sensibles, son catálogos).
 * Si querés gatearlos detrás de auth, mover bajo /api/admin/onboarding-fase1/.
 *
 * Cache HTTP: `public, max-age=300` (5 min) — los catálogos son estables.
 * Si el geógrafo agrega un partido nuevo, tarda hasta 5 min en aparecer
 * en frontends que respeten cache. Aceptable.
 */
import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../../config/env";
import { isOnboardingEnabled } from "../../../db";
import { errorPayload } from "../../../infra/http";
import * as repo from "./repository";

const CACHE_HEADER = "public, max-age=300";

export function buildOnboardingFase1CatalogosRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.addHook("preHandler", async (_req, reply) => {
      if (!isOnboardingEnabled()) {
        return reply.status(503).send(errorPayload(
          "ONBOARDING_FASE1_NOT_CONFIGURED",
          "ONBOARDING_DATABASE_URL no configurada",
        ));
      }
    });

    app.get("/api/onboarding-fase1/catalogos/cargos", async (_req, reply) => {
      const items = await repo.listCargos();
      reply.header("cache-control", CACHE_HEADER);
      return reply.send({ items });
    });

    app.get("/api/onboarding-fase1/catalogos/partidos", async (_req, reply) => {
      const items = await repo.listOrganizacionesPoliticas();
      reply.header("cache-control", CACHE_HEADER);
      return reply.send({ items });
    });

    app.get("/api/onboarding-fase1/catalogos/procesos", async (_req, reply) => {
      const items = await repo.listProcesosElectorales();
      reply.header("cache-control", CACHE_HEADER);
      return reply.send({ items });
    });

    app.get("/api/onboarding-fase1/catalogos/departamentos", async (_req, reply) => {
      const items = await repo.listDepartamentos();
      reply.header("cache-control", CACHE_HEADER);
      return reply.send({ items });
    });

    app.get<{ Querystring: { id_departamento?: string } }>(
      "/api/onboarding-fase1/catalogos/provincias",
      async (req, reply) => {
        const idDep = req.query.id_departamento ? Number(req.query.id_departamento) : undefined;
        if (req.query.id_departamento && (!Number.isInteger(idDep) || idDep! <= 0)) {
          return reply.status(400).send(errorPayload("INVALID_ID", "id_departamento inválido"));
        }
        const items = await repo.listProvincias(idDep);
        reply.header("cache-control", CACHE_HEADER);
        return reply.send({ items });
      },
    );

    app.get<{ Querystring: { id_provincia?: string } }>(
      "/api/onboarding-fase1/catalogos/distritos",
      async (req, reply) => {
        const idProv = req.query.id_provincia ? Number(req.query.id_provincia) : undefined;
        if (req.query.id_provincia && (!Number.isInteger(idProv) || idProv! <= 0)) {
          return reply.status(400).send(errorPayload("INVALID_ID", "id_provincia inválido"));
        }
        const items = await repo.listDistritos(idProv);
        reply.header("cache-control", CACHE_HEADER);
        return reply.send({ items });
      },
    );
  };
}
