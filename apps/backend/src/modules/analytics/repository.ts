/**
 * GOBERNA — Analytics Repository
 * Database operations for campaign analytics (GA4 data).
 */

import { pool } from "../../db";
import type { GA4Data } from "./schemas";

// ── Row types ───────────────────────────────────────────────────────

export type AnalyticsRow = {
  id: string;
  campaign_id: string;
  data: GA4Data;
  date_start: string;
  date_end: string;
  created_at: Date;
  updated_at: Date;
};

// ── Queries ─────────────────────────────────────────────────────────

export async function findByCampaignId(campaignId: string): Promise<AnalyticsRow | null> {
  const { rows } = await pool.query<AnalyticsRow>(
    `SELECT id, campaign_id, data, date_start, date_end, created_at, updated_at
     FROM campaign_analytics
     WHERE campaign_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [campaignId],
  );
  return rows[0] ?? null;
}

export async function findByCampaignSlug(slug: string): Promise<AnalyticsRow | null> {
  const { rows } = await pool.query<AnalyticsRow>(
    `SELECT ca.id, ca.campaign_id, ca.data, ca.date_start, ca.date_end, ca.created_at, ca.updated_at
     FROM campaign_analytics ca
     JOIN campaigns c ON c.id = ca.campaign_id
     WHERE c.slug = $1
     ORDER BY ca.created_at DESC
     LIMIT 1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function save(
  campaignId: string,
  data: GA4Data,
): Promise<AnalyticsRow> {
  const dateStart = data.overview.dateRange.start;
  const dateEnd = data.overview.dateRange.end;

  // Upsert: Update if exists for this campaign, otherwise insert
  const { rows } = await pool.query<AnalyticsRow>(
    `INSERT INTO campaign_analytics (campaign_id, data, date_start, date_end)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (campaign_id) 
     DO UPDATE SET 
       data = EXCLUDED.data,
       date_start = EXCLUDED.date_start,
       date_end = EXCLUDED.date_end,
       updated_at = NOW()
     RETURNING id, campaign_id, data, date_start, date_end, created_at, updated_at`,
    [campaignId, JSON.stringify(data), dateStart, dateEnd],
  );
  return rows[0]!;
}

export async function deleteByCampaignId(campaignId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM campaign_analytics WHERE campaign_id = $1`,
    [campaignId],
  );
  return (rowCount ?? 0) > 0;
}

// ── Update campaign config to mark has_ga4_data ─────────────────────

export async function markCampaignHasGA4(campaignId: string, hasData: boolean): Promise<void> {
  await pool.query(
    `UPDATE campaigns 
     SET config = jsonb_set(COALESCE(config, '{}')::jsonb, '{has_ga4_data}', $2::jsonb),
         updated_at = NOW()
     WHERE id = $1`,
    [campaignId, JSON.stringify(hasData)],
  );
}
