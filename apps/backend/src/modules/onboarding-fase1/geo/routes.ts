/**
 * Routes para geo enrichment desde `onboarding_fase1`.
 *
 * GET /api/geo/distrito/:id?simplify=0|0.002|0.005
 *   → { distrito, geojson, centroid, bbox, area_km2, poblacion_total_2025,
 *       padron: {...}|null, presupuesto: {...}|null, ranking_pim: {...}|null,
 *       provincia, departamento }
 *
 * GET /api/geo/provincia/:id/distritos?simplify=0.002
 *   → FeatureCollection con los distritos de la provincia (para coropleta).
 *
 * Si ONBOARDING_DATABASE_URL no está configurada → 503.
 */
import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../../config/env";
import { isOnboardingEnabled } from "../../../db";
import { errorPayload } from "../../../infra/http";
import {
  getDistrito,
  getDistritosByProvincia,
  getPresupuesto,
  getRankingPimDistrito,
  getUltimoPadron,
} from "./repository";

const VALID_TOLERANCES = new Set([0, 0.001, 0.002, 0.005, 0.01]);

function parseSimplify(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return VALID_TOLERANCES.has(n) ? n : 0.002;
}

export function buildOnboardingGeoRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.addHook("preHandler", async (_req, reply) => {
      if (!isOnboardingEnabled()) {
        return reply.status(503).send(errorPayload("ONBOARDING_FASE1_NOT_CONFIGURED", "ONBOARDING_DATABASE_URL no configurada"));
      }
    });

    // GET /api/geo/distrito/:id
    app.get<{
      Params: { id: string };
      Querystring: { simplify?: string; anio?: string };
    }>("/api/geo/distrito/:id", async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.status(400).send(errorPayload("INVALID_ID", "id inválido"));
      }
      const tolerance = parseSimplify(req.query.simplify);
      const anio = req.query.anio ? Number(req.query.anio) : new Date().getFullYear();

      const dist = await getDistrito(id, tolerance);
      if (!dist) {
        return reply.status(404).send(errorPayload("DISTRITO_NOT_FOUND", `Distrito ${id} no existe`));
      }

      // En paralelo: padrón + presupuesto + ranking
      const [padron, presupuesto, ranking] = await Promise.all([
        getUltimoPadron(id),
        getPresupuesto(id, anio),
        getRankingPimDistrito(id, anio),
      ]);

      return reply.send({
        ...dist,
        anio_referencia: anio,
        padron,
        presupuesto,
        ranking_pim: ranking,
      });
    });

    // GET /api/geo/provincia/:id/distritos
    app.get<{
      Params: { id: string };
      Querystring: { simplify?: string };
    }>("/api/geo/provincia/:id/distritos", async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.status(400).send(errorPayload("INVALID_ID", "id inválido"));
      }
      const tolerance = parseSimplify(req.query.simplify) || 0.002;
      const distritos = await getDistritosByProvincia(id, tolerance);

      const featureCollection: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: distritos.map((d) => ({
          type: "Feature",
          id: d.id,
          properties: {
            id: d.id,
            distrito: d.distrito,
            poblacion_total_2025: d.poblacion_total_2025,
            area_km2: d.area_km2,
            densidad_hab_km2: d.area_km2 > 0
              ? Math.round(d.poblacion_total_2025 / d.area_km2)
              : null,
          },
          geometry: d.geojson,
        })),
      };

      return reply.send(featureCollection);
    });
  };
}
