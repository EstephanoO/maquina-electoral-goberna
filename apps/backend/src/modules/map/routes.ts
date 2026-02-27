import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { errorPayload } from "../../infra/http";
import { redisClient } from "../../infra/redis";
import { fetchWithRetry } from "../../infra/upstream";
import { filterMvtByCampaign } from "./tile-filter";
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

/**
 * Near-realtime Cache-Control — reduced TTLs for quick propagation
 * of QGIS edits to the dashboard map.
 */
function tileCacheControl(z: number): string {
  if (z <= 7) return "public, max-age=60, stale-while-revalidate=30";
  if (z <= 12) return "public, max-age=30, stale-while-revalidate=30";
  return "public, max-age=10, stale-while-revalidate=10";
}

export function buildMapRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/config", async (_request, reply) => {
      reply.header("Cache-Control", "public, max-age=300");
      return {
        // NOTE: tegolaBaseUrl removed for security — internal infrastructure URL
        // should not be exposed to unauthenticated clients. Tiles are proxied via
        // the tileUrlTemplate path below.
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

      // Tegola layers start at z3 — reject lower zooms to avoid 500 from upstream
      if (zNum < 3) {
        reply.header("Cache-Control", "public, max-age=86400");
        return reply.code(204).send();
      }

      const maxXY = 2 ** zNum - 1;
      const xNum = parseTileParam(params.x, 0, maxXY);
      const yNum = parseTileParam(params.y, 0, maxXY);
      if (xNum === null || yNum === null) {
        return reply.code(400).send({ ok: false, error: "x o y invalido" });
      }

      // Forward conditional + encoding headers for 304 support and gzip passthrough
      const upstreamHeaders: Record<string, string> = {};
      const ifNoneMatch = request.headers["if-none-match"];
      const ifModifiedSince = request.headers["if-modified-since"];
      const acceptEncoding = request.headers["accept-encoding"];
      if (typeof ifNoneMatch === "string") upstreamHeaders["if-none-match"] = ifNoneMatch;
      if (typeof ifModifiedSince === "string") upstreamHeaders["if-modified-since"] = ifModifiedSince;
      if (typeof acceptEncoding === "string") upstreamHeaders["accept-encoding"] = acceptEncoding;

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

      reply.header("Content-Type", contentType);
      const contentEncoding = response.headers.get("content-encoding");
      if (contentEncoding) reply.header("Content-Encoding", contentEncoding);

      // Stream response body directly — avoid double-buffering (ArrayBuffer → Buffer copy)
      if (response.body) {
        return reply.send(response.body);
      }
      // Fallback for runtimes without ReadableStream body
      const body = Buffer.from(await response.arrayBuffer());
      return reply.send(body);
    });

    /* ========== Authenticated Tile Proxy (campaign-filtered MVT) ========== */
    // Resolves GAP 1 (data leak) + GAP 4 (no auth on tiles):
    // - Verifies JWT + campaign membership
    // - Fetches raw tile from Tegola (all campaigns)
    // - Filters MVT features so only the requested campaign's data is returned
    // - Uses near-realtime Cache-Control + ETag with geo version

    app.get<{
      Params: { campaignId: string; z: string; x: string; y: string };
    }>("/api/tiles/:campaignId/:z/:x/:y.vector.pbf", {
      preHandler: [app.authenticate],
      handler: async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const { campaignId, z: zStr, x: xStr, y: yStr } = request.params;
        const requestId = String(request.id);

        // Verify campaign membership (admin bypasses)
        if (req.userRole !== "admin" && !req.campaignIds.includes(campaignId)) {
          return reply.code(403).send(errorPayload(requestId, "FORBIDDEN", "sin acceso a esta campaña"));
        }

        // Validate z/x/y
        const z = parseTileParam(zStr, 0, 22);
        if (z === null) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_PARAM", "z inválido"));
        }
        if (z < 3) {
          reply.header("Cache-Control", "public, max-age=86400");
          return reply.code(204).send();
        }

        const maxXY = 2 ** z - 1;
        const x = parseTileParam(xStr, 0, maxXY);
        const y = parseTileParam(yStr, 0, maxXY);
        if (x === null || y === null) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_PARAM", "x o y inválido"));
        }

        // Fetch raw tile from Tegola (contains ALL campaigns)
        const targetUrl = `${env.tegolaBaseUrl}/maps/${env.tegolaMap}/${z}/${x}/${y}.vector.pbf`;
        const upstreamResponse = await fetchWithRetry(targetUrl, env);

        if (!upstreamResponse.ok) {
          if (upstreamResponse.status === 204) {
            return reply.code(204).send();
          }
          return reply.code(upstreamResponse.status).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "error obteniendo tile de Tegola"),
          );
        }

        // Buffer the full tile (needed for decode/filter/encode — tiles are 10-100KB)
        const rawBuffer = Buffer.from(await upstreamResponse.arrayBuffer());

        // Filter MVT features: only this campaign's data in campaign-scoped layers
        const filtered = filterMvtByCampaign(rawBuffer, campaignId);

        // Geo version for ETag — bumped by geo-listener on QGIS edits
        let version = "0";
        try {
          version = (await redisClient.get(`geo:version:${campaignId}`)) ?? "0";
        } catch {
          // Redis unavailable — use fallback version (tiles still work, just no cache invalidation)
        }

        reply
          .header("Content-Type", "application/x-protobuf")
          .header("Cache-Control", tileCacheControl(z))
          .header("ETag", `"t-${z}-${x}-${y}-${version}"`)
          .header("X-Tile-Zoom", z.toString())
          .send(filtered);
      },
    });

    /* ========== SSE: Geo Change Notifications ========== */
    // When the geographer edits in QGIS, pg_notify → geo-listener → Redis pub/sub.
    // This SSE endpoint delivers those events to connected dashboard clients
    // so they can bust their tile cache in near-realtime.

    app.get("/api/geo/stream", {
      preHandler: [app.authenticate],
      handler: async (request, reply) => {
        const req = request as AuthenticatedRequest;

        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no", // Nginx: disable proxy buffering for SSE
        });

        // Duplicate the Redis client for this subscription
        const subscriber = redisClient.duplicate();
        await subscriber.connect();

        await subscriber.subscribe("geo:updated", (message) => {
          try {
            const data = JSON.parse(message) as { campaignId?: string };
            // Only send if user belongs to the campaign (or is admin)
            if (
              req.userRole === "admin" ||
              (data.campaignId && req.campaignIds.includes(data.campaignId))
            ) {
              reply.raw.write(`event: geo_updated\ndata: ${message}\n\n`);
            }
          } catch {
            // Malformed message — skip
          }
        });

        // Heartbeat every 30s to keep connection alive through proxies
        const heartbeat = setInterval(() => {
          reply.raw.write(": heartbeat\n\n");
        }, 30_000);

        // Cleanup on client disconnect
        request.raw.on("close", () => {
          clearInterval(heartbeat);
          void subscriber.unsubscribe("geo:updated").catch(() => {});
          void subscriber.disconnect().catch(() => {});
        });
      },
    });
  };
}
