import { pool } from "../../db";

export type CmsContactRow = {
  id: string;
  campaign_id: string;
  data: Record<string, unknown>;
  client_id: string;
  created_at: Date;
  cms_status: "nuevo" | "hablado" | "respondieron" | "archivado";
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
  // Operator attribution
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
  status: string,
  limit = 100,
  offset = 0,
  search = "",
): Promise<{ contacts: CmsContactRow[]; total: number }> {
  // Build WHERE clause based on status filter
  let statusClause: string;

  switch (status) {
    case "nuevo":
      statusClause = "fs.cms_status = 'nuevo'";
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
      statusClause = "fs.cms_status = 'nuevo'";
  }

  // $1=campaignId, then search, limit, offset
  const dataParams: unknown[] = [campaignId];
  let dataParamIdx = 2;

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
  limit = 100,
  offset = 0,
): Promise<{ contacts: CmsContactRow[]; total: number }> {
  return listContacts(campaignId, "nuevo", limit, offset);
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

/** @deprecated No longer used by the frontend — kept for backwards compat */
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
               COALESCE(data->>'candidato_preferido', '') AS candidato_preferido`,
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
    `UPDATE form_submissions fs
     SET cms_status = 'hablado',
         cms_claimed_by = $2,
         cms_claimed_at = COALESCE(cms_claimed_at, now()),
         cms_hablado_at = now(),
         cms_respondieron_at = NULL
     WHERE fs.id = $1
       AND fs.cms_status IN ('nuevo', 'claimed', 'hablado')
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes,
               COALESCE(fs.data->>'nombre', '') AS nombre,
               COALESCE(fs.data->>'telefono', '') AS telefono,
               COALESCE(fs.data->>'encuestador', '') AS encuestador,
               COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
               COALESCE(fs.data->>'distrito', '') AS distrito,
               COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`,
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
    `UPDATE form_submissions fs
     SET cms_status = 'respondieron',
         cms_claimed_by = COALESCE(fs.cms_claimed_by, $2),
         cms_claimed_at = COALESCE(fs.cms_claimed_at, now()),
         cms_hablado_at = COALESCE(fs.cms_hablado_at, now()),
         cms_respondieron_at = now()
     WHERE fs.id = $1
       AND fs.cms_status IN ('hablado', 'respondieron')
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes,
               COALESCE(fs.data->>'nombre', '') AS nombre,
               COALESCE(fs.data->>'telefono', '') AS telefono,
               COALESCE(fs.data->>'encuestador', '') AS encuestador,
               COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
               COALESCE(fs.data->>'distrito', '') AS distrito,
               COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`,
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
    `UPDATE form_submissions fs
     SET cms_status = 'archivado',
         cms_claimed_by = COALESCE(fs.cms_claimed_by, $2),
         cms_claimed_at = COALESCE(fs.cms_claimed_at, now())
     WHERE fs.id = $1
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes,
               COALESCE(fs.data->>'nombre', '') AS nombre,
               COALESCE(fs.data->>'telefono', '') AS telefono,
               COALESCE(fs.data->>'encuestador', '') AS encuestador,
               COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
               COALESCE(fs.data->>'distrito', '') AS distrito,
               COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`,
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
  // Any operator can edit notes — cms_claimed_by tracks last operator who acted
  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions fs
     SET cms_operator_notes = $3::jsonb,
         cms_claimed_by = COALESCE(fs.cms_claimed_by, $2)
     WHERE fs.id = $1
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes,
               COALESCE(fs.data->>'nombre', '') AS nombre,
               COALESCE(fs.data->>'telefono', '') AS telefono,
               COALESCE(fs.data->>'encuestador', '') AS encuestador,
               COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
               COALESCE(fs.data->>'distrito', '') AS distrito,
               COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`,
    [submissionId, operatorId, JSON.stringify(notes)],
  );
  return rows[0] ?? null;
}

// ── Stats (expanded) ────────────────────────────────────────────────

