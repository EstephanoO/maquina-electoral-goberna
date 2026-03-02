import { pool } from "../../db";
import type { ValidationRow, ValidationStatus } from "./schemas";


/* ─── Ensure table ─── */

export async function ensureValidacionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_validations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id text NOT NULL,
      campaign_id uuid NOT NULL REFERENCES campaigns(id),
      nombre text NOT NULL DEFAULT '',
      telefono text NOT NULL DEFAULT '',
      encuestador text NOT NULL DEFAULT '',
      zona text NOT NULL DEFAULT '',
      form_created_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT 'pendiente',
      notes text,
      tags text[] NOT NULL DEFAULT '{}',
      score int NOT NULL DEFAULT 0,
      vote_class text NOT NULL DEFAULT '',
      claimed_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // Add columns if table already existed without them
  await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS vote_class text NOT NULL DEFAULT ''`);
  // Unique per phone per campaign (dedup across forms + form_submissions)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_form_validations_phone_campaign
    ON form_validations(telefono, campaign_id)
  `);
  // Index for fast campaign queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_form_validations_campaign
    ON form_validations(campaign_id, status)
  `);
}

/* ─── Sync: populate validations from forms + form_submissions ─── */

export async function syncValidations(campaignId: string): Promise<number> {
  const result = await pool.query<{ cnt: string }>(`
    WITH source AS (
      -- Legacy forms
      SELECT
        id::text as form_id,
        campaign_id,
        nombre,
        telefono,
        encuestador,
        zona,
        created_at as form_created_at
      FROM forms
      WHERE campaign_id = $1 AND deleted_at IS NULL
        AND telefono IS NOT NULL AND telefono != ''
      
      UNION ALL

      -- New form_submissions
      SELECT
        fs.id::text as form_id,
        fs.campaign_id,
        COALESCE(fs.data->>'nombre', fs.data->>'Nombre Completo', '') as nombre,
        COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', '') as telefono,
        COALESCE(fs.data->>'encuestador', u.full_name, 'Agente') as encuestador,
        COALESCE(fs.data->>'zona', 'Sin zona') as zona,
        fs.created_at as form_created_at
      FROM form_submissions fs
      LEFT JOIN users u ON u.id = fs.submitted_by
      WHERE fs.campaign_id = $1 AND fs.deleted_at IS NULL
        AND COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', '') != ''
    ),
    deduped AS (
      SELECT DISTINCT ON (telefono, campaign_id)
        form_id, campaign_id, nombre, telefono, encuestador, zona, form_created_at
      FROM source
      ORDER BY telefono, campaign_id, form_created_at DESC
    )
    INSERT INTO form_validations (form_id, campaign_id, nombre, telefono, encuestador, zona, form_created_at)
    SELECT form_id, campaign_id, nombre, telefono, encuestador, zona, form_created_at
    FROM deduped
    ON CONFLICT (telefono, campaign_id) DO UPDATE SET
      form_id = EXCLUDED.form_id,
      nombre = EXCLUDED.nombre,
      encuestador = EXCLUDED.encuestador,
      zona = EXCLUDED.zona
    RETURNING id
  `, [campaignId]);
  return result.rowCount ?? 0;
}

/* ─── List validations by campaign ─── */

export async function listByCampaign(
  campaignId: string,
  status?: ValidationStatus,
  limit = 100,
  offset = 0,
): Promise<ValidationRow[]> {
  const params: unknown[] = [campaignId];
  let where = "WHERE fv.campaign_id = $1";

  if (status) {
    params.push(status);
    where += ` AND fv.status = $${params.length}`;
  }

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const query = `
    SELECT
      fv.id, fv.form_id, fv.campaign_id::text,
      fv.nombre, fv.telefono, fv.encuestador, fv.zona,
      fv.form_created_at as created_at,
      fv.status, fv.notes,
      COALESCE(fv.tags, '{}') as tags,
      COALESCE(fv.score, 0) as score,
      COALESCE(fv.vote_class, '') as vote_class,
      fv.claimed_by::text,
      cu.full_name as claimed_by_name,
      fv.updated_at
    FROM form_validations fv
    LEFT JOIN users cu ON cu.id = fv.claimed_by
    ${where}
    ORDER BY fv.form_created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query<ValidationRow>(query, params);
  return rows;
}

export async function countByCampaign(
  campaignId: string,
  status?: ValidationStatus,
): Promise<number> {
  const params: unknown[] = [campaignId];
  let where = "WHERE campaign_id = $1";

  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM form_validations ${where}`,
    params,
  );
  return Number(rows[0]?.cnt ?? 0);
}

/* ─── Stats ─── */

export async function statsByCampaign(campaignId: string) {
  const { rows } = await pool.query<{ status: string; count: string }>(`
    SELECT status, count(*)::text as count
    FROM form_validations
    WHERE campaign_id = $1
    GROUP BY status
  `, [campaignId]);

  const stats: Record<string, number> = { pendiente: 0, contactado: 0, respondido: 0, invalido: 0 };
  for (const r of rows) stats[r.status] = Number(r.count);
  // Merge legacy 'validado' into 'respondido'
  if (stats.validado) { stats.respondido = (stats.respondido ?? 0) + stats.validado; delete stats.validado; }
  return stats;
}

/* ─── Update status ─── */

export async function updateStatus(
  id: string,
  campaignId: string,
  status: ValidationStatus,
  notes: string | null,
  userId: string,
  vote_class?: string | null,
): Promise<ValidationRow | null> {
  const finalVoteClass = vote_class ?? "";

  const { rows } = await pool.query<ValidationRow>(`
    UPDATE form_validations
    SET status = $3,
        notes = COALESCE($4, notes),
        claimed_by = $5,
        tags = $6,
        score = $7,
        vote_class = $8,
        updated_at = now()
    WHERE id = $1 AND campaign_id = $2
    RETURNING
      id, form_id, campaign_id::text, nombre, telefono, encuestador, zona,
      form_created_at as created_at, status, notes, tags, score, vote_class,
      claimed_by::text, NULL::text as claimed_by_name, updated_at
  `, [id, campaignId, status, notes, userId, "[]", 0, finalVoteClass]);
  return rows[0] ?? null;
}

/* ─── Claim a contact ─── */

export async function claim(
  id: string,
  campaignId: string,
  userId: string,
): Promise<ValidationRow | null> {
  const { rows } = await pool.query<ValidationRow>(`
    UPDATE form_validations
    SET claimed_by = $3, updated_at = now()
    WHERE id = $1 AND campaign_id = $2
      AND (claimed_by IS NULL OR claimed_by = $3)
    RETURNING
      id, form_id, campaign_id::text, nombre, telefono, encuestador, zona,
      form_created_at as created_at, status, notes,
      COALESCE(tags, '{}') as tags, COALESCE(score, 0) as score,
      COALESCE(vote_class, '') as vote_class,
      claimed_by::text, NULL::text as claimed_by_name, updated_at
  `, [id, campaignId, userId]);
  return rows[0] ?? null;
}
