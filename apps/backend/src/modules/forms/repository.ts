import { sql } from "drizzle-orm";

import { db, pool } from "../../db";
import type { FormInput } from "./schema";

export interface FormRecord {
  id: string;
  client_id: string;
  nombre: string;
  telefono: string;
  fecha: string;
  x: number;
  y: number;
  zona: string;
  encuestador: string;
  encuestador_id: string;
  candidato_preferido: string;
  comentarios: string | null;
  campaign_id: string | null;
  created_at: string;
}

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

/**
 * Pre-enqueue check: returns phone numbers that already exist in
 * form_submissions for the given campaign.  Runs a single cheap SELECT so
 * the handler can reject duplicates synchronously (409) before they hit the
 * write-behind queue.
 */
export async function findDuplicatePhones(
  campaignId: string,
  phones: string[],
): Promise<string[]> {
  const cleaned = phones.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const result = await pool.query<{ phone: string }>(
    `SELECT DISTINCT fs.data->>'telefono' AS phone
     FROM   form_submissions fs
     WHERE  fs.campaign_id = $1
       AND  fs.deleted_at IS NULL
       AND  fs.data->>'telefono' = ANY($2::text[])`,
    [campaignId, cleaned],
  );

  return result.rows.map((r) => r.phone);
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
      // All NOT NULL columns get safe defaults to prevent DLQ on missing fields
      nombre: (form.nombre as string | null | undefined) ?? '',
      telefono: (form.telefono as string | null | undefined) ?? '',
      fecha: form.fecha ?? new Date().toISOString(),
      // x/y are NOT NULL in DB — default to 0 when GPS was not captured (lugar_registro path)
      x: (form.x as number | null | undefined) ?? 0,
      y: (form.y as number | null | undefined) ?? 0,
      zona: (form.zona as string | null | undefined) ?? '',
      // Use candidato_preferido as fallback for candidate (legacy field)
      candidate: form.candidate ?? form.candidato_preferido ?? "",
      encuestador: (form.encuestador as string | null | undefined) ?? '',
      encuestador_id: (form.encuestador_id as string | null | undefined) ?? '',
      candidato_preferido: (form.candidato_preferido as string | null | undefined) ?? '',
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
      -- Deduplicate within the batch itself (keep oldest client_id per phone+campaign)
      deduped AS (
        SELECT DISTINCT ON (campaign_id, CASE WHEN telefono <> '' THEN telefono ELSE client_id END)
          nombre, telefono, fecha, x, y, zona, candidate, encuestador, encuestador_id,
          candidato_preferido, client_id, home_maps_url, polling_place_url, comentarios,
          campaign_id, form_definition_id
        FROM incoming
        ORDER BY campaign_id,
                 CASE WHEN telefono <> '' THEN telefono ELSE client_id END,
                 client_id ASC
      ),
      inserted AS (
        INSERT INTO public.forms (
          nombre, telefono, fecha, x, y, zona, candidate, encuestador, encuestador_id,
          candidato_preferido, client_id, home_maps_url, polling_place_url, comentarios,
          campaign_id, form_definition_id
        )
        SELECT
          d.nombre, d.telefono, d.fecha, d.x, d.y, d.zona, d.candidate, d.encuestador,
          d.encuestador_id, d.candidato_preferido, d.client_id, d.home_maps_url,
          d.polling_place_url, d.comentarios, d.campaign_id, d.form_definition_id
        FROM deduped d
        -- Skip phones already in the DB for this campaign
        WHERE NOT EXISTS (
          SELECT 1 FROM public.forms ex
          WHERE ex.campaign_id = d.campaign_id
            AND ex.telefono = d.telefono
            AND d.telefono <> ''
            AND ex.deleted_at IS NULL
        )
        -- client_id dedup (idempotent retries) + phone unique index as safety net
        ON CONFLICT DO NOTHING
        RETURNING client_id
      )
      SELECT
        (SELECT count(*)::bigint FROM incoming) AS attempted,
        (SELECT count(*)::bigint FROM inserted) AS accepted
    `,
    [payload],
  )) as { rows: Array<{ attempted: string | number; accepted: string | number }> };

  const row = result.rows[0] ?? { attempted: 0, accepted: 0 };
  const batchResult = {
    attempted: Number(row.attempted ?? 0),
    accepted: Number(row.accepted ?? 0),
  };

  // ── Dual-write to form_submissions (best-effort) ──────────────────
  // Bridge legacy forms to the new JSONB form_submissions table
  if (batchResult.accepted > 0) {
    try {
      const submissionsPayload = JSON.stringify(
        forms.map((f) => ({
          form_definition_id: f.form_definition_id ?? null,
          campaign_id: f.campaign_id ?? null,
          meet_id: null,
          meet_group_id: null,
          submitted_by: f.encuestador_id ?? null,
          data: JSON.stringify({
            nombre: f.nombre,
            telefono: f.telefono,
            zona: f.zona,
            candidato_preferido: f.candidato_preferido,
            comentarios: f.comentarios ?? null,
            encuestador: f.encuestador,
            home_maps_url: f.home_maps_url ?? null,
            polling_place_url: f.polling_place_url ?? null,
          }),
          lat: f.y ?? null,
          lng: f.x ?? null,
          client_id: f.client_id,
        })),
      );

      await pool.query(
        `
          WITH incoming AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS x(
              form_definition_id uuid,
              campaign_id uuid,
              meet_id uuid,
              meet_group_id uuid,
              submitted_by text,
              data text,
              lat double precision,
              lng double precision,
              client_id text
            )
          )
          INSERT INTO form_submissions (
            form_definition_id, campaign_id, meet_id, meet_group_id, submitted_by,
            data, lat, lng, client_id, synced_at
          )
          SELECT
            i.form_definition_id, i.campaign_id, i.meet_id, i.meet_group_id,
            CASE WHEN i.submitted_by ~ '^[0-9a-f-]{36}$' THEN i.submitted_by::uuid ELSE NULL END,
            i.data::jsonb, i.lat, i.lng, i.client_id, now()
          FROM incoming i
          WHERE NOT EXISTS (
            SELECT 1 FROM public.form_submissions ex
            WHERE ex.campaign_id = i.campaign_id::uuid
              AND ex.data->>'telefono' = i.data::jsonb->>'telefono'
              AND COALESCE(i.data::jsonb->>'telefono', '') <> ''
              AND ex.deleted_at IS NULL
          )
          ON CONFLICT (client_id) DO NOTHING
        `,
        [submissionsPayload],
      );
    } catch {
      // Best-effort: don't fail the main write if dual-write fails
    }
  }

  return batchResult;
}

/**
 * Get forms by campaign_id with pagination
 */
export async function getFormsByCampaign(
  campaignId: string,
  limit = 50,
  offset = 0,
): Promise<{ forms: FormRecord[]; total: number }> {
  const [formsResult, countResult] = await Promise.all([
    pool.query<FormRecord>(
      `SELECT 
        id, client_id, nombre, telefono, fecha, x, y, zona,
        encuestador, encuestador_id, candidato_preferido, 
        comentarios, campaign_id, created_at
       FROM public.forms 
       WHERE campaign_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [campaignId, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM public.forms WHERE campaign_id = $1 AND deleted_at IS NULL`,
      [campaignId],
    ),
  ]);

  return {
    forms: formsResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

/**
 * Get recent forms for a campaign (for dashboard).
 * Reads from both legacy forms table AND new form_submissions table.
 *
 * @param from - Optional ISO date string (inclusive lower bound on created_at)
 * @param to   - Optional ISO date string (exclusive upper bound on created_at)
 */
export async function getRecentForms(
  campaignId: string,
  limit = 20,
  from?: string,
  to?: string,
): Promise<FormRecord[]> {
  // Build dynamic WHERE clauses for date range
  const params: (string | number)[] = [campaignId];
  let paramIdx = 2;

  let legacyDateFilter = "";
  let submissionsDateFilter = "";

  if (from) {
    legacyDateFilter += ` AND created_at >= $${paramIdx}`;
    submissionsDateFilter += ` AND fs.created_at >= $${paramIdx}`;
    params.push(from);
    paramIdx++;
  }
  if (to) {
    legacyDateFilter += ` AND created_at < $${paramIdx}`;
    submissionsDateFilter += ` AND fs.created_at < $${paramIdx}`;
    params.push(to);
    paramIdx++;
  }

  // limit=0 → no cap (return everything)
  let limitClause = "";
  if (limit > 0) {
    params.push(limit);
    limitClause = `LIMIT $${paramIdx}`;
  }

  const result = await pool.query<FormRecord>(
    `WITH combined AS (
      -- Legacy forms table
      SELECT 
        id, client_id, nombre, telefono, fecha, x, y, zona,
        encuestador, encuestador_id, candidato_preferido, 
        comentarios, campaign_id, created_at,
        NULL::uuid as agent_id
      FROM public.forms 
      WHERE campaign_id = $1 AND deleted_at IS NULL${legacyDateFilter}
      
      UNION ALL
      
      -- New form_submissions table (extract fields from JSONB data)
      SELECT 
        fs.id,
        fs.client_id,
        COALESCE(fs.data->>'nombre', fs.data->>'Nombre Completo', '') as nombre,
        COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', '') as telefono,
        fs.created_at as fecha,
        fs.lng as x,
        fs.lat as y,
        COALESCE(fs.data->>'zona', 'Sin zona') as zona,
        COALESCE(fs.data->>'encuestador', u.full_name, 'Agente') as encuestador,
        COALESCE(fs.submitted_by::text, '') as encuestador_id,
        COALESCE(fs.data->>'candidato_preferido', '') as candidato_preferido,
        fs.data->>'comentarios' as comentarios,
        fs.campaign_id,
        fs.created_at,
        fs.submitted_by as agent_id
      FROM form_submissions fs
      LEFT JOIN users u ON u.id = fs.submitted_by
      WHERE fs.campaign_id = $1
        AND fs.deleted_at IS NULL${submissionsDateFilter}
    ),
    deduped AS (
      SELECT * FROM (
        SELECT DISTINCT ON (client_id) *
        FROM combined
        ORDER BY client_id, created_at DESC
      ) d
      ORDER BY created_at DESC
      ${limitClause}
    )
    SELECT
      id, client_id, nombre, telefono, fecha, x, y, zona,
      encuestador, encuestador_id, candidato_preferido, comentarios,
      campaign_id, created_at, agent_id
    FROM deduped`,
    params,
  );

  return result.rows;
}

/**
 * Hard-delete a form by ID (admin only).
 * Deletes from both legacy forms table and form_submissions table.
 */
export async function deleteFormById(
  formId: string,
  campaignId: string,
): Promise<{ deleted: boolean; source: "forms" | "form_submissions" | null }> {
  const legacyResult = await pool.query(
    `DELETE FROM public.forms WHERE id = $1 AND campaign_id = $2 RETURNING id`,
    [formId, campaignId],
  );

  if (legacyResult.rowCount && legacyResult.rowCount > 0) {
    return { deleted: true, source: "forms" };
  }

  const submissionsResult = await pool.query(
    `DELETE FROM form_submissions WHERE id = $1 AND campaign_id = $2 RETURNING id`,
    [formId, campaignId],
  );

  if (submissionsResult.rowCount && submissionsResult.rowCount > 0) {
    return { deleted: true, source: "form_submissions" };
  }

  return { deleted: false, source: null };
}

/**
 * Update editable fields of a form (admin/consultor only).
 * Updates both legacy forms table and form_submissions table.
 */
export async function updateFormById(
  formId: string,
  campaignId: string,
  updates: { nombre?: string; telefono?: string; zona?: string; comentarios?: string | null },
): Promise<{ updated: boolean; source: "forms" | "form_submissions" | null }> {
  // Build SET clauses dynamically for legacy forms table
  const setClauses: string[] = [];
  const params: (string | null)[] = [formId, campaignId];
  let paramIdx = 3;

  if (updates.nombre !== undefined) {
    setClauses.push(`nombre = $${paramIdx}`);
    params.push(updates.nombre);
    paramIdx++;
  }
  if (updates.telefono !== undefined) {
    setClauses.push(`telefono = $${paramIdx}`);
    params.push(updates.telefono);
    paramIdx++;
  }
  if (updates.zona !== undefined) {
    setClauses.push(`zona = $${paramIdx}`);
    params.push(updates.zona);
    paramIdx++;
  }
  if (updates.comentarios !== undefined) {
    setClauses.push(`comentarios = $${paramIdx}`);
    params.push(updates.comentarios);
    paramIdx++;
  }

  if (setClauses.length === 0) {
    return { updated: false, source: null };
  }

  // Try legacy forms table first
  const legacyResult = await pool.query(
    `UPDATE public.forms SET ${setClauses.join(", ")}
     WHERE id = $1 AND campaign_id = $2 AND deleted_at IS NULL RETURNING id`,
    params,
  );

  if (legacyResult.rowCount && legacyResult.rowCount > 0) {
    return { updated: true, source: "forms" };
  }

  // Try form_submissions table (JSONB data column)
  const jsonbSets: string[] = [];
  if (updates.nombre !== undefined) jsonbSets.push(`'nombre', to_jsonb($${setClauses.length > 0 ? 3 : paramIdx}::text)`);
  if (updates.telefono !== undefined) jsonbSets.push(`'telefono', to_jsonb($${setClauses.length > 0 ? (updates.nombre !== undefined ? 4 : 3) : paramIdx}::text)`);

  // For form_submissions, build jsonb_set chain
  const jsonbUpdates: Record<string, string> = {};
  if (updates.nombre !== undefined) jsonbUpdates.nombre = updates.nombre;
  if (updates.telefono !== undefined) jsonbUpdates.telefono = updates.telefono;
  if (updates.zona !== undefined) jsonbUpdates.zona = updates.zona;
  if (updates.comentarios !== undefined) jsonbUpdates.comentarios = updates.comentarios ?? "";

  const submissionsResult = await pool.query(
    `UPDATE form_submissions SET data = data || $3::jsonb
     WHERE id = $1 AND campaign_id = $2 AND deleted_at IS NULL RETURNING id`,
    [formId, campaignId, JSON.stringify(jsonbUpdates)],
  );

  if (submissionsResult.rowCount && submissionsResult.rowCount > 0) {
    return { updated: true, source: "form_submissions" };
  }

  return { updated: false, source: null };
}

/**
 * Soft-delete a form by ID (non-admin).
 * Sets deleted_at + deleted_by instead of removing the row.
 */
export async function softDeleteFormById(
  formId: string,
  campaignId: string,
  deletedBy: string,
): Promise<{ deleted: boolean; source: "forms" | "form_submissions" | null }> {
  const legacyResult = await pool.query(
    `UPDATE public.forms SET deleted_at = now(), deleted_by = $3
     WHERE id = $1 AND campaign_id = $2 AND deleted_at IS NULL RETURNING id`,
    [formId, campaignId, deletedBy],
  );

  if (legacyResult.rowCount && legacyResult.rowCount > 0) {
    return { deleted: true, source: "forms" };
  }

  const submissionsResult = await pool.query(
    `UPDATE form_submissions SET deleted_at = now(), deleted_by = $3
     WHERE id = $1 AND campaign_id = $2 AND deleted_at IS NULL RETURNING id`,
    [formId, campaignId, deletedBy],
  );

  if (submissionsResult.rowCount && submissionsResult.rowCount > 0) {
    return { deleted: true, source: "form_submissions" };
  }

  return { deleted: false, source: null };
}

/**
 * Restore a soft-deleted form (admin only).
 */
export async function restoreFormById(
  formId: string,
  campaignId: string,
): Promise<boolean> {
  const r1 = await pool.query(
    `UPDATE public.forms SET deleted_at = NULL, deleted_by = NULL
     WHERE id = $1 AND campaign_id = $2 AND deleted_at IS NOT NULL RETURNING id`,
    [formId, campaignId],
  );
  if (r1.rowCount && r1.rowCount > 0) return true;

  const r2 = await pool.query(
    `UPDATE form_submissions SET deleted_at = NULL, deleted_by = NULL
     WHERE id = $1 AND campaign_id = $2 AND deleted_at IS NOT NULL RETURNING id`,
    [formId, campaignId],
  );
  return (r2.rowCount ?? 0) > 0;
}

/**
 * Get all soft-deleted forms pending admin review.
 */
export async function getPendingDeletions(campaignId: string) {
  const result = await pool.query(
    `(
      SELECT f.id, 'forms' AS source, f.campaign_id,
             f.deleted_at, f.deleted_by, u.full_name AS deleted_by_name,
             f.data->>'nombre' AS record_name, f.created_at
      FROM public.forms f
      LEFT JOIN users u ON u.id = f.deleted_by
      WHERE f.campaign_id = $1 AND f.deleted_at IS NOT NULL
    ) UNION ALL (
      SELECT fs.id, 'form_submissions' AS source, fs.campaign_id,
             fs.deleted_at, fs.deleted_by, u.full_name AS deleted_by_name,
             fs.data->>'nombre' AS record_name, fs.created_at
      FROM form_submissions fs
      LEFT JOIN users u ON u.id = fs.deleted_by
      WHERE fs.campaign_id = $1 AND fs.deleted_at IS NOT NULL
    )
    ORDER BY deleted_at DESC`,
    [campaignId],
  );
  return result.rows;
}

/**
 * Hard-delete multiple forms by IDs in a single query (admin only).
 * Tries legacy forms table first, then form_submissions.
 * Returns total number of deleted rows.
 */
export async function batchHardDeleteForms(
  ids: string[],
  campaignId: string,
): Promise<number> {
  const r1 = await pool.query(
    `DELETE FROM public.forms WHERE id = ANY($1::uuid[]) AND campaign_id = $2 RETURNING id`,
    [ids, campaignId],
  );
  const r2 = await pool.query(
    `DELETE FROM form_submissions WHERE id = ANY($1::uuid[]) AND campaign_id = $2 RETURNING id`,
    [ids, campaignId],
  );
  return (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
}

/**
 * Soft-delete multiple forms by IDs in a single query (non-admin).
 * Sets deleted_at + deleted_by instead of removing the rows.
 * Returns total number of soft-deleted rows.
 */
export async function batchSoftDeleteForms(
  ids: string[],
  campaignId: string,
  deletedBy: string,
): Promise<number> {
  const r1 = await pool.query(
    `UPDATE public.forms SET deleted_at = now(), deleted_by = $3
     WHERE id = ANY($1::uuid[]) AND campaign_id = $2 AND deleted_at IS NULL RETURNING id`,
    [ids, campaignId, deletedBy],
  );
  const r2 = await pool.query(
    `UPDATE form_submissions SET deleted_at = now(), deleted_by = $3
     WHERE id = ANY($1::uuid[]) AND campaign_id = $2 AND deleted_at IS NULL RETURNING id`,
    [ids, campaignId, deletedBy],
  );
  return (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
}
