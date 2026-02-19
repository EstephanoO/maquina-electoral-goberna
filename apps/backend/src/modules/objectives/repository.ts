/**
 * Objectives Repository
 * Handles zone (region) objectives and user objective overrides
 */

import { pool } from "../../db.js";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type ZoneObjective = {
  id: string;
  campaign_id: string;
  region: string;
  target_forms: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type UserObjective = {
  id: string;
  campaign_id: string;
  user_id: string;
  target_forms: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type UserEffectiveObjective = {
  user_id: string;
  campaign_id: string;
  role: string;
  full_name: string;
  region: string | null;
  target_forms: number | null;
  region_total: number | null;
  agents_in_region: number;
  has_override: boolean;
};

export type ZoneObjectiveWithStats = ZoneObjective & {
  brigadista_count: number;
  agent_count: number;
  forms_collected: number;
  progress_percent: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// Zone Objectives
// ═══════════════════════════════════════════════════════════════════════════

/** List all zone objectives for a campaign */
export async function listZoneObjectives(campaignId: string): Promise<ZoneObjectiveWithStats[]> {
  const { rows } = await pool.query<ZoneObjectiveWithStats>(
    `SELECT 
       zo.*,
       COALESCE(stats.brigadista_count, 0)::int AS brigadista_count,
       COALESCE(stats.agent_count, 0)::int AS agent_count,
       COALESCE(stats.forms_collected, 0)::int AS forms_collected,
       CASE 
         WHEN zo.target_forms > 0 
         THEN LEAST(100, ROUND(COALESCE(stats.forms_collected, 0)::numeric / zo.target_forms * 100))
         ELSE 0 
       END::int AS progress_percent
     FROM zone_objectives zo
     LEFT JOIN LATERAL (
       SELECT 
         COUNT(DISTINCT CASE WHEN uc.role = 'brigadista_zonal' THEN uc.user_id END)::int AS brigadista_count,
         COUNT(DISTINCT CASE WHEN uc.role = 'agente_campo' THEN uc.user_id END)::int AS agent_count,
       (SELECT COUNT(*) FROM form_submissions fs 
           JOIN users u ON u.id = fs.submitted_by 
           WHERE fs.campaign_id = zo.campaign_id AND u.region = zo.region
          )::int AS forms_collected
       FROM user_campaigns uc
       JOIN users u ON u.id = uc.user_id
       WHERE uc.campaign_id = zo.campaign_id 
         AND uc.status = 'active'
         AND u.region = zo.region
     ) stats ON TRUE
     WHERE zo.campaign_id = $1
     ORDER BY zo.region`,
    [campaignId]
  );
  return rows;
}

/** Get a single zone objective */
export async function getZoneObjective(campaignId: string, region: string): Promise<ZoneObjective | null> {
  const { rows } = await pool.query<ZoneObjective>(
    `SELECT * FROM zone_objectives WHERE campaign_id = $1 AND region = $2`,
    [campaignId, region]
  );
  return rows[0] ?? null;
}

/** Create or update a zone objective (upsert) */
export async function upsertZoneObjective(input: {
  campaign_id: string;
  region: string;
  target_forms: number;
  description?: string;
  created_by?: string;
}): Promise<ZoneObjective> {
  const { rows } = await pool.query<ZoneObjective>(
    `INSERT INTO zone_objectives (campaign_id, region, target_forms, description, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (campaign_id, region)
     DO UPDATE SET 
       target_forms = EXCLUDED.target_forms,
       description = COALESCE(EXCLUDED.description, zone_objectives.description),
       updated_at = NOW()
     RETURNING *`,
    [input.campaign_id, input.region, input.target_forms, input.description ?? null, input.created_by ?? null]
  );
  return rows[0]!;
}

/** Bulk upsert zone objectives */
export async function bulkUpsertZoneObjectives(
  campaignId: string,
  objectives: Array<{ region: string; target_forms: number; description?: string }>,
  createdBy?: string
): Promise<ZoneObjective[]> {
  if (objectives.length === 0) return [];

  // Build values for bulk insert
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const obj of objectives) {
    placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
    values.push(campaignId, obj.region, obj.target_forms, obj.description ?? null, createdBy ?? null);
    paramIndex += 5;
  }

  const { rows } = await pool.query<ZoneObjective>(
    `INSERT INTO zone_objectives (campaign_id, region, target_forms, description, created_by)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (campaign_id, region)
     DO UPDATE SET 
       target_forms = EXCLUDED.target_forms,
       description = COALESCE(EXCLUDED.description, zone_objectives.description),
       updated_at = NOW()
     RETURNING *`,
    values
  );
  return rows;
}

/** Delete a zone objective */
export async function deleteZoneObjective(campaignId: string, region: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM zone_objectives WHERE campaign_id = $1 AND region = $2`,
    [campaignId, region]
  );
  return (rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// User Objectives
// ═══════════════════════════════════════════════════════════════════════════

/** Get effective objectives for all users in a campaign */
export async function getUserEffectiveObjectives(campaignId: string): Promise<UserEffectiveObjective[]> {
  const { rows } = await pool.query<UserEffectiveObjective>(
    `SELECT * FROM user_effective_objectives WHERE campaign_id = $1 ORDER BY region, role, full_name`,
    [campaignId]
  );
  return rows;
}

/** Set a user objective override */
export async function setUserObjective(input: {
  campaign_id: string;
  user_id: string;
  target_forms: number | null;
  notes?: string;
}): Promise<UserObjective> {
  const { rows } = await pool.query<UserObjective>(
    `INSERT INTO user_objectives (campaign_id, user_id, target_forms, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (campaign_id, user_id)
     DO UPDATE SET 
       target_forms = EXCLUDED.target_forms,
       notes = COALESCE(EXCLUDED.notes, user_objectives.notes),
       updated_at = NOW()
     RETURNING *`,
    [input.campaign_id, input.user_id, input.target_forms, input.notes ?? null]
  );
  return rows[0]!;
}

/** Remove a user objective override (reverts to inherited) */
export async function clearUserObjective(campaignId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_objectives WHERE campaign_id = $1 AND user_id = $2`,
    [campaignId, userId]
  );
  return (rowCount ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary / Dashboard
// ═══════════════════════════════════════════════════════════════════════════

/** Get summary of objectives progress by region */
export async function getObjectivesSummary(campaignId: string): Promise<{
  total_target: number;
  total_collected: number;
  overall_progress: number;
  regions: Array<{
    region: string;
    target: number;
    collected: number;
    progress: number;
    brigadistas: number;
    agents: number;
  }>;
}> {
  const zones = await listZoneObjectives(campaignId);
  
  const total_target = zones.reduce((sum, z) => sum + z.target_forms, 0);
  const total_collected = zones.reduce((sum, z) => sum + z.forms_collected, 0);
  const overall_progress = total_target > 0 
    ? Math.round((total_collected / total_target) * 100) 
    : 0;

  return {
    total_target,
    total_collected,
    overall_progress,
    regions: zones.map(z => ({
      region: z.region,
      target: z.target_forms,
      collected: z.forms_collected,
      progress: z.progress_percent,
      brigadistas: z.brigadista_count,
      agents: z.agent_count,
    })),
  };
}
