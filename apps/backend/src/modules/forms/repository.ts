import { sql } from "drizzle-orm";

import { db, pool } from "../../db";
import type { FormInput } from "./schema";

export async function ensureFormsTable() {
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
      client_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      home_maps_url text,
      polling_place_url text,
      comentarios text,
      campaign_id uuid REFERENCES campaigns(id)
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_forms_client_id ON public.forms (client_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_forms_created_at ON public.forms (created_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_forms_encuestador_created_at ON public.forms (encuestador_id, created_at DESC)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_forms_campaign_id ON public.forms (campaign_id)`);
}

type BatchResult = {
  attempted: number;
  accepted: number;
};

export async function insertFormsIdempotentBatch(forms: FormInput[]): Promise<BatchResult> {
  if (forms.length === 0) {
    return { attempted: 0, accepted: 0 };
  }

  const payload = JSON.stringify(
    forms.map((form) => ({
      nombre: form.nombre,
      telefono: form.telefono,
      fecha: form.fecha,
      x: form.x,
      y: form.y,
      zona: form.zona,
      candidate: form.candidate,
      encuestador: form.encuestador,
      encuestador_id: form.encuestador_id,
      candidato_preferido: form.candidato_preferido,
      client_id: form.client_id,
      home_maps_url: form.home_maps_url ?? null,
      polling_place_url: form.polling_place_url ?? null,
      comentarios: form.comentarios ?? null,
      campaign_id: form.campaign_id ?? null,
      form_definition_id: form.form_definition_id ?? null,
    })),
  );

  const result = (await pool.query(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          nombre text,
          telefono text,
          fecha timestamptz,
          x double precision,
          y double precision,
          zona text,
          candidate text,
          encuestador text,
          encuestador_id text,
          candidato_preferido text,
          client_id text,
          home_maps_url text,
          polling_place_url text,
          comentarios text,
          campaign_id uuid,
          form_definition_id uuid
        )
      ),
      inserted AS (
        INSERT INTO public.forms (
          nombre, telefono, fecha, x, y, zona, candidate, encuestador, encuestador_id,
          candidato_preferido, client_id, home_maps_url, polling_place_url, comentarios,
          campaign_id, form_definition_id
        )
        SELECT
          i.nombre, i.telefono, i.fecha, i.x, i.y, i.zona, i.candidate, i.encuestador,
          i.encuestador_id, i.candidato_preferido, i.client_id, i.home_maps_url,
          i.polling_place_url, i.comentarios, i.campaign_id, i.form_definition_id
        FROM incoming i
        ON CONFLICT (client_id) DO NOTHING
        RETURNING client_id
      )
      SELECT
        (SELECT count(*)::bigint FROM incoming) AS attempted,
        (SELECT count(*)::bigint FROM inserted) AS accepted
    `,
    [payload],
  )) as { rows: Array<{ attempted: string | number; accepted: string | number }> };

  const row = result.rows[0] ?? { attempted: 0, accepted: 0 };
  return {
    attempted: Number(row.attempted ?? 0),
    accepted: Number(row.accepted ?? 0),
  };
}
