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
  cms_tags: string[];
  // Phase 2: explicit attribution columns (migration 032)
  cms_wa_number: string | null;
  cms_operator_id: string | null;
  // Phase 2: contact origin (migration 031)
  contact_source: "territorio" | "meta" | "manual";
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
  fs.cms_respondieron_at, fs.cms_operator_notes, fs.cms_tags,
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
  tag = "",
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

  let dataTagClause = "";
  let countTagClause = "";
  if (tag.trim()) {
    dataTagClause = ` AND $${dataParamIdx} = ANY(fs.cms_tags)`;
    dataParams.push(tag.trim());
    dataParamIdx++;

    countTagClause = ` AND $${countParamIdx} = ANY(fs.cms_tags)`;
    countParams.push(tag.trim());
    countParamIdx++;
  }

  dataParams.push(limit, offset);

  // Keep pagination stable by always sorting from most recent interaction.
  const orderClause = `
    GREATEST(
      COALESCE(fs.cms_respondieron_at, to_timestamp(0)),
      COALESCE(fs.cms_hablado_at, to_timestamp(0)),
      COALESCE(fs.cms_claimed_at, to_timestamp(0)),
      fs.created_at
    ) DESC,
    fs.created_at DESC
  `;

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
         AND fs.deleted_at IS NULL
         AND ${statusClause}
         AND COALESCE(fs.data->>'telefono', '') != ''
         ${dataSearchClause}
         ${dataTagClause}
       ORDER BY ${orderClause}
       LIMIT $${dataParamIdx} OFFSET $${dataParamIdx + 1}`,
      dataParams,
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM form_submissions fs
       WHERE fs.campaign_id = $1
         AND fs.deleted_at IS NULL
         AND ${statusClause}
         AND COALESCE(fs.data->>'telefono', '') != ''
         ${countSearchClause}
         ${countTagClause}`,
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
         u.email AS claimed_by_email,
         su.email AS submitted_by_email
       FROM form_submissions fs
       LEFT JOIN users u ON u.id = fs.cms_claimed_by
       LEFT JOIN users su ON su.id = fs.submitted_by
       WHERE fs.campaign_id = $1
         AND fs.deleted_at IS NULL
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
         AND deleted_at IS NULL
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
       AND deleted_at IS NULL
       AND cms_status = 'nuevo'
     RETURNING id, campaign_id, data, client_id, created_at,
               cms_status, cms_claimed_by, cms_claimed_at, cms_hablado_at,
               cms_respondieron_at, cms_operator_notes, cms_tags,
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
       AND deleted_at IS NULL
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
  waNumber: string | null = null,
): Promise<CmsContactRow | null> {
  // Merge wa_number into cms_operator_notes without overwriting existing fields.
  // Also write to dedicated cms_wa_number and cms_operator_id columns (migration 032).
  const waNumberPatch = waNumber
    ? `jsonb_set(COALESCE(fs.cms_operator_notes, '{}'::jsonb), '{wa_number}', $3::jsonb)`
    : `COALESCE(fs.cms_operator_notes, '{}'::jsonb)`;

  const params = waNumber ? [submissionId, operatorId, JSON.stringify(waNumber)] : [submissionId, operatorId];

  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions fs
     SET cms_status = 'hablado',
         cms_claimed_by = $2,
         cms_claimed_at = COALESCE(cms_claimed_at, now()),
         cms_hablado_at = now(),
         cms_respondieron_at = NULL,
         cms_operator_notes = ${waNumberPatch},
         cms_operator_id = $2::uuid,
         cms_wa_number = ${waNumber ? "$3::text" : "cms_wa_number"}
     WHERE fs.id = $1
       AND fs.deleted_at IS NULL
       AND fs.cms_status IN ('nuevo', 'claimed', 'hablado')
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes, fs.cms_tags,
               COALESCE(fs.data->>'nombre', '') AS nombre,
               COALESCE(fs.data->>'telefono', '') AS telefono,
               COALESCE(fs.data->>'encuestador', '') AS encuestador,
               COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
               COALESCE(fs.data->>'distrito', '') AS distrito,
               COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`,
    params,
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
         cms_respondieron_at = now(),
         cms_operator_id = COALESCE(fs.cms_operator_id, $2::uuid)
     WHERE fs.id = $1
       AND fs.deleted_at IS NULL
       AND fs.cms_status IN ('hablado', 'respondieron')
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes, fs.cms_tags,
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

export type CmsContactRowWithPrev = CmsContactRow & { previous_status: string };

/**
 * Archive a contact atomically — captures previous_status in a single CTE
 * to avoid TOCTOU race conditions between SELECT and UPDATE.
 * Guards against archiving an already-archived contact.
 */
export async function archiveContact(
  submissionId: string,
  operatorId: string,
): Promise<CmsContactRowWithPrev | null> {
  const { rows } = await pool.query<CmsContactRowWithPrev>(
    `WITH prev AS (
       SELECT id, cms_status AS previous_status
       FROM form_submissions
       WHERE id = $1 AND deleted_at IS NULL AND cms_status != 'archivado'
     )
     UPDATE form_submissions fs
     SET cms_status = 'archivado',
         cms_claimed_by = COALESCE(fs.cms_claimed_by, $2),
         cms_claimed_at = COALESCE(fs.cms_claimed_at, now())
     FROM prev
     WHERE fs.id = prev.id
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes, fs.cms_tags,
               COALESCE(fs.data->>'nombre', '') AS nombre,
               COALESCE(fs.data->>'telefono', '') AS telefono,
               COALESCE(fs.data->>'encuestador', '') AS encuestador,
               COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
               COALESCE(fs.data->>'distrito', '') AS distrito,
               COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido,
               prev.previous_status`,
    [submissionId, operatorId],
  );
  return rows[0] ?? null;
}

// ── Update operator notes ───────────────────────────────────────────

export async function updateNotes(
  submissionId: string,
  operatorId: string,
  notes: {
    local_votacion: string;
    domicilio: string;
    comentarios: string;
    signal_flags?: {
      responde?: boolean;
      hace_pregunta?: boolean;
      pide_informacion?: boolean;
      comparte_ubicacion?: boolean;
      deja_en_visto?: boolean;
      bloquea?: boolean;
    };
    signal_score?: number;
    vote_tier?: "contacto_basura" | "voto_blando" | "voto_duro";
  },
): Promise<CmsContactRow | null> {
  // Any operator can edit notes — cms_claimed_by tracks last operator who acted
  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions fs
     SET cms_operator_notes = $3::jsonb,
         cms_claimed_by = COALESCE(fs.cms_claimed_by, $2)
     WHERE fs.id = $1
       AND fs.deleted_at IS NULL
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes, fs.cms_tags,
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
     WHERE campaign_id = $1
       AND deleted_at IS NULL`,
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
    ? `WHERE fs.campaign_id = ANY($1) AND fs.deleted_at IS NULL`
    : `WHERE fs.deleted_at IS NULL`;

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
    ? `WHERE fs.campaign_id = ANY($1) AND fs.deleted_at IS NULL`
    : `WHERE fs.deleted_at IS NULL`;

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

// ── Metrics: per-brigadista (field agent) captures + CMS pipeline ────

export type CmsBrigadistaMetrics = {
  brigadista_id: string;
  full_name: string;
  email: string;
  /** Total unique phone numbers captured (first-write-wins dedup) */
  total_captures: number;
  /** Unique phones still in 'nuevo' status */
  nuevos: number;
  /** Unique phones in 'hablado' status */
  hablados: number;
  /** Unique phones in 'respondieron' status */
  respondieron: number;
  /** Unique phones in 'archivado' status */
  archivados: number;
  /** (hablados + respondieron) / total — how much of their data got contacted */
  contact_rate: number;
  /** respondieron / (hablados + respondieron) — how much responded */
  response_rate: number;
};

/**
 * Get CMS metrics grouped by brigadista (field agent who captured the data).
 *
 * Dedup strategy: query-time DISTINCT ON (data->>'telefono') with first-write-wins
 * (ORDER BY created_at ASC). This means if the same phone was captured by
 * two different brigadistas, only the first capture counts.
 *
 * @param campaignId — single campaign scope (required for tierra page)
 * @param from - Optional ISO date string (inclusive lower bound on created_at)
 * @param to   - Optional ISO date string (exclusive upper bound on created_at)
 */
export async function getMetricsByBrigadista(
  campaignId: string,
  from?: string,
  to?: string,
): Promise<CmsBrigadistaMetrics[]> {
  const params: string[] = [campaignId];
  let paramIdx = 2;
  let dateFilter = "";

  if (from) {
    dateFilter += ` AND created_at >= $${paramIdx}`;
    params.push(from);
    paramIdx++;
  }
  if (to) {
    dateFilter += ` AND created_at < $${paramIdx}`;
    params.push(to);
    paramIdx++;
  }

  const { rows } = await pool.query<{
    brigadista_id: string;
    full_name: string;
    email: string;
    total_captures: string;
    nuevos: string;
    hablados: string;
    respondieron: string;
    archivados: string;
  }>(
    `WITH unique_captures AS (
       -- Dedup by phone: keep the first submission per phone number (first-write-wins)
       SELECT DISTINCT ON (data->>'telefono')
         id, submitted_by, cms_status, created_at
       FROM form_submissions
       WHERE campaign_id = $1
         AND COALESCE(data->>'telefono', '') != ''
         AND deleted_at IS NULL${dateFilter}
       ORDER BY data->>'telefono', created_at ASC
     )
     SELECT
       uc.submitted_by AS brigadista_id,
       COALESCE(u.full_name, u.email) AS full_name,
       u.email,
       COUNT(*)::text AS total_captures,
       COUNT(*) FILTER (WHERE uc.cms_status = 'nuevo')::text AS nuevos,
       COUNT(*) FILTER (WHERE uc.cms_status = 'hablado')::text AS hablados,
       COUNT(*) FILTER (WHERE uc.cms_status = 'respondieron')::text AS respondieron,
       COUNT(*) FILTER (WHERE uc.cms_status = 'archivado')::text AS archivados
     FROM unique_captures uc
     JOIN users u ON u.id = uc.submitted_by
     GROUP BY uc.submitted_by, u.full_name, u.email
     ORDER BY COUNT(*) DESC`,
    params,
  );

  return rows.map((r) => {
    const total = parseInt(r.total_captures, 10);
    const hablados = parseInt(r.hablados, 10);
    const respondieron = parseInt(r.respondieron, 10);
    const contacted = hablados + respondieron;
    return {
      brigadista_id: r.brigadista_id,
      full_name: r.full_name,
      email: r.email,
      total_captures: total,
      nuevos: parseInt(r.nuevos, 10),
      hablados,
      respondieron,
      archivados: parseInt(r.archivados, 10),
      contact_rate: total > 0 ? Math.round((contacted / total) * 100) / 100 : 0,
      response_rate: contacted > 0 ? Math.round((respondieron / contacted) * 100) / 100 : 0,
    };
  });
}

// ── Revert contact status (undo accidental transitions) ─────────────

const REVERT_RETURNING = `
  RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
            fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
            fs.cms_respondieron_at, fs.cms_operator_notes, fs.cms_tags,
            COALESCE(fs.data->>'nombre', '') AS nombre,
            COALESCE(fs.data->>'telefono', '') AS telefono,
            COALESCE(fs.data->>'encuestador', '') AS encuestador,
            COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
            COALESCE(fs.data->>'distrito', '') AS distrito,
            COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido,
            prev.previous_status`;

/**
 * Revert a contact one step back atomically using a CTE
 * to capture and guard on the current status in a single query:
 *   respondieron → hablado   (clears cms_respondieron_at)
 *   hablado      → nuevo     (clears cms_hablado_at, cms_claimed_by, cms_claimed_at)
 *   archivado    → nuevo     (clears all CMS fields, full restore)
 */
export async function revertContact(
  submissionId: string,
  _operatorId: string,
): Promise<CmsContactRowWithPrev | null> {
  // Try respondieron → hablado
  const { rows: r1 } = await pool.query<CmsContactRowWithPrev>(
    `WITH prev AS (
       SELECT id, cms_status AS previous_status
       FROM form_submissions
       WHERE id = $1 AND deleted_at IS NULL AND cms_status = 'respondieron'
     )
     UPDATE form_submissions fs
     SET cms_status = 'hablado',
         cms_respondieron_at = NULL
     FROM prev
     WHERE fs.id = prev.id
     ${REVERT_RETURNING}`,
    [submissionId],
  );
  if (r1[0]) return r1[0];

  // Try hablado → nuevo
  const { rows: r2 } = await pool.query<CmsContactRowWithPrev>(
    `WITH prev AS (
       SELECT id, cms_status AS previous_status
       FROM form_submissions
       WHERE id = $1 AND deleted_at IS NULL AND cms_status = 'hablado'
     )
     UPDATE form_submissions fs
     SET cms_status = 'nuevo',
         cms_hablado_at = NULL,
         cms_respondieron_at = NULL,
         cms_claimed_by = NULL,
         cms_claimed_at = NULL
     FROM prev
     WHERE fs.id = prev.id
     ${REVERT_RETURNING}`,
    [submissionId],
  );
  if (r2[0]) return r2[0];

  // Try archivado → nuevo
  const { rows: r3 } = await pool.query<CmsContactRowWithPrev>(
    `WITH prev AS (
       SELECT id, cms_status AS previous_status
       FROM form_submissions
       WHERE id = $1 AND deleted_at IS NULL AND cms_status = 'archivado'
     )
     UPDATE form_submissions fs
     SET cms_status = 'nuevo',
         cms_hablado_at = NULL,
         cms_respondieron_at = NULL,
         cms_claimed_by = NULL,
         cms_claimed_at = NULL
     FROM prev
     WHERE fs.id = prev.id
     ${REVERT_RETURNING}`,
    [submissionId],
  );
  if (r3[0]) return r3[0];

  // Cannot revert from 'nuevo' or unknown
  return null;
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
  const campaignFilter = hasFilter ? `AND deleted_at IS NULL AND campaign_id = ANY($1)` : `AND deleted_at IS NULL`;
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

// ── Tags ────────────────────────────────────────────────────────────

/**
 * Set the full tag array for a contact (replaces existing tags).
 */
export async function setContactTags(
  submissionId: string,
  tags: string[],
): Promise<CmsContactRow | null> {
  const { rows } = await pool.query<CmsContactRow>(
    `UPDATE form_submissions fs
     SET cms_tags = $2
     WHERE fs.id = $1
       AND fs.deleted_at IS NULL
     RETURNING fs.id, fs.campaign_id, fs.data, fs.client_id, fs.created_at,
               fs.cms_status, fs.cms_claimed_by, fs.cms_claimed_at, fs.cms_hablado_at,
               fs.cms_respondieron_at, fs.cms_operator_notes, fs.cms_tags,
               COALESCE(fs.data->>'nombre', '') AS nombre,
               COALESCE(fs.data->>'telefono', '') AS telefono,
               COALESCE(fs.data->>'encuestador', '') AS encuestador,
               COALESCE(fs.data->>'zona', fs.data->>'distrito', '') AS zona,
               COALESCE(fs.data->>'distrito', '') AS distrito,
               COALESCE(fs.data->>'candidato_preferido', '') AS candidato_preferido`,
    [submissionId, tags],
  );
  return rows[0] ?? null;
}

/**
 * Get all distinct tags used across contacts in a campaign.
 */
export async function getCampaignTags(
  campaignId: string,
): Promise<string[]> {
  const { rows } = await pool.query<{ tag: string }>(
    `SELECT DISTINCT unnest(cms_tags) AS tag
     FROM form_submissions
     WHERE campaign_id = $1
       AND deleted_at IS NULL
       AND array_length(cms_tags, 1) > 0
     ORDER BY tag`,
    [campaignId],
  );
  return rows.map((r) => r.tag);
}

/**
 * Get tags for multiple contacts at once.
 */
export async function getContactTagsBulk(
  contactIds: string[],
): Promise<Record<string, string[]>> {
  if (contactIds.length === 0) return {};
  const { rows } = await pool.query<{ id: string; cms_tags: string[] }>(
    `SELECT id, cms_tags FROM form_submissions WHERE id = ANY($1) AND deleted_at IS NULL`,
    [contactIds],
  );
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    result[row.id] = row.cms_tags ?? [];
  }
  return result;
}

// ── Find contact by phone within a campaign ─────────────────────────

/**
 * Find a CMS contact by phone number in a campaign.
 * Matches last 9 digits to handle +51/51 prefix variations.
 */
export async function findContactByPhone(
  campaignId: string,
  phone: string,
): Promise<CmsContactRow | null> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;

  // Try exact match first, then last-9-digit suffix match
  const last9 = digits.slice(-9);
  const { rows } = await pool.query<CmsContactRow>(
    `SELECT ${CMS_SELECT}
     FROM form_submissions fs
     WHERE fs.campaign_id = $1
       AND fs.deleted_at IS NULL
       AND (
         COALESCE(fs.data->>'telefono', '') = $2
         OR RIGHT(COALESCE(fs.data->>'telefono', ''), 9) = $3
       )
     ORDER BY fs.created_at DESC
     LIMIT 1`,
    [campaignId, digits, last9],
  );
  return rows[0] ?? null;
}

