import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import winston from "winston";

dotenv.config({ path: ".env.local", override: false });
dotenv.config();

const app = express();

const PORT = Number(process.env.PORT ?? 3001);
const TEGOLA_BASE_URL = (process.env.TEGOLA_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const TEGOLA_MAP = process.env.TEGOLA_MAP ?? "peru";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 5000);
const UPSTREAM_RETRIES = Number(process.env.UPSTREAM_RETRIES ?? 2);
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: "tegola-backend" },
  transports: [new winston.transports.Console()],
});

const LAYERS_CONTRACT = [
  { id: "departamentos", sourceLayer: "departamentos", minZoom: 3, maxZoom: 20 },
  { id: "provincias", sourceLayer: "provincias", minZoom: 5, maxZoom: 20 },
  { id: "distritos", sourceLayer: "distritos", minZoom: 8, maxZoom: 20 },
] as const;

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "OPTIONS"],
  }),
);
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: "1mb" }));
app.use(
  morgan("combined", {
    stream: {
      write: (message) => {
        logger.info(message.trim(), { type: "http_access" });
      },
    },
  }),
);

app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= UPSTREAM_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.status >= 500 && attempt < UPSTREAM_RETRIES) {
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (attempt === UPSTREAM_RETRIES) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Error desconocido consultando upstream");
}

app.get("/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, service: "tegola-backend", map: TEGOLA_MAP, ts: new Date().toISOString() });
});

app.get("/health/upstream", async (_req, res, next) => {
  try {
    const response = await fetchWithRetry(`${TEGOLA_BASE_URL}/capabilities`);
    if (!response.ok) {
      res.status(502).json({ ok: false, upstream: "tegola", status: response.status });
      return;
    }
    res.json({ ok: true, upstream: "tegola" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/config", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    tegolaBaseUrl: TEGOLA_BASE_URL,
    mapName: TEGOLA_MAP,
    tileUrlTemplate: `/api/tiles/{z}/{x}/{y}.vector.pbf`,
    layers: LAYERS_CONTRACT,
  });
});

app.get("/api/capabilities", async (_req, res, next) => {
  try {
    const response = await fetchWithRetry(`${TEGOLA_BASE_URL}/capabilities`);

    if (!response.ok) {
      res.status(response.status).json({ error: "No se pudo obtener capabilities de Tegola" });
      return;
    }

    const payload = await response.json();
    res.setHeader("Cache-Control", "public, max-age=120");
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/tiles/:z/:x/:y.vector.pbf", async (req, res, next) => {
  try {
    const { z, x, y } = req.params;
    const targetUrl = `${TEGOLA_BASE_URL}/maps/${TEGOLA_MAP}/${z}/${x}/${y}.vector.pbf`;

    const response = await fetchWithRetry(targetUrl);

    if (!response.ok) {
      res.status(response.status).json({ error: "No se pudo obtener el tile de Tegola" });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "application/x-protobuf";
    const cacheControl = response.headers.get("cache-control") ?? "public, max-age=86400, stale-while-revalidate=300";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControl);
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Error desconocido";
  const isTimeout = message.includes("aborted") || message.includes("timeout");
  const status = isTimeout ? 504 : 502;
  logger.error("error consultando tegola", { message, status });
  res.status(status).json({ error: "Error consultando Tegola", detail: message });
});

const server = app.listen(PORT, () => {
  logger.info("backend listo", { port: PORT, tegolaBaseUrl: TEGOLA_BASE_URL, map: TEGOLA_MAP });
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const shutdown = (signal: string) => {
  logger.warn("shutdown signal recibido", { signal });
  server.close((error) => {
    if (error) {
      logger.error("error cerrando servidor", { error: error.message });
      process.exit(1);
    }
    logger.info("servidor detenido");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
