import "dotenv/config";

import Fastify from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, pool } from "./db";
import { forms } from "./schema";

const PORT = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "*";

const formSchema = z.object({
  nombre: z.string().trim().min(1),
  telefono: z.string().trim().min(1),
  fecha: z.string().datetime(),
  x: z.coerce.number().finite(),
  y: z.coerce.number().finite(),
  zona: z.string().trim().min(1),
  candidate: z.string().trim().optional().default(""),
  encuestador: z.string().trim().min(1),
  encuestador_id: z.string().trim().min(1),
  candidato_preferido: z.string().trim().min(1),
  client_id: z.string().trim().optional(),
  home_maps_url: z.string().trim().optional(),
  polling_place_url: z.string().trim().optional(),
  comentarios: z.string().trim().optional(),
});

async function ensureFormsTable() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await db.execute(sql`
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
  await db.execute(sql`CREATE INDEX IF NOT EXISTS forms_client_id_idx ON public.forms (client_id)`);
}

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(compress);
await app.register(cors, {
  origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN,
  credentials: true,
});
await app.register(rateLimit, {
  max: 240,
  timeWindow: "1 minute",
});

app.get("/health", async () => ({ ok: true, service: "backend-fastify", ts: new Date().toISOString() }));
app.get("/api/health", async () => ({ ok: true, service: "backend-fastify", ts: new Date().toISOString() }));

app.post("/api/forms", async (request, reply) => {
  const payload = Array.isArray(request.body) ? request.body : [request.body];
  if (payload.length === 0) {
    return reply.code(400).send({ ok: false, error: "payload vacio" });
  }

  let deduped = 0;

  for (const item of payload) {
    const parsed = formSchema.safeParse(item);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "payload invalido", issues: parsed.error.issues });
    }

    const form = parsed.data;

    if (form.client_id) {
      const existing = await db.select({ id: forms.id }).from(forms).where(eq(forms.clientId, form.client_id)).limit(1);
      if (existing.length > 0) {
        deduped += 1;
        continue;
      }
    }

    await db.insert(forms).values({
      nombre: form.nombre,
      telefono: form.telefono,
      fecha: new Date(form.fecha),
      x: form.x,
      y: form.y,
      zona: form.zona,
      candidate: form.candidate,
      encuestador: form.encuestador,
      encuestadorId: form.encuestador_id,
      candidatoPreferido: form.candidato_preferido,
      clientId: form.client_id,
      homeMapsUrl: form.home_maps_url,
      pollingPlaceUrl: form.polling_place_url,
      comentarios: form.comentarios,
    });
  }

  return reply.code(200).send({ ok: true, accepted: payload.length, deduped });
});

await ensureFormsTable();

await app.listen({ host: "0.0.0.0", port: PORT });

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