// ── Metrics: per-WA-phone (extension celular) ───────────────────────

export type CmsWaPhoneMetrics = {
  wa_number: string;       // número del celular que usó la extensión (sin +)
  hablados: number;        // contactos marcados como hablado desde este número
  respondieron: number;    // contactos en respondieron atribuidos a este número
  archivados: number;      // archivados
  total_interactions: number; // total de eventos de extensión registrados
};

/**
 * Get CMS metrics grouped by WhatsApp phone number used in the extension.
 *
 * The extension sends `x-wa-number` (the operator's own WA number) when marking
 * contacts as hablado. This is stored in `cms_operator_notes->>'wa_number'`.
 * We aggregate pipeline progression per source phone.
 *
 * @param campaignId — single campaign scope
 */
export async function getMetricsByWaNumber(
  campaignId: string,
): Promise<CmsWaPhoneMetrics[]> {
  const { rows } = await pool.query<{
    wa_number: string;
    hablados: string;
    respondieron: string;
    archivados: string;
    total_interactions: string;
  }>(
    `SELECT
       COALESCE(fs.cms_operator_notes->>'wa_number', 'desconocido') AS wa_number,
       COUNT(*) FILTER (WHERE fs.cms_status = 'hablado')::text AS hablados,
       COUNT(*) FILTER (WHERE fs.cms_status = 'respondieron')::text AS respondieron,
       COUNT(*) FILTER (WHERE fs.cms_status = 'archivado')::text AS archivados,
       COUNT(*)::text AS total_interactions
     FROM form_submissions fs
     WHERE fs.campaign_id = $1
       AND fs.deleted_at IS NULL
       AND fs.cms_operator_notes->>'wa_number' IS NOT NULL
       AND fs.cms_status IN ('hablado', 'respondieron', 'archivado')
     GROUP BY fs.cms_operator_notes->>'wa_number'
     ORDER BY COUNT(*) DESC`,
    [campaignId],
  );

  return rows.map((r) => ({
    wa_number: r.wa_number,
    hablados: parseInt(r.hablados, 10),
    respondieron: parseInt(r.respondieron, 10),
    archivados: parseInt(r.archivados, 10),
    total_interactions: parseInt(r.total_interactions, 10),
  }));
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
       AND fs.deleted_at IS NULL
       AND fs.cms_status = 'claimed'`,
    [campaignId],
  );
  return rows;
}

// ── Device session tracking (migration 032) ──────────────────────────

export type CmsDeviceSession = {
  id: string;
  campaign_id: string;
  wa_number: string;
  operator_id: string;
  operator_email: string;
  operator_name: string;
  started_at: Date;
  last_heartbeat: Date;
  ended_at: Date | null;
};

/**
 * Upsert a device session: if there's an active session for this operator+wa_number
 * (ended_at IS NULL, last_heartbeat within 10 min), update last_heartbeat.
 * Otherwise, close any dangling active session for this wa_number (different operator)
 * and create a new session.
 *
 * Returns the session id and whether it was newly created.
 */
export async function upsertDeviceSession(
  campaignId: string,
  waNumber: string,
  operatorId: string,
): Promise<{ session_id: string; is_new: boolean }> {
  // Try to renew existing active session for this exact operator+number (heartbeat window: 10 min)
  const { rows: existing } = await pool.query<{ id: string }>(
    `UPDATE cms_device_sessions
     SET last_heartbeat = now()
     WHERE campaign_id = $1
       AND wa_number = $2
       AND operator_id = $3
       AND ended_at IS NULL
       AND last_heartbeat > now() - INTERVAL '10 minutes'
     RETURNING id`,
    [campaignId, waNumber, operatorId],
  );

  if (existing[0]) {
    return { session_id: existing[0].id, is_new: false };
  }

  // Close any dangling active sessions for this wa_number (different operator or stale)
  await pool.query(
    `UPDATE cms_device_sessions
     SET ended_at = now()
     WHERE campaign_id = $1
       AND wa_number = $2
       AND ended_at IS NULL`,
    [campaignId, waNumber],
  );

  // Create new session
  const { rows: created } = await pool.query<{ id: string }>(
    `INSERT INTO cms_device_sessions (campaign_id, wa_number, operator_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [campaignId, waNumber, operatorId],
  );

  return { session_id: created[0]!.id, is_new: true };
}

