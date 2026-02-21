import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import { fetchWithRetry } from "../../infra/upstream";
import { parseTileParam } from "./tiles";
import {
  getDepartamentos,
  getProvincias,
  getDistritos,
  getPeruBounds,
  reverseGeocode,
} from "./geo-cache";

const layersContract = [
  { id: "departamentos", sourceLayer: "departamentos", minZoom: 3, maxZoom: 14 },
  { id: "provincias", sourceLayer: "provincias", minZoom: 5, maxZoom: 14 },
  { id: "distritos", sourceLayer: "distritos", minZoom: 8, maxZoom: 14 },
];

export function buildMapRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/config", async (_request, reply) => {
      reply.header("Cache-Control", "public, max-age=300");
      return {
        tegolaBaseUrl: env.tegolaBaseUrl,
        mapName: env.tegolaMap,
        tileUrlTemplate: "/api/tiles/{z}/{x}/{y}.vector.pbf",
        layers: layersContract,
      };
    });

    app.get("/api/capabilities", async (_request, reply) => {
      const response = await fetchWithRetry(`${env.tegolaBaseUrl}/capabilities`, env);
      if (!response.ok) {
        return reply.code(response.status).send({ error: "No se pudo obtener capabilities de Tegola" });
      }

      const payload = await response.json();
      reply.header("Cache-Control", "public, max-age=120");
      return payload;
    });

    /* ========== Geographic Hierarchy Endpoints (Redis cached) ========== */

    // Get all departamentos with bounds - cached 24h
    app.get("/api/geo/departamentos", async (_request, reply) => {
      const data = await getDepartamentos();
      reply.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
      reply.header("X-Cache-Time", data.cached_at);
      return { ok: true, ...data };
    });

    // Get provincias of a departamento with bounds - cached 24h
    app.get<{ Params: { coddep: string } }>("/api/geo/departamentos/:coddep/provincias", async (request, reply) => {
      const { coddep } = request.params;
      if (!coddep || coddep.length !== 2) {
        return reply.code(400).send({ ok: false, error: "coddep debe ser de 2 caracteres" });
      }
      const data = await getProvincias(coddep);
      if (data.provincias.length === 0) {
        return reply.code(404).send({ ok: false, error: "Departamento no encontrado" });
      }
      reply.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
      reply.header("X-Cache-Time", data.cached_at);
      return { ok: true, ...data };
    });

    // Get distritos of a provincia with bounds - cached 24h
    app.get<{ Params: { codprov_full: string } }>("/api/geo/provincias/:codprov_full/distritos", async (request, reply) => {
      const { codprov_full } = request.params;
      if (!codprov_full || codprov_full.length !== 4) {
        return reply.code(400).send({ ok: false, error: "codprov_full debe ser de 4 caracteres (coddep + codprov)" });
      }
      const data = await getDistritos(codprov_full);
      if (data.distritos.length === 0) {
        return reply.code(404).send({ ok: false, error: "Provincia no encontrada" });
      }
      reply.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
      reply.header("X-Cache-Time", data.cached_at);
      return { ok: true, ...data };
    });

    // Get Peru bounds - cached 24h
    app.get("/api/geo/bounds", async (_request, reply) => {
      const bounds = await getPeruBounds();
      reply.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
      return { ok: true, bounds };
    });

    // Reverse geocode a point to find distrito/provincia/departamento
    app.get<{ Querystring: { lng: string; lat: string } }>("/api/geo/reverse", async (request, reply) => {
      const { lng, lat } = request.query;
      
      const lngNum = parseFloat(lng);
      const latNum = parseFloat(lat);
      
      if (isNaN(lngNum) || isNaN(latNum)) {
        return reply.code(400).send({ ok: false, error: "lng y lat deben ser numeros validos" });
      }
      
      // Validate bounds (Peru approximate bounds)
      if (lngNum < -82 || lngNum > -68 || latNum < -19 || latNum > 1) {
        return reply.code(400).send({ ok: false, error: "Coordenadas fuera de Peru" });
      }
      
      const result = await reverseGeocode(lngNum, latNum);
      
      if (!result) {
        return reply.code(404).send({ ok: false, error: "Punto no encontrado en ningun distrito" });
      }
      
      // Short cache - reverse geocode results don't change often but are point-specific
      reply.header("Cache-Control", "public, max-age=3600");
      return { ok: true, ...result };
    });

    /* ========== Tile Proxy (passthrough to Tegola) ========== */
    // Tegola has its own Redis cache (max_zoom=14). No backend cache needed.

    app.get("/api/tiles/:z/:x/:y.vector.pbf", async (request, reply) => {
      const params = request.params as { z: string; x: string; y: string };

      const zNum = parseTileParam(params.z, 0, 22);
      if (zNum === null) {
        return reply.code(400).send({ ok: false, error: "z invalido" });
      }

      const maxXY = 2 ** zNum - 1;
      const xNum = parseTileParam(params.x, 0, maxXY);
      const yNum = parseTileParam(params.y, 0, maxXY);
      if (xNum === null || yNum === null) {
        return reply.code(400).send({ ok: false, error: "x o y invalido" });
      }

      // Forward conditional headers for 304 support
      const upstreamHeaders: Record<string, string> = {};
      const ifNoneMatch = request.headers["if-none-match"];
      const ifModifiedSince = request.headers["if-modified-since"];
      if (typeof ifNoneMatch === "string") upstreamHeaders["if-none-match"] = ifNoneMatch;
      if (typeof ifModifiedSince === "string") upstreamHeaders["if-modified-since"] = ifModifiedSince;

      const targetUrl = `${env.tegolaBaseUrl}/maps/${env.tegolaMap}/${zNum}/${xNum}/${yNum}.vector.pbf`;
      const response = await fetchWithRetry(targetUrl, env, { headers: upstreamHeaders });

      const etag = response.headers.get("etag");
      const lastModified = response.headers.get("last-modified");
      const contentType = response.headers.get("content-type") ?? "application/x-protobuf";

      // Browser cache: zoom-tiered TTL with stale-while-revalidate
      const browserMaxAge = zNum <= 7 ? 3600 : zNum <= 12 ? 600 : 120;
      reply.header("Cache-Control", `public, max-age=${browserMaxAge}, stale-while-revalidate=600`);
      if (etag) reply.header("ETag", etag);
      if (lastModified) reply.header("Last-Modified", lastModified);
      reply.header("X-Tile-Zoom", zNum.toString());

      if (response.status === 304) {
        return reply.code(304).send();
      }

      if (!response.ok) {
        return reply.code(response.status).send({ error: "No se pudo obtener el tile de Tegola" });
      }

      const body = Buffer.from(await response.arrayBuffer());
      reply.header("Content-Type", contentType);
      return reply.send(body);
    });
  };
}
