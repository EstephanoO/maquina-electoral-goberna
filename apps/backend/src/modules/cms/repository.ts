import { pool } from "../../db";

export type CmsContactRow = {
  id: string;
  campaign_id: string;
  data: Record<string, unknown>;
  client_id: string;
  created_at: Date;
  cms_status: "nuevo" | "claimed" | "hablado" | "respondieron" | "archivado";
  cms_claimed_by: string | null;
  cms_claimed_at: Date | null;
  cms_hablado_at: Date | null;
  cms_respondieron_at: Date | null;
  cms_operator_notes: Record<string, unknown>;
  // Derived from data JSONB
  nombre: string;
  telefono: string;
  encuestador: string;
  zona: string;
  distrito: string;
  candidato_preferido: string;
  // Computed
  is_locked: boolean;
  claimed_by_email?: string;
  submitted_by_email?: string;
};

// ── Shared SELECT columns ───────────────────────────────────────────

const CMS_SELECT = `
  fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
  fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
  fs.cms_respondieron_at, fs.cms_operator_notes,
  COALESCE(fs.data->>'nombre', '') AS nombre,
  COALESCE(fs.data->>'telefono', '') AS telefono,
  COALESCE(fs.data->>'encuestador', '') AS encuestador,
  COALESCE(fs.data->>'zona', fs.data->>'distrito', fs.data->>'ubicacion', '') AS zona,
  COALESCE(fs.data->>'distrito', '') AS distrito,
  COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido
`;

// ── List contacts by status filter ──────────────────────────────────

