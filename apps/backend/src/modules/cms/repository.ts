import { pool } from "../../db";

export type CmsContactRow = {
  id: string;
  campaign_id: string;
  data: Record<string, unknown>;
  client_id: string;
  created_at: Date;
  cms_status: "nuevo" | "claimed" | "hablado";
  cms_claimed_by: string | null;
  cms_claimed_at: Date | null;
  cms_operator_notes: Record<string, unknown>;
  // Derived
  nombre: string;
  telefono: string;
  is_locked: boolean;
  claimed_by_email?: string;
};

// ── List nuevo contacts for CMS ─────────────────────────────────────

export async function getNuevosForCms(
  campaignId: string,
  currentUserId: string,
  limit = 100,
  offset = 0,
): Promise<{ contacts: CmsContactRow[]; total: number }> {
  const [dataResult, countResult] = await Promise.all([
    pool.query<CmsContactRow>(
      `SELECT
         fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
         fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_operator_notes,
         COALESCE(fs.data->>'nombre', '') AS nombre,
         COALESCE(fs.data->>'telefono', '') AS telefono,
         CASE
           WHEN fs.cms_status = 'claimed' AND fs.cms_claimed_by != $2 THEN true
           ELSE false
         END AS is_locked,
         u.email AS claimed_by_email
       FROM form_submissions fs
       LEFT JOIN users u ON u.id = fs.cms_claimed_by
       WHERE fs.campaign_id = $1
         AND fs.cms_status IN ('nuevo', 'claimed')
         AND COALESCE(fs.data->>'telefono', '') != ''
       ORDER BY fs.created_at DESC
       LIMIT $3 OFFSET $4`,
      [campaignId, currentUserId, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM form_submissions
       WHERE campaign_id = $1
         AND cms_status IN ('nuevo', 'claimed')
         AND COALESCE(data->>'telefono', '') != ''`,
      [campaignId],
    ),
  ]);

  return {
    contacts: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// ── List hablado contacts for a specific operator ───────────────────

export async function getHabladoByOperator(
  campaignId: string,
  operatorId: string,
  limit = 100,
  offset = 0,
): Promise<{ contacts: CmsContactRow[]; total: number }> {
  const [dataResult, countResult] = await Promise.all([
    pool.query<CmsContactRow>(
      `SELECT
         fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
         fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_operator_notes,
         COALESCE(fs.data->>'nombre', '') AS nombre,
         COALESCE(fs.data->>'telefono', '') AS telefono,
         false AS is_locked,
         u.email AS claimed_by_email
       FROM form_submissions fs
       LEFT JOIN users u ON u.id = fs.cms_claimed_by
       WHERE fs.campaign_id = $1
         AND fs.cms_status = 'hablado'
         AND fs.cms_claimed_by = $2
       ORDER BY fs.cms_claimed_at DESC
       LIMIT $3 OFFSET $4`,
      [campaignId, operatorId, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM form_submissions
       WHERE campaign_id = $1
         AND cms_status = 'hablado'
         AND cms_claimed_by = $2`,
      [campaignId, operatorId],
    ),
  ]);

  return {
    contacts: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// ── Claim contact ───────────────────────────────────────────────────

export async function claimContact(
  submissionId: string,
  operatorId: string,
): Promise<CmsContactRow | null> {
  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions
     SET cms_status = 'claimed',
         cms_claimed_by = $2,
         cms_claimed_at = now()
     WHERE id = $1
       AND cms_status = 'nuevo'
     RETURNING id, campaign_id, data, client_id, created_at,
               cms_status, cms_claimed_by, cms_claimed_at, cms_operator_notes,
               COALESCE(data->>'nombre', '') AS nombre,
               COALESCE(data->>'telefono', '') AS telefono,
               false AS is_locked`,
    [submissionId, operatorId],
  );
  return rows[0] ?? null;
}

// ── Release contact ─────────────────────────────────────────────────

export async function releaseContact(
  submissionId: string,
  operatorId: string,
): Promise<{ campaign_id: string } | null> {
  const { rows } = await pool.query<{ campaign_id: string }>(
    `UPDATE form_submissions
     SET cms_status = 'nuevo',
         cms_claimed_by = NULL,
         cms_claimed_at = NULL
     WHERE id = $1
       AND cms_claimed_by = $2
       AND cms_status = 'claimed'
     RETURNING campaign_id`,
    [submissionId, operatorId],
  );
  return rows[0] ?? null;
}

// ── Mark as hablado ─────────────────────────────────────────────────

export async function markHablado(
  submissionId: string,
  operatorId: string,
): Promise<CmsContactRow | null> {
  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions
     SET cms_status = 'hablado',
         cms_claimed_by = $2,
         cms_claimed_at = COALESCE(cms_claimed_at, now())
     WHERE id = $1
       AND (cms_claimed_by = $2 OR cms_status = 'nuevo')
     RETURNING id, campaign_id, data, client_id, created_at,
               cms_status, cms_claimed_by, cms_claimed_at, cms_operator_notes,
               COALESCE(data->>'nombre', '') AS nombre,
               COALESCE(data->>'telefono', '') AS telefono,
               false AS is_locked`,
    [submissionId, operatorId],
  );
  return rows[0] ?? null;
}

// ── Update operator notes ───────────────────────────────────────────

export async function updateNotes(
  submissionId: string,
  operatorId: string,
  notes: { local_votacion: string; domicilio: string; comentarios: string },
): Promise<CmsContactRow | null> {
  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions
     SET cms_operator_notes = $3::jsonb
     WHERE id = $1
       AND cms_claimed_by = $2
     RETURNING id, campaign_id, data, client_id, created_at,
               cms_status, cms_claimed_by, cms_claimed_at, cms_operator_notes,
               COALESCE(data->>'nombre', '') AS nombre,
               COALESCE(data->>'telefono', '') AS telefono,
               false AS is_locked`,
    [submissionId, operatorId, JSON.stringify(notes)],
  );
  return rows[0] ?? null;
}

// ── Stats ───────────────────────────────────────────────────────────

export async function getCmsStats(
  campaignId: string,
  operatorId: string,
): Promise<{ total: number; nuevos: number; hablados_mios: number; claimed: number }> {
  const { rows } = await pool.query<{
    total: string;
    nuevos: string;
    hablados_mios: string;
    claimed: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(data->>'telefono', '') != '')::text AS total,
       COUNT(*) FILTER (WHERE cms_status = 'nuevo' AND COALESCE(data->>'telefono', '') != '')::text AS nuevos,
       COUNT(*) FILTER (WHERE cms_status = 'hablado' AND cms_claimed_by = $2)::text AS hablados_mios,
       COUNT(*) FILTER (WHERE cms_status = 'claimed')::text AS claimed
     FROM form_submissions
     WHERE campaign_id = $1`,
    [campaignId, operatorId],
  );
  const row = rows[0];
  return {
    total: parseInt(row?.total ?? "0", 10),
    nuevos: parseInt(row?.nuevos ?? "0", 10),
    hablados_mios: parseInt(row?.hablados_mios ?? "0", 10),
    claimed: parseInt(row?.claimed ?? "0", 10),
  };
}

// ── Snapshot of currently claimed contacts (for SSE init) ───────────

export async function getClaimedSnapshot(
  campaignId: string,
): Promise<Array<{ id: string; claimed_by: string; claimed_by_email: string }>> {
  const { rows } = await pool.query<{
    id: string;
    claimed_by: string;
    claimed_by_email: string;
  }>(
    `SELECT fs.id, fs.cms_claimed_by AS claimed_by, u.email AS claimed_by_email
     FROM form_submissions fs
     LEFT JOIN users u ON u.id = fs.cms_claimed_by
     WHERE fs.campaign_id = $1
       AND fs.cms_status = 'claimed'`,
    [campaignId],
  );
  return rows;
}
