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
};

export async function insertBatch(
  submissions: FormSubmissionInput[],
  submittedBy: string | null,
): Promise<BatchResult> {
  if (submissions.length === 0) {
    return { attempted: 0, accepted: 0 };
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
      inserted AS (
        INSERT INTO form_submissions (
          form_definition_id, campaign_id, meet_id, meet_group_id, submitted_by,
          data, lat, lng, client_id, synced_at
        )
        SELECT
          i.form_definition_id, i.campaign_id, i.meet_id, i.meet_group_id, i.submitted_by,
          i.data::jsonb, i.lat, i.lng, i.client_id, now()
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