export async function listContacts(
  campaignId: string,
  currentUserId: string,
  status: string,
  limit = 100,
  offset = 0,
  search = "",
): Promise<{ contacts: CmsContactRow[]; total: number }> {
  // Build WHERE clause based on status filter
  let statusClause: string;

  switch (status) {
    case "nuevo":
      statusClause = "fs.cms_status IN ('nuevo', 'claimed')";
      break;
    case "hablado":
      statusClause = "fs.cms_status = 'hablado'";
      break;
    case "respondieron":
      statusClause = "fs.cms_status = 'respondieron'";
      break;
    case "archivado":
      statusClause = "fs.cms_status = 'archivado'";
      break;
    case "todos":
      statusClause = "1=1";
      break;
    default:
      statusClause = "fs.cms_status IN ('nuevo', 'claimed')";
  }

  // Data query uses: $1=campaignId, $2=currentUserId (for is_locked), then search, limit, offset
  const dataParams: unknown[] = [campaignId, currentUserId];
  let dataParamIdx = 3;

  // Count query uses: $1=campaignId, then search (no userId, no limit/offset)
  const countParams: unknown[] = [campaignId];
  let countParamIdx = 2;

  let dataSearchClause = "";
  let countSearchClause = "";
  if (search.trim()) {
    const searchVal = `%${search.trim()}%`;
    dataSearchClause = ` AND (
      fs.data->>'nombre' ILIKE $${dataParamIdx}
      OR fs.data->>'telefono' ILIKE $${dataParamIdx}
      OR fs.data->>'encuestador' ILIKE $${dataParamIdx}
      OR fs.data->>'zona' ILIKE $${dataParamIdx}
      OR fs.data->>'distrito' ILIKE $${dataParamIdx}
    )`;
    dataParams.push(searchVal);
    dataParamIdx++;

    countSearchClause = ` AND (
      fs.data->>'nombre' ILIKE $${countParamIdx}
      OR fs.data->>'telefono' ILIKE $${countParamIdx}
      OR fs.data->>'encuestador' ILIKE $${countParamIdx}
      OR fs.data->>'zona' ILIKE $${countParamIdx}
      OR fs.data->>'distrito' ILIKE $${countParamIdx}
    )`;
    countParams.push(searchVal);
    countParamIdx++;
  }

  dataParams.push(limit, offset);

  // Order by relevant timestamp depending on status
  const orderClause = status === "hablado" || status === "respondieron"
    ? "COALESCE(fs.cms_hablado_at, fs.created_at) DESC"
    : "fs.created_at DESC";

  const [dataResult, countResult] = await Promise.all([
    pool.query<CmsContactRow>(
      `SELECT
         ${CMS_SELECT},
         CASE
           WHEN fs.cms_status = 'claimed' AND fs.cms_claimed_by != $2 THEN true
           ELSE false
         END AS is_locked,
         u.email AS claimed_by_email,
         su.email AS submitted_by_email
       FROM form_submissions fs
       LEFT JOIN users u ON u.id = fs.cms_claimed_by
       LEFT JOIN users su ON su.id = fs.submitted_by
       WHERE fs.campaign_id = $1
         AND ${statusClause}
         AND COALESCE(fs.data->>'telefono', '') != ''
         ${dataSearchClause}
       ORDER BY ${orderClause}
       LIMIT $${dataParamIdx} OFFSET $${dataParamIdx + 1}`,
      dataParams,
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM form_submissions fs
       WHERE fs.campaign_id = $1
         AND ${statusClause}
         AND COALESCE(fs.data->>'telefono', '') != ''
         ${countSearchClause}`,
      countParams,
    ),
  ]);

  return {
    contacts: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// ── Legacy: getNuevosForCms (kept for backwards compat) ──────────────

export async function getNuevosForCms(
  campaignId: string,
  currentUserId: string,
  limit = 100,
  offset = 0,
): Promise<{ contacts: CmsContactRow[]; total: number }> {
  return listContacts(campaignId, currentUserId, "nuevo", limit, offset);
}

// ── Legacy: getHabladoByOperator ─────────────────────────────────────

export async function getHabladoByOperator(
  campaignId: string,
  operatorId: string,
  limit = 100,
  offset = 0,
): Promise<{ contacts: CmsContactRow[]; total: number }> {
  const [dataResult, countResult] = await Promise.all([
    pool.query<CmsContactRow>(
      `SELECT
         ${CMS_SELECT},
         false AS is_locked,
         u.email AS claimed_by_email,
         su.email AS submitted_by_email
       FROM form_submissions fs
       LEFT JOIN users u ON u.id = fs.cms_claimed_by
       LEFT JOIN users su ON su.id = fs.submitted_by
       WHERE fs.campaign_id = $1
         AND fs.cms_status = 'hablado'
         AND fs.cms_claimed_by = $2
       ORDER BY COALESCE(fs.cms_hablado_at, fs.cms_claimed_at) DESC
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
               cms_status, cms_claimed_by, cms_claimed_at, cms_hablado_at,
               cms_respondieron_at, cms_operator_notes,
               COALESCE(data->>'nombre', '') AS nombre,
               COALESCE(data->>'telefono', '') AS telefono,
               COALESCE(data->>'encuestador', '') AS encuestador,
               COALESCE(data->>'zona', data->>'distrito', '') AS zona,
               COALESCE(data->>'distrito', '') AS distrito,
               COALESCE(data->>'candidato_preferido', '') AS candidato_preferido,
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
         cms_claimed_at = COALESCE(cms_claimed_at, now()),
         cms_hablado_at = now(),
         cms_respondieron_at = NULL
     WHERE id = $1
       AND (cms_claimed_by = $2 OR cms_status = 'nuevo')
     RETURNING id, campaign_id, data, client_id, created_at,
               cms_status, cms_claimed_by, cms_claimed_at, cms_hablado_at,
               cms_respondieron_at, cms_operator_notes,
               COALESCE(data->>'nombre', '') AS nombre,
               COALESCE(data->>'telefono', '') AS telefono,
               COALESCE(data->>'encuestador', '') AS encuestador,
               COALESCE(data->>'zona', data->>'distrito', '') AS zona,
               COALESCE(data->>'distrito', '') AS distrito,
               COALESCE(data->>'candidato_preferido', '') AS candidato_preferido,
               false AS is_locked`,
    [submissionId, operatorId],
  );
  return rows[0] ?? null;
}

// ── Mark as respondieron ────────────────────────────────────────────

export async function markRespondieron(
  submissionId: string,
  operatorId: string,
): Promise<CmsContactRow | null> {
  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions
     SET cms_status = 'respondieron',
         cms_claimed_by = $2,
         cms_claimed_at = COALESCE(cms_claimed_at, now()),
         cms_hablado_at = COALESCE(cms_hablado_at, now()),
         cms_respondieron_at = now()
     WHERE id = $1
       AND (cms_claimed_by = $2 OR cms_status IN ('nuevo', 'claimed', 'hablado'))
     RETURNING id, campaign_id, data, client_id, created_at,
               cms_status, cms_claimed_by, cms_claimed_at, cms_hablado_at,
               cms_respondieron_at, cms_operator_notes,
               COALESCE(data->>'nombre', '') AS nombre,
               COALESCE(data->>'telefono', '') AS telefono,
               COALESCE(data->>'encuestador', '') AS encuestador,
               COALESCE(data->>'zona', data->>'distrito', '') AS zona,
               COALESCE(data->>'distrito', '') AS distrito,
               COALESCE(data->>'candidato_preferido', '') AS candidato_preferido,
               false AS is_locked`,
    [submissionId, operatorId],
  );
  return rows[0] ?? null;
}

// ── Archive contact ─────────────────────────────────────────────────

export async function archiveContact(
  submissionId: string,
  operatorId: string,
): Promise<CmsContactRow | null> {
  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions
     SET cms_status = 'archivado',
         cms_claimed_by = COALESCE(cms_claimed_by, $2),
         cms_claimed_at = COALESCE(cms_claimed_at, now())
     WHERE id = $1
     RETURNING id, campaign_id, data, client_id, created_at,
               cms_status, cms_claimed_by, cms_claimed_at, cms_hablado_at,
               cms_respondieron_at, cms_operator_notes,
               COALESCE(data->>'nombre', '') AS nombre,
               COALESCE(data->>'telefono', '') AS telefono,
               COALESCE(data->>'encuestador', '') AS encuestador,
               COALESCE(data->>'zona', data->>'distrito', '') AS zona,
               COALESCE(data->>'distrito', '') AS distrito,
               COALESCE(data->>'candidato_preferido', '') AS candidato_preferido,
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
               cms_status, cms_claimed_by, cms_claimed_at, cms_hablado_at,
               cms_respondieron_at, cms_operator_notes,
               COALESCE(data->>'nombre', '') AS nombre,
               COALESCE(data->>'telefono', '') AS telefono,
               COALESCE(data->>'encuestador', '') AS encuestador,
               COALESCE(data->>'zona', data->>'distrito', '') AS zona,
               COALESCE(data->>'distrito', '') AS distrito,
               COALESCE(data->>'candidato_preferido', '') AS candidato_preferido,
               false AS is_locked`,
    [submissionId, operatorId, JSON.stringify(notes)],
  );
  return rows[0] ?? null;
}

// ── Stats (expanded) ────────────────────────────────────────────────

export async function getCmsStats(
  campaignId: string,
  operatorId: string,
): Promise<{
  total: number;
  nuevos: number;
  hablados: number;
  hablados_mios: number;
  respondieron: number;
  archivados: number;
  claimed: number;
}> {
  const { rows } = await pool.query<{
    total: string;
    nuevos: string;
    hablados: string;
    hablados_mios: string;
    respondieron: string;
    archivados: string;
    claimed: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(data->>'telefono', '') != '')::text AS total,
       COUNT(*) FILTER (WHERE cms_status IN ('nuevo', 'claimed') AND COALESCE(data->>'telefono', '') != '')::text AS nuevos,
       COUNT(*) FILTER (WHERE cms_status = 'hablado' AND COALESCE(data->>'telefono', '') != '')::text AS hablados,
       COUNT(*) FILTER (WHERE cms_status = 'hablado' AND cms_claimed_by = $2)::text AS hablados_mios,
       COUNT(*) FILTER (WHERE cms_status = 'respondieron')::text AS respondieron,
       COUNT(*) FILTER (WHERE cms_status = 'archivado')::text AS archivados,
       COUNT(*) FILTER (WHERE cms_status = 'claimed')::text AS claimed
     FROM form_submissions
     WHERE campaign_id = $1`,
    [campaignId, operatorId],
  );
  const row = rows[0];
  return {
    total: parseInt(row?.total ?? "0", 10),
    nuevos: parseInt(row?.nuevos ?? "0", 10),
    hablados: parseInt(row?.hablados ?? "0", 10),
    hablados_mios: parseInt(row?.hablados_mios ?? "0", 10),
    respondieron: parseInt(row?.respondieron ?? "0", 10),
    archivados: parseInt(row?.archivados ?? "0", 10),
    claimed: parseInt(row?.claimed ?? "0", 10),
  };
}

// ── Metrics: per-campaign totals (multi-campaign) ───────────────────

export type CmsMetricsCampaign = {
  campaign_id: string;
  campaign_name: string;
  total: number;
  nuevos: number;
  claimed: number;
  hablados: number;
  respondieron: number;
  archivados: number;
  contact_rate: number;   // hablados+respondieron / total
  response_rate: number;  // respondieron / (hablados+respondieron)
};

export type CmsMetricsOperator = {
  user_id: string;
  email: string;
  full_name: string;
  campaign_id: string;
  campaign_name: string;
  hablados: number;
  respondieron: number;
  archivados: number;
  claimed_now: number;
};

/**
 * Get CMS metrics aggregated per campaign.
 * @param campaignIds — if null, returns ALL campaigns (admin mode). Otherwise scoped.
 */
export async function getCmsMetricsByCampaign(
  campaignIds: string[] | null,
): Promise<CmsMetricsCampaign[]> {
  const hasFilter = campaignIds !== null && campaignIds.length > 0;

  const whereClause = hasFilter
    ? `WHERE fs.campaign_id = ANY($1)`
    : `WHERE 1=1`;

  const params = hasFilter ? [campaignIds] : [];

  const { rows } = await pool.query<{
    campaign_id: string;
    campaign_name: string;
    total: string;
    nuevos: string;
    claimed: string;
    hablados: string;
    respondieron: string;
    archivados: string;
  }>(
    `SELECT
       fs.campaign_id,
       COALESCE(c.name, 'Sin nombre') AS campaign_name,
       COUNT(*) FILTER (WHERE COALESCE(fs.data->>'telefono', '') != '')::text AS total,
       COUNT(*) FILTER (WHERE fs.cms_status IN ('nuevo', 'claimed') AND COALESCE(fs.data->>'telefono', '') != '')::text AS nuevos,
       COUNT(*) FILTER (WHERE fs.cms_status = 'claimed' AND COALESCE(fs.data->>'telefono', '') != '')::text AS claimed,
       COUNT(*) FILTER (WHERE fs.cms_status = 'hablado' AND COALESCE(fs.data->>'telefono', '') != '')::text AS hablados,
       COUNT(*) FILTER (WHERE fs.cms_status = 'respondieron' AND COALESCE(fs.data->>'telefono', '') != '')::text AS respondieron,
       COUNT(*) FILTER (WHERE fs.cms_status = 'archivado' AND COALESCE(fs.data->>'telefono', '') != '')::text AS archivados
     FROM form_submissions fs
     LEFT JOIN campaigns c ON c.id = fs.campaign_id
     ${whereClause}
     GROUP BY fs.campaign_id, c.name
     ORDER BY c.name ASC`,
    params,
  );

  return rows.map((r) => {
    const total = parseInt(r.total, 10);
    const hablados = parseInt(r.hablados, 10);
    const respondieron = parseInt(r.respondieron, 10);
    const contacted = hablados + respondieron;
    return {
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      total,
      nuevos: parseInt(r.nuevos, 10),
      claimed: parseInt(r.claimed, 10),
      hablados,
      respondieron,
      archivados: parseInt(r.archivados, 10),
      contact_rate: total > 0 ? Math.round((contacted / total) * 100) / 100 : 0,
      response_rate: contacted > 0 ? Math.round((respondieron / contacted) * 100) / 100 : 0,
    };
  });
}

/**
 * Get per-operator performance breakdown.
 * @param campaignIds — if null, returns ALL campaigns (admin mode). Otherwise scoped.
 */
export async function getCmsMetricsByOperator(
  campaignIds: string[] | null,
): Promise<CmsMetricsOperator[]> {
  const hasFilter = campaignIds !== null && campaignIds.length > 0;

  const whereClause = hasFilter
    ? `WHERE fs.campaign_id = ANY($1)`
    : `WHERE 1=1`;

  const params = hasFilter ? [campaignIds] : [];

  const { rows } = await pool.query<{
    user_id: string;
    email: string;
    full_name: string;
    campaign_id: string;
    campaign_name: string;
    hablados: string;
    respondieron: string;
    archivados: string;
    claimed_now: string;
  }>(
    `SELECT
       fs.cms_claimed_by AS user_id,
       u.email,
       COALESCE(u.full_name, u.email) AS full_name,
       fs.campaign_id,
       COALESCE(c.name, 'Sin nombre') AS campaign_name,
       COUNT(*) FILTER (WHERE fs.cms_status = 'hablado')::text AS hablados,
       COUNT(*) FILTER (WHERE fs.cms_status = 'respondieron')::text AS respondieron,
       COUNT(*) FILTER (WHERE fs.cms_status = 'archivado')::text AS archivados,
       COUNT(*) FILTER (WHERE fs.cms_status = 'claimed')::text AS claimed_now
     FROM form_submissions fs
     JOIN users u ON u.id = fs.cms_claimed_by
     LEFT JOIN campaigns c ON c.id = fs.campaign_id
     ${whereClause}
       AND fs.cms_claimed_by IS NOT NULL
     GROUP BY fs.cms_claimed_by, u.email, u.full_name, fs.campaign_id, c.name
     ORDER BY (COUNT(*) FILTER (WHERE fs.cms_status IN ('hablado', 'respondieron'))) DESC`,
    params,
  );

  return rows.map((r) => ({
    user_id: r.user_id,
    email: r.email,
    full_name: r.full_name,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    hablados: parseInt(r.hablados, 10),
    respondieron: parseInt(r.respondieron, 10),
    archivados: parseInt(r.archivados, 10),
    claimed_now: parseInt(r.claimed_now, 10),
  }));
}

// ── Revert contact status (undo accidental transitions) ─────────────

/**
 * Revert a contact one step back:
 *   respondieron → hablado   (clears cms_respondieron_at)
 *   hablado      → claimed   (clears cms_hablado_at)
 * Only the operator who owns the contact (or the same campaign) can revert.
 */
export async function revertContact(
  submissionId: string,
  operatorId: string,
): Promise<CmsContactRow | null> {
  // First, check current status
  const { rows: current } = await pool.query<{ cms_status: string; cms_claimed_by: string | null }>(
    `SELECT cms_status, cms_claimed_by FROM form_submissions WHERE id = $1`,
    [submissionId],
  );
  if (!current[0]) return null;

  const status = current[0].cms_status;
  const claimedBy = current[0].cms_claimed_by;

  // Only the operator who owns it can revert (or if nobody owns it)
  if (claimedBy && claimedBy !== operatorId) return null;

  let sql: string;
  if (status === "respondieron") {
    // respondieron → hablado
    sql = `UPDATE form_submissions
           SET cms_status = 'hablado',
               cms_respondieron_at = NULL
           WHERE id = $1
           RETURNING id, campaign_id, data, client_id, created_at,
                     cms_status, cms_claimed_by, cms_claimed_at, cms_hablado_at,
                     cms_respondieron_at, cms_operator_notes,
                     COALESCE(data->>'nombre', '') AS nombre,
                     COALESCE(data->>'telefono', '') AS telefono,
                     COALESCE(data->>'encuestador', '') AS encuestador,
                     COALESCE(data->>'zona', data->>'distrito', '') AS zona,
                     COALESCE(data->>'distrito', '') AS distrito,
                     COALESCE(data->>'candidato_preferido', '') AS candidato_preferido,
                     false AS is_locked`;
  } else if (status === "hablado") {
    // hablado → claimed (keeps claimed_by/at intact)
    sql = `UPDATE form_submissions
           SET cms_status = 'claimed',
               cms_hablado_at = NULL,
               cms_respondieron_at = NULL
           WHERE id = $1
           RETURNING id, campaign_id, data, client_id, created_at,
                     cms_status, cms_claimed_by, cms_claimed_at, cms_hablado_at,
                     cms_respondieron_at, cms_operator_notes,
                     COALESCE(data->>'nombre', '') AS nombre,
                     COALESCE(data->>'telefono', '') AS telefono,
                     COALESCE(data->>'encuestador', '') AS encuestador,
                     COALESCE(data->>'zona', data->>'distrito', '') AS zona,
                     COALESCE(data->>'distrito', '') AS distrito,
                     COALESCE(data->>'candidato_preferido', '') AS candidato_preferido,
                     false AS is_locked`;
  } else {
    // Can only revert respondieron or hablado
    return null;
  }

  const { rows } = await pool.query<CmsContactRow>(sql, [submissionId]);
  return rows[0] ?? null;
}

// ── Time-based metrics for CMS performance ──────────────────────────

export type CmsTimeMetrics = {
  avg_claim_to_hablado_mins: number | null;
  avg_hablado_to_respondieron_mins: number | null;
  median_claim_to_hablado_mins: number | null;
  median_hablado_to_respondieron_mins: number | null;
  total_with_hablado: number;
  total_with_respondieron: number;
};

export async function getTimeMetrics(
  campaignIds: string[] | null,
): Promise<CmsTimeMetrics> {
  const hasFilter = campaignIds !== null && campaignIds.length > 0;
  const whereClause = hasFilter ? `WHERE campaign_id = ANY($1)` : `WHERE 1=1`;
  const params = hasFilter ? [campaignIds] : [];

  const { rows } = await pool.query<{
    avg_claim_to_hablado: string | null;
    avg_hablado_to_resp: string | null;
    med_claim_to_hablado: string | null;
    med_hablado_to_resp: string | null;
    total_hablado: string;
    total_resp: string;
  }>(
    `SELECT
       ROUND(AVG(EXTRACT(EPOCH FROM (cms_hablado_at - cms_claimed_at)) / 60)::numeric, 1)::text
         AS avg_claim_to_hablado,
       ROUND(AVG(EXTRACT(EPOCH FROM (cms_respondieron_at - cms_hablado_at)) / 60)::numeric, 1)::text
         FILTER (WHERE cms_respondieron_at IS NOT NULL)
         AS avg_hablado_to_resp,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (cms_hablado_at - cms_claimed_at)) / 60
       )::numeric, 1)::text
         AS med_claim_to_hablado,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (cms_respondieron_at - cms_hablado_at)) / 60
       )::numeric, 1)::text
         FILTER (WHERE cms_respondieron_at IS NOT NULL)
         AS med_hablado_to_resp,
       COUNT(*) FILTER (WHERE cms_hablado_at IS NOT NULL AND cms_claimed_at IS NOT NULL)::text
         AS total_hablado,
       COUNT(*) FILTER (WHERE cms_respondieron_at IS NOT NULL AND cms_hablado_at IS NOT NULL)::text
         AS total_resp
     FROM form_submissions
     ${whereClause}
       AND cms_hablado_at IS NOT NULL
       AND cms_claimed_at IS NOT NULL
       AND cms_hablado_at > cms_claimed_at`,
    params,
  );

  const r = rows[0];
  return {
    avg_claim_to_hablado_mins: r?.avg_claim_to_hablado ? parseFloat(r.avg_claim_to_hablado) : null,
    avg_hablado_to_respondieron_mins: r?.avg_hablado_to_resp ? parseFloat(r.avg_hablado_to_resp) : null,
    median_claim_to_hablado_mins: r?.med_claim_to_hablado ? parseFloat(r.med_claim_to_hablado) : null,
    median_hablado_to_respondieron_mins: r?.med_hablado_to_resp ? parseFloat(r.med_hablado_to_resp) : null,
    total_with_hablado: parseInt(r?.total_hablado ?? "0", 10),
    total_with_respondieron: parseInt(r?.total_resp ?? "0", 10),
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
