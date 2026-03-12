import { pool } from "../../db";
import type { FormSubmissionInput } from "./schemas";

export type FormSubmissionRow = {
  id: string;
  form_definition_id: string | null;
  campaign_id: string;
  meet_id: string | null;
  meet_group_id: string | null;
  submitted_by: string | null;
  data: Record<string, unknown>;
  lat: number | null;
  lng: number | null;
  client_id: string;
  synced_at: Date | null;
  created_at: Date;
};

type BatchResult = {
  attempted: number;
  accepted: number;
  /** Phones that were rejected because they already exist in the campaign */
  duplicated_phones: string[];
};

export async function insertBatch(
  submissions: FormSubmissionInput[],
  submittedBy: string | null,
): Promise<BatchResult> {
  if (submissions.length === 0) {
    return { attempted: 0, accepted: 0, duplicated_phones: [] };
  }

  const payload = JSON.stringify(
    submissions.map((s) => ({
      form_definition_id: s.form_definition_id ?? null,
      campaign_id: s.campaign_id ?? null,
      meet_id: s.meet_id ?? null,
      meet_group_id: s.meet_group_id ?? null,
      submitted_by: submittedBy,
      data: JSON.stringify(s.data),
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      client_id: s.client_id,
    })),
  );

  const result = (await pool.query(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          form_definition_id uuid,
          campaign_id uuid,
          meet_id uuid,
          meet_group_id uuid,
          submitted_by uuid,
          data text,
          lat double precision,
          lng double precision,
          client_id text
        )
      ),
      -- Deduplicate within the batch itself (keep first client_id per phone+campaign)
      deduped AS (
        SELECT DISTINCT ON (campaign_id, CASE WHEN COALESCE(data::jsonb->>'telefono','') <> '' THEN data::jsonb->>'telefono' ELSE client_id END)
          form_definition_id, campaign_id, meet_id, meet_group_id, submitted_by,
          data, lat, lng, client_id
        FROM incoming
        ORDER BY campaign_id,
                 CASE WHEN COALESCE(data::jsonb->>'telefono','') <> '' THEN data::jsonb->>'telefono' ELSE client_id END,
                 client_id ASC
      ),
      -- Identify phones that already exist in the DB (for explicit error messages)
      existing_phones AS (
        SELECT DISTINCT d.data::jsonb->>'telefono' AS phone
        FROM deduped d
        WHERE COALESCE(d.data::jsonb->>'telefono', '') <> ''
          AND EXISTS (
            SELECT 1 FROM public.form_submissions ex
            WHERE ex.campaign_id = d.campaign_id
              AND ex.data->>'telefono' = d.data::jsonb->>'telefono'
              AND ex.deleted_at IS NULL
          )
      ),
      -- Reverse-geocode: enrich JSONB data with departamento/provincia/distrito
      -- when lat/lng are valid GPS coordinates and the fields are not already present
      -- (distrito picker submissions already have them — we don't overwrite).
      geocoded AS (
        SELECT
          d.*,
          CASE
            WHEN d.lat IS NOT NULL AND d.lng IS NOT NULL
              AND d.lat <> 0 AND d.lng <> 0
              AND COALESCE(d.data::jsonb->>'departamento', '') = ''
            THEN (
              SELECT jsonb_build_object(
                'departamento', dep.nomdep,
                'provincia', prov.nomprov,
                'distrito', dist.nomdist,
                'ubigeo', dist.ubigeo
              )
              FROM peru_distritos dist
              JOIN peru_departamentos dep ON dep.coddep = dist.coddep
              JOIN peru_provincias prov ON prov.coddep = dist.coddep AND prov.codprov = dist.codprov
              WHERE ST_Contains(dist.geom, ST_SetSRID(ST_Point(d.lng, d.lat), 4326))
              LIMIT 1
            )
            ELSE NULL
          END AS geo_data
        FROM deduped d
      ),
      inserted AS (
        INSERT INTO form_submissions (
          form_definition_id, campaign_id, meet_id, meet_group_id, submitted_by,
          data, lat, lng, client_id, synced_at
        )
        SELECT
          g.form_definition_id, g.campaign_id, g.meet_id, g.meet_group_id, g.submitted_by,
          CASE WHEN g.geo_data IS NOT NULL
            THEN g.data::jsonb || g.geo_data
            ELSE g.data::jsonb
          END,
          g.lat, g.lng, g.client_id, now()
        FROM geocoded g
        -- Skip phones already in the DB for this campaign
        WHERE NOT EXISTS (
          SELECT 1 FROM public.form_submissions ex
          WHERE ex.campaign_id = g.campaign_id
            AND ex.data->>'telefono' = g.data::jsonb->>'telefono'
            AND COALESCE(g.data::jsonb->>'telefono', '') <> ''
            AND ex.deleted_at IS NULL
        )
        -- client_id dedup (idempotent retries) + phone unique index as safety net
        ON CONFLICT DO NOTHING
        RETURNING client_id
      )
      SELECT
        (SELECT count(*)::bigint FROM incoming) AS attempted,
        (SELECT count(*)::bigint FROM inserted) AS accepted,
        (SELECT COALESCE(array_agg(phone), '{}') FROM existing_phones) AS duplicated_phones
    `,
    [payload],
  )) as { rows: Array<{ attempted: string | number; accepted: string | number; duplicated_phones: string[] }> };

  const row = result.rows[0] ?? { attempted: 0, accepted: 0, duplicated_phones: [] };
  return {
    attempted: Number(row.attempted ?? 0),
    accepted: Number(row.accepted ?? 0),
    duplicated_phones: Array.isArray(row.duplicated_phones) ? row.duplicated_phones : [],
  };
}

export async function getByCampaign(
  campaignId: string,
  limit = 50,
  offset = 0,
): Promise<{ submissions: FormSubmissionRow[]; total: number }> {
  const [dataResult, countResult] = await Promise.all([
    pool.query<FormSubmissionRow>(
      `SELECT id, form_definition_id, campaign_id, meet_id, meet_group_id,
              submitted_by, data, lat, lng, client_id, synced_at, created_at
       FROM form_submissions
       WHERE campaign_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [campaignId, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM form_submissions WHERE campaign_id = $1`,
      [campaignId],
    ),
  ]);

  return {
    submissions: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

/** Lightweight lookup to verify meet exists and get its campaign_id */
export async function getMeetCampaignId(meetId: string): Promise<{ campaign_id: string } | null> {
  const { rows } = await pool.query<{ campaign_id: string }>(
    `SELECT campaign_id FROM meets WHERE id = $1`,
    [meetId],
  );
  return rows[0] ?? null;
}

export async function getByMeet(meetId: string, limit = 100): Promise<FormSubmissionRow[]> {
  const { rows } = await pool.query<FormSubmissionRow>(
    `SELECT id, form_definition_id, campaign_id, meet_id, meet_group_id,
            submitted_by, data, lat, lng, client_id, synced_at, created_at
     FROM form_submissions
     WHERE meet_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [meetId, limit],
  );
  return rows;
}

export async function getRecent(campaignId: string, limit = 20): Promise<FormSubmissionRow[]> {
  const { rows } = await pool.query<FormSubmissionRow>(
    `SELECT id, form_definition_id, campaign_id, meet_id, meet_group_id,
            submitted_by, data, lat, lng, client_id, synced_at, created_at
     FROM form_submissions
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [campaignId, limit],
  );
  return rows;
}

export async function getCountByCampaign(campaignId: string): Promise<{
  total: number;
  today: number;
  week: number;
}> {
  const { rows } = await pool.query<{ total: string; today: string; week: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::text AS today,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS week
     FROM form_submissions
     WHERE campaign_id = $1`,
    [campaignId],
  );
  const row = rows[0];
  return {
    total: parseInt(row?.total ?? "0", 10),
    today: parseInt(row?.today ?? "0", 10),
    week: parseInt(row?.week ?? "0", 10),
  };
}

/**
 * Get submission counts for a specific agent in a campaign.
 * Uses phone dedup (DISTINCT ON telefono) to match Pipeline/web dashboard counts.
 * Used by the mobile dashboard to show accurate totals (server-side truth).
 */
export async function getMyStats(campaignId: string, userId: string): Promise<{
  total: number;
  today: number;
  week: number;
}> {
  const { rows } = await pool.query<{ total: string; today: string; week: string }>(
    `WITH unique_forms AS (
       SELECT DISTINCT ON (data->>'telefono')
         id, created_at
       FROM form_submissions
       WHERE campaign_id = $1
         AND submitted_by = $2
         AND COALESCE(data->>'telefono', '') != ''
         AND deleted_at IS NULL
       ORDER BY data->>'telefono', created_at ASC
     )
     SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'America/Lima' >= CURRENT_DATE AT TIME ZONE 'America/Lima')::text AS today,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS week
     FROM unique_forms`,
    [campaignId, userId],
  );
  const row = rows[0];
  return {
    total: parseInt(row?.total ?? "0", 10),
    today: parseInt(row?.today ?? "0", 10),
    week: parseInt(row?.week ?? "0", 10),
  };
}

/**
 * Department ranking: top agents within the same department as the requesting user.
 * Department is determined by the most frequent departamento in the agent's submissions.
 * Returns the agent's position, their department, and a ranked list of agents.
 */
export type DeptRankingAgent = {
  id: string;
  name: string;
  count: number;
  today: number;
};

export type DeptRankingResult = {
  departamento: string | null;
  my_position: number;
  my_count: number;
  total_agents: number;
  ranking: DeptRankingAgent[];
};

export async function getMyDeptRanking(
  campaignId: string,
  userId: string,
  limit = 20,
): Promise<DeptRankingResult> {
  // Step 1: Determine the agent's primary department (most frequent in their submissions)
  const { rows: deptRows } = await pool.query<{ departamento: string }>(
    `SELECT data->>'departamento' AS departamento
     FROM form_submissions
     WHERE campaign_id = $1
       AND submitted_by = $2
       AND deleted_at IS NULL
       AND COALESCE(data->>'departamento', '') != ''
     GROUP BY data->>'departamento'
     ORDER BY COUNT(*) DESC
     LIMIT 1`,
    [campaignId, userId],
  );

  const departamento = deptRows[0]?.departamento ?? null;
  if (!departamento) {
    return { departamento: null, my_position: 0, my_count: 0, total_agents: 0, ranking: [] };
  }

  // Step 2: Rank all agents in that department (phone dedup, consistent with Pipeline)
  const { rows } = await pool.query<{
    id: string;
    name: string;
    count: string;
    today: string;
  }>(
    `WITH dept_forms AS (
       SELECT DISTINCT ON (data->>'telefono')
         id, submitted_by, created_at
       FROM form_submissions
       WHERE campaign_id = $1
         AND UPPER(data->>'departamento') = UPPER($2)
         AND COALESCE(data->>'telefono', '') != ''
         AND deleted_at IS NULL
       ORDER BY data->>'telefono', created_at ASC
     )
     SELECT
       df.submitted_by::text AS id,
       COALESCE(u.full_name, 'Agente') AS name,
       COUNT(*)::text AS count,
       COUNT(*) FILTER (WHERE df.created_at AT TIME ZONE 'America/Lima' >= CURRENT_DATE AT TIME ZONE 'America/Lima')::text AS today
     FROM dept_forms df
     LEFT JOIN users u ON u.id = df.submitted_by
     WHERE df.submitted_by IS NOT NULL
     GROUP BY df.submitted_by, COALESCE(u.full_name, 'Agente')
     ORDER BY COUNT(*) DESC
     LIMIT $3`,
    [campaignId, departamento, limit],
  );

  const ranking: DeptRankingAgent[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: parseInt(r.count, 10),
    today: parseInt(r.today, 10),
  }));

  const myIdx = ranking.findIndex((a) => a.id === userId);
  const myPosition = myIdx >= 0 ? myIdx + 1 : 0;
  const myCount = myIdx >= 0 ? (ranking[myIdx]?.count ?? 0) : 0;

  return {
    departamento,
    my_position: myPosition,
    my_count: myCount,
    total_agents: ranking.length,
    ranking,
  };
}
