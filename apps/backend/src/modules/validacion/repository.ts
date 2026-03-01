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
      claimed_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(form_id, campaign_id)
    )
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
    )
    INSERT INTO form_validations (form_id, campaign_id, nombre, telefono, encuestador, zona, form_created_at)
    SELECT form_id, campaign_id, nombre, telefono, encuestador, zona, form_created_at
    FROM source
    ON CONFLICT (form_id, campaign_id) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      telefono = EXCLUDED.telefono,
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
): Promise<ValidationRow[]> {
  let query = `
    SELECT
      fv.id, fv.form_id, fv.campaign_id::text,
      fv.nombre, fv.telefono, fv.encuestador, fv.zona,
      fv.form_created_at as created_at,
      fv.status, fv.notes,
      fv.claimed_by::text,
      cu.full_name as claimed_by_name,
      fv.updated_at
    FROM form_validations fv
    LEFT JOIN users cu ON cu.id = fv.claimed_by
    WHERE fv.campaign_id = $1
  `;
  const params: unknown[] = [campaignId];

  if (status) {
    query += ` AND fv.status = $2`;
    params.push(status);
  }

  query += ` ORDER BY fv.form_created_at DESC`;

  const { rows } = await pool.query<ValidationRow>(query, params);
  return rows;
}

/* ─── Stats ─── */

export async function statsByCampaign(campaignId: string) {
  const { rows } = await pool.query<{ status: string; count: string }>(`
    SELECT status, count(*)::text as count
    FROM form_validations
    WHERE campaign_id = $1
    GROUP BY status
  `, [campaignId]);

  const stats: Record<string, number> = { pendiente: 0, contactado: 0, validado: 0, invalido: 0 };
  for (const r of rows) stats[r.status] = Number(r.count);
  return stats;
}

/* ─── Update status ─── */

export async function updateStatus(
  id: string,
  campaignId: string,
  status: ValidationStatus,
  notes: string | null,
  userId: string,
): Promise<ValidationRow | null> {
  const { rows } = await pool.query<ValidationRow>(`
    UPDATE form_validations
    SET status = $3, notes = COALESCE($4, notes), claimed_by = $5, updated_at = now()
    WHERE id = $1 AND campaign_id = $2
    RETURNING
      id, form_id, campaign_id::text, nombre, telefono, encuestador, zona,
      form_created_at as created_at, status, notes, claimed_by::text,
      NULL::text as claimed_by_name, updated_at
  `, [id, campaignId, status, notes, userId]);
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
      form_created_at as created_at, status, notes, claimed_by::text,
      NULL::text as claimed_by_name, updated_at
  `, [id, campaignId, userId]);
  return rows[0] ?? null;
}
