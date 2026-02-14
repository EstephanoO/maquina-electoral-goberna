import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import { fetchWithRetry } from "../../infra/upstream";
import { parseTileParam } from "./tiles";

const layersContract = [
  { id: "departamentos", sourceLayer: "departamentos", minZoom: 3, maxZoom: 20 },
  { id: "provincias", sourceLayer: "provincias", minZoom: 5, maxZoom: 20 },
  { id: "distritos", sourceLayer: "distritos", minZoom: 8, maxZoom: 20 },
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

      const upstreamHeaders: Record<string, string> = {};
      const ifNoneMatch = request.headers["if-none-match"];
      const ifModifiedSince = request.headers["if-modified-since"];
      if (typeof ifNoneMatch === "string") upstreamHeaders["if-none-match"] = ifNoneMatch;
      if (typeof ifModifiedSince === "string") upstreamHeaders["if-modified-since"] = ifModifiedSince;

      const targetUrl = `${env.tegolaBaseUrl}/maps/${env.tegolaMap}/${zNum}/${xNum}/${yNum}.vector.pbf`;
      const response = await fetchWithRetry(targetUrl, env, { headers: upstreamHeaders });

      const cacheControl = response.headers.get("cache-control") ?? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=600";
      const etag = response.headers.get("etag");
      const lastModified = response.headers.get("last-modified");
      const contentType = response.headers.get("content-type") ?? "application/x-protobuf";

      reply.header("Cache-Control", cacheControl);
      if (etag) reply.header("ETag", etag);
      if (lastModified) reply.header("Last-Modified", lastModified);

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