// ── Metrics: by contact source (territorio vs meta vs manual) ────────

export type CmsSourceMetrics = {
  source: "territorio" | "meta" | "manual";
  total: number;
  nuevos: number;
  hablados: number;
  respondieron: number;
  archivados: number;
  contact_rate: number;
  response_rate: number;
};

/**
 * Get CMS pipeline metrics grouped by contact_source for a campaign.
 * Enables comparing Meta lead performance vs territory-captured contacts.
 */
export async function getMetricsBySource(
  campaignId: string,
): Promise<CmsSourceMetrics[]> {
  const { rows } = await pool.query<{
    source: string;
    total: string;
    nuevos: string;
    hablados: string;
    respondieron: string;
    archivados: string;
  }>(
    `SELECT
       COALESCE(contact_source, 'territorio') AS source,
       COUNT(*) FILTER (WHERE COALESCE(data->>'telefono', '') != '')::text AS total,
       COUNT(*) FILTER (WHERE cms_status = 'nuevo' AND COALESCE(data->>'telefono', '') != '')::text AS nuevos,
       COUNT(*) FILTER (WHERE cms_status = 'hablado')::text AS hablados,
       COUNT(*) FILTER (WHERE cms_status = 'respondieron')::text AS respondieron,
       COUNT(*) FILTER (WHERE cms_status = 'archivado')::text AS archivados
     FROM form_submissions
     WHERE campaign_id = $1
       AND deleted_at IS NULL
     GROUP BY COALESCE(contact_source, 'territorio')
     ORDER BY COUNT(*) DESC`,
    [campaignId],
  );

  return rows.map((r) => {
    const total = parseInt(r.total, 10);
    const hablados = parseInt(r.hablados, 10);
    const respondieron = parseInt(r.respondieron, 10);
    const contacted = hablados + respondieron;
    return {
      source: r.source as CmsSourceMetrics["source"],
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

// ── Metrics: by device (WA phone hardware) ───────────────────────────

export type CmsDeviceMetrics = {
  wa_number: string;
  /** Human-readable label, e.g. "Celular 1" — derived from position in sorted list */
  label: string;
  hablados: number;
  respondieron: number;
  archivados: number;
  /** Active session info (operator currently using this device) */
  active_operator_id: string | null;
  active_operator_email: string | null;
  active_since: Date | null;
  /** Total unique operators who used this device (session history) */
  total_operators: number;
};

/**
 * Get per-device (WhatsApp phone hardware) metrics.
 *
 * Uses cms_wa_number column (migration 032) as primary source.
 * Falls back to cms_operator_notes->>'wa_number' for contacts recorded
 * before the migration (backwards compat).
 *
 * Joins against cms_device_sessions to enrich with active operator info.
 */
export async function getMetricsByDevice(
  campaignId: string,
): Promise<CmsDeviceMetrics[]> {
  const { rows } = await pool.query<{
    wa_number: string;
    hablados: string;
    respondieron: string;
    archivados: string;
    active_operator_id: string | null;
    active_operator_email: string | null;
    active_since: Date | null;
    total_operators: string;
  }>(
    `WITH device_stats AS (
       SELECT
         -- Prefer explicit column, fall back to JSONB for historical data
         COALESCE(cms_wa_number, cms_operator_notes->>'wa_number') AS wa_number,
         COUNT(*) FILTER (WHERE cms_status = 'hablado')       AS hablados,
         COUNT(*) FILTER (WHERE cms_status = 'respondieron')  AS respondieron,
         COUNT(*) FILTER (WHERE cms_status = 'archivado')     AS archivados
       FROM form_submissions
       WHERE campaign_id = $1
         AND deleted_at IS NULL
         AND COALESCE(cms_wa_number, cms_operator_notes->>'wa_number') IS NOT NULL
         AND cms_status IN ('hablado', 'respondieron', 'archivado')
       GROUP BY COALESCE(cms_wa_number, cms_operator_notes->>'wa_number')
     ),
     active_sessions AS (
       SELECT DISTINCT ON (s.wa_number)
         s.wa_number,
         s.operator_id   AS active_operator_id,
         u.email         AS active_operator_email,
         s.started_at    AS active_since
       FROM cms_device_sessions s
       JOIN users u ON u.id = s.operator_id
       WHERE s.campaign_id = $1
         AND s.ended_at IS NULL
         AND s.last_heartbeat > now() - INTERVAL '10 minutes'
       ORDER BY s.wa_number, s.last_heartbeat DESC
     ),
     operator_counts AS (
       SELECT wa_number, COUNT(DISTINCT operator_id)::text AS total_operators
       FROM cms_device_sessions
       WHERE campaign_id = $1
       GROUP BY wa_number
     )
     SELECT
       ds.wa_number,
       ds.hablados::text,
       ds.respondieron::text,
       ds.archivados::text,
       acts.active_operator_id,
       acts.active_operator_email,
       acts.active_since,
       COALESCE(oc.total_operators, '1') AS total_operators
     FROM device_stats ds
     LEFT JOIN active_sessions acts ON acts.wa_number = ds.wa_number
     LEFT JOIN operator_counts oc   ON oc.wa_number = ds.wa_number
     ORDER BY ds.hablados DESC`,
    [campaignId],
  );

  return rows.map((r, idx) => ({
    wa_number: r.wa_number,
    label: `Celular ${idx + 1}`,
    hablados: parseInt(r.hablados, 10),
    respondieron: parseInt(r.respondieron, 10),
    archivados: parseInt(r.archivados, 10),
    active_operator_id: r.active_operator_id ?? null,
    active_operator_email: r.active_operator_email ?? null,
    active_since: r.active_since ?? null,
    total_operators: parseInt(r.total_operators, 10),
  }));
}