export async function getCmsStats(
  campaignId: string,
): Promise<{
  total: number;
  nuevos: number;
  hablados: number;
  respondieron: number;
  archivados: number;
}> {
  const { rows } = await pool.query<{
    total: string;
    nuevos: string;
    hablados: string;
    respondieron: string;
    archivados: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(data->>'telefono', '') != '')::text AS total,
       COUNT(*) FILTER (WHERE cms_status = 'nuevo' AND COALESCE(data->>'telefono', '') != '')::text AS nuevos,
       COUNT(*) FILTER (WHERE cms_status = 'hablado' AND COALESCE(data->>'telefono', '') != '')::text AS hablados,
       COUNT(*) FILTER (WHERE cms_status = 'respondieron')::text AS respondieron,
       COUNT(*) FILTER (WHERE cms_status = 'archivado')::text AS archivados
     FROM form_submissions
     WHERE campaign_id = $1`,
    [campaignId],
  );
  const row = rows[0];
  return {
    total: parseInt(row?.total ?? "0", 10),
    nuevos: parseInt(row?.nuevos ?? "0", 10),
    hablados: parseInt(row?.hablados ?? "0", 10),
    respondieron: parseInt(row?.respondieron ?? "0", 10),
    archivados: parseInt(row?.archivados ?? "0", 10),
  };
}

// ── Metrics: per-campaign totals (multi-campaign) ───────────────────

export type CmsMetricsCampaign = {
  campaign_id: string;
  campaign_name: string;
  total: number;
  nuevos: number;
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
    hablados: string;
    respondieron: string;
    archivados: string;
  }>(
    `SELECT
       fs.campaign_id,
       COALESCE(c.name, 'Sin nombre') AS campaign_name,
       COUNT(*) FILTER (WHERE COALESCE(fs.data->>'telefono', '') != '')::text AS total,
       COUNT(*) FILTER (WHERE fs.cms_status = 'nuevo' AND COALESCE(fs.data->>'telefono', '') != '')::text AS nuevos,
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
  }>(
    `SELECT
       fs.cms_claimed_by AS user_id,
       u.email,
       COALESCE(u.full_name, u.email) AS full_name,
       fs.campaign_id,
       COALESCE(c.name, 'Sin nombre') AS campaign_name,
       COUNT(*) FILTER (WHERE fs.cms_status = 'hablado')::text AS hablados,
       COUNT(*) FILTER (WHERE fs.cms_status = 'respondieron')::text AS respondieron,
       COUNT(*) FILTER (WHERE fs.cms_status = 'archivado')::text AS archivados
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
  }));
}

// ── Revert contact status (undo accidental transitions) ─────────────

/**
 * Revert a contact one step back:
 *   respondieron → hablado   (clears cms_respondieron_at)
 *   hablado      → nuevo     (clears cms_hablado_at, cms_claimed_by, cms_claimed_at)
 *   archivado    → nuevo     (clears all CMS fields, full restore)
 */
export async function revertContact(
  submissionId: string,
  _operatorId: string,
): Promise<CmsContactRow | null> {
  const { rows: current } = await pool.query<{ cms_status: string }>(
    `SELECT cms_status FROM form_submissions WHERE id = $1`,
    [submissionId],
  );
  if (!current[0]) return null;

  const status = current[0].cms_status;

  let sql: string;
  if (status === "respondieron") {
    sql = `UPDATE form_submissions fs
           SET cms_status = 'hablado',
               cms_respondieron_at = NULL
           WHERE fs.id = $1
           RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
                     fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
                     fs.cms_respondieron_at, fs.cms_operator_notes,
                     COALESCE(fs.data->>'nombre', '') AS nombre,
                     COALESCE(fs.data->>'telefono', '') AS telefono,
                     COALESCE(fs.data->>'encuestador', '') AS encuestador,
                     COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
                     COALESCE(fs.data->>'distrito', '') AS distrito,
                     COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`;
  } else if (status === "hablado") {
    sql = `UPDATE form_submissions fs
           SET cms_status = 'nuevo',
               cms_hablado_at = NULL,
               cms_respondieron_at = NULL,
               cms_claimed_by = NULL,
               cms_claimed_at = NULL
           WHERE fs.id = $1
           RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
                     fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
                     fs.cms_respondieron_at, fs.cms_operator_notes,
                     COALESCE(fs.data->>'nombre', '') AS nombre,
                     COALESCE(fs.data->>'telefono', '') AS telefono,
                     COALESCE(fs.data->>'encuestador', '') AS encuestador,
                     COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
                     COALESCE(fs.data->>'distrito', '') AS distrito,
                     COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`;
  } else if (status === "archivado") {
    sql = `UPDATE form_submissions fs
           SET cms_status = 'nuevo',
               cms_hablado_at = NULL,
               cms_respondieron_at = NULL,
               cms_claimed_by = NULL,
               cms_claimed_at = NULL
           WHERE fs.id = $1
           RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
                     fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
                     fs.cms_respondieron_at, fs.cms_operator_notes,
                     COALESCE(fs.data->>'nombre', '') AS nombre,
                     COALESCE(fs.data->>'telefono', '') AS telefono,
                     COALESCE(fs.data->>'encuestador', '') AS encuestador,
                     COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
                     COALESCE(fs.data->>'distrito', '') AS distrito,
                     COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`;
  } else {
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
  const campaignFilter = hasFilter ? `AND campaign_id = ANY($1)` : "";
  const params = hasFilter ? [campaignIds] : [];

  // Two separate queries:
  //   1. claim→hablado metrics (rows where both timestamps exist and are ordered)
  //   2. hablado→respondieron metrics (rows where all three timestamps exist)
  // PERCENTILE_CONT does not support FILTER clause in PostgreSQL < 16,
  // so we pre-filter via WHERE in subqueries instead.

  const { rows } = await pool.query<{
    avg_claim_to_hablado: string | null;
    avg_hablado_to_resp: string | null;
    med_claim_to_hablado: string | null;
    med_hablado_to_resp: string | null;
    total_hablado: string;
    total_resp: string;
  }>(
    `SELECT
       -- avg claim→hablado (minutes)
       (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (cms_hablado_at - cms_claimed_at)) / 60)::numeric, 1)::text
        FROM form_submissions
        WHERE cms_hablado_at IS NOT NULL
          AND cms_claimed_at IS NOT NULL
          AND cms_hablado_at > cms_claimed_at
          ${campaignFilter}
       ) AS avg_claim_to_hablado,

       -- avg hablado→respondieron (minutes)
       (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (cms_respondieron_at - cms_hablado_at)) / 60)::numeric, 1)::text
        FROM form_submissions
        WHERE cms_respondieron_at IS NOT NULL
          AND cms_hablado_at IS NOT NULL
          AND cms_respondieron_at > cms_hablado_at
          ${campaignFilter}
       ) AS avg_hablado_to_resp,

       -- median claim→hablado (PERCENTILE_CONT, pre-filtered subquery)
       (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (cms_hablado_at - cms_claimed_at)) / 60
        )::numeric, 1)::text
        FROM form_submissions
        WHERE cms_hablado_at IS NOT NULL
          AND cms_claimed_at IS NOT NULL
          AND cms_hablado_at > cms_claimed_at
          ${campaignFilter}
       ) AS med_claim_to_hablado,

       -- median hablado→respondieron (pre-filtered subquery)
       (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (cms_respondieron_at - cms_hablado_at)) / 60
        )::numeric, 1)::text
        FROM form_submissions
        WHERE cms_respondieron_at IS NOT NULL
          AND cms_hablado_at IS NOT NULL
          AND cms_respondieron_at > cms_hablado_at
          ${campaignFilter}
       ) AS med_hablado_to_resp,

       -- counts
       (SELECT COUNT(*)::text
        FROM form_submissions
        WHERE cms_hablado_at IS NOT NULL
          AND cms_claimed_at IS NOT NULL
          ${campaignFilter}
       ) AS total_hablado,

       (SELECT COUNT(*)::text
        FROM form_submissions
        WHERE cms_respondieron_at IS NOT NULL
          AND cms_hablado_at IS NOT NULL
          ${campaignFilter}
       ) AS total_resp`,
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
