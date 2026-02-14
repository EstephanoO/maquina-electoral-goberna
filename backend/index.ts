import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { Pool } from "pg";
import winston from "winston";

dotenv.config({ path: ".env.local", override: false });
dotenv.config();

const app = express();

const PORT = Number(process.env.PORT ?? 3001);
const TEGOLA_BASE_URL = (process.env.TEGOLA_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const TEGOLA_MAP = process.env.TEGOLA_MAP ?? "peru";
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 5000);
const UPSTREAM_RETRIES = Number(process.env.UPSTREAM_RETRIES ?? 2);
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const DATABASE_URL = process.env.DATABASE_URL;

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: "tegola-backend" },
  transports: [new winston.transports.Console()],
});

const dbPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: false,
    })
  : null;

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
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (FRONTEND_ORIGINS.includes("*") || FRONTEND_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
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

async function checkDatabase(): Promise<boolean> {
  if (!dbPool) return false;
  const result = await dbPool.query("SELECT 1 AS ok");
  return result.rowCount === 1;
}

async function checkTegola(): Promise<boolean> {
  const response = await fetchWithRetry(`${TEGOLA_BASE_URL}/capabilities`);
  return response.ok;
}

app.get("/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, service: "tegola-backend", map: TEGOLA_MAP, ts: new Date().toISOString() });
});

app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, service: "tegola-backend", map: TEGOLA_MAP, ts: new Date().toISOString() });
});

app.get("/api/ready", async (_req, res) => {
  try {
    const [databaseOk, tegolaOk] = await Promise.all([checkDatabase(), checkTegola()]);
    const ok = databaseOk && tegolaOk;
    res.status(ok ? 200 : 503).json({
      ok,
      checks: {
        database: databaseOk,
        tegola: tegolaOk,
      },
      ts: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    res.status(503).json({ ok: false, checks: { database: false, tegola: false }, error: message, ts: new Date().toISOString() });
  }
});

type FormInput = {
  nombre: string;
  telefono: string;
  fecha: string;
  x: number;
  y: number;
  zona: string;
  candidate?: string;
  encuestador: string;
  encuestador_id: string;
  candidato_preferido: string;
  client_id?: string;
  home_maps_url?: string;
  polling_place_url?: string;
  comentarios?: string;
};

function toNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`campo invalido: ${field}`);
  }
  return value.trim();
}

function toNumber(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`campo invalido: ${field}`);
  }
  return n;
}

function normalizeForm(raw: unknown): FormInput {
  if (!raw || typeof raw !== "object") {
    throw new Error("payload invalido");
  }

  const data = raw as Record<string, unknown>;
  const dateValue = new Date(toNonEmptyString(data.fecha, "fecha"));
  if (Number.isNaN(dateValue.getTime())) {
    throw new Error("campo invalido: fecha");
  }

  const clientId = typeof data.client_id === "string" && data.client_id.trim() ? data.client_id.trim() : undefined;

  return {
    nombre: toNonEmptyString(data.nombre, "nombre"),
    telefono: toNonEmptyString(data.telefono, "telefono"),
    fecha: dateValue.toISOString(),
    x: toNumber(data.x, "x"),
    y: toNumber(data.y, "y"),
    zona: toNonEmptyString(data.zona, "zona"),
    candidate: typeof data.candidate === "string" ? data.candidate.trim() : undefined,
    encuestador: toNonEmptyString(data.encuestador, "encuestador"),
    encuestador_id: toNonEmptyString(data.encuestador_id, "encuestador_id"),
    candidato_preferido: toNonEmptyString(data.candidato_preferido, "candidato_preferido"),
    client_id: clientId,
    home_maps_url: typeof data.home_maps_url === "string" ? data.home_maps_url.trim() : undefined,
    polling_place_url: typeof data.polling_place_url === "string" ? data.polling_place_url.trim() : undefined,
    comentarios: typeof data.comentarios === "string" ? data.comentarios.trim() : undefined,
  };
}

async function insertForm(form: FormInput) {
  if (!dbPool) {
    throw new Error("DATABASE_URL no configurada");
  }

  if (form.client_id) {
    const existing = await dbPool.query("SELECT id FROM public.forms WHERE client_id = $1 LIMIT 1", [form.client_id]);
    if (existing.rowCount && existing.rowCount > 0) {
      return { deduped: true };
    }

    await dbPool.query(
      `INSERT INTO public.forms (
        nombre, telefono, fecha, x, y, zona, candidate, encuestador, encuestador_id,
        candidato_preferido, client_id, home_maps_url, polling_place_url, comentarios
      ) VALUES (
        $1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14
      )`,
      [
        form.nombre,
        form.telefono,
        form.fecha,
        form.x,
        form.y,
        form.zona,
        form.candidate ?? "",
        form.encuestador,
        form.encuestador_id,
        form.candidato_preferido,
        form.client_id,
        form.home_maps_url ?? null,
        form.polling_place_url ?? null,
        form.comentarios ?? null,
      ],
    );

    return { deduped: false };
  }

  await dbPool.query(
    `INSERT INTO public.forms (
      nombre, telefono, fecha, x, y, zona, candidate, encuestador, encuestador_id,
      candidato_preferido, home_maps_url, polling_place_url, comentarios
    ) VALUES (
      $1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13
    )`,
    [
      form.nombre,
      form.telefono,
      form.fecha,
      form.x,
      form.y,
      form.zona,
      form.candidate ?? "",
      form.encuestador,
      form.encuestador_id,
      form.candidato_preferido,
      form.home_maps_url ?? null,
      form.polling_place_url ?? null,
      form.comentarios ?? null,
    ],
  );

  return { deduped: false };
}

async function ensureFormsTable() {
  if (!dbPool) return;

  await dbPool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS public.forms (
      nombre text NOT NULL,
      telefono text NOT NULL,
      fecha timestamptz NOT NULL,
      x double precision NOT NULL,
      y double precision NOT NULL,
      zona text NOT NULL,
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate text NOT NULL DEFAULT '',
      encuestador text NOT NULL,
      encuestador_id text NOT NULL,
      candidato_preferido text NOT NULL,
      client_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      home_maps_url text,
      polling_place_url text,
      comentarios text
    )
  `);
  await dbPool.query("CREATE UNIQUE INDEX IF NOT EXISTS forms_client_id_key ON public.forms (client_id) WHERE client_id IS NOT NULL");
  await dbPool.query("CREATE INDEX IF NOT EXISTS forms_client_id_idx ON public.forms (client_id)");
}

app.post("/api/forms", async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    if (payload.length === 0) {
      res.status(400).json({ ok: false, error: "payload vacio" });
      return;
    }

    let deduped = 0;
    for (const item of payload) {
      const normalized = normalizeForm(item);
      const result = await insertForm(normalized);
      if (result.deduped) deduped += 1;
    }

    res.status(200).json({ ok: true, accepted: payload.length, deduped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    const status = message.startsWith("campo invalido") || message === "payload invalido" ? 400 : 500;
    logger.error("error insertando forms", { message, status });
    res.status(status).json({ ok: false, error: message });
  }
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

void ensureFormsTable().catch((error) => {
  logger.error("error inicializando forms", { message: error instanceof Error ? error.message : String(error) });
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

process.on("beforeExit", async () => {
  if (dbPool) {
    await dbPool.end();
  }
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
