import { pool } from "../../db";
import type { CreateOrgNodeInput, UpdateOrgNodeInput } from "./schemas";

export type OrgNodeRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  parent_user_id: string | null;
  role: string;
  zone_id: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type OrgNodeWithUser = OrgNodeRow & {
  user_name: string;
  user_email: string;
  parent_name: string | null;
  zone_name: string | null;
};

export async function create(input: CreateOrgNodeInput): Promise<OrgNodeRow> {
  const { rows } = await pool.query<OrgNodeRow>(
    `INSERT INTO org_hierarchy (campaign_id, user_id, parent_user_id, role, zone_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (campaign_id, user_id)
     DO UPDATE SET parent_user_id = EXCLUDED.parent_user_id, role = EXCLUDED.role,
                   zone_id = EXCLUDED.zone_id, status = 'active', updated_at = now()
     RETURNING id, campaign_id, user_id, parent_user_id, role, zone_id, status, created_at, updated_at`,
    [input.campaign_id, input.user_id, input.parent_user_id ?? null, input.role, input.zone_id ?? null],
  );
  return rows[0]!;
}

export async function findById(id: string): Promise<OrgNodeRow | null> {
  const { rows } = await pool.query<OrgNodeRow>(
    `SELECT id, campaign_id, user_id, parent_user_id, role, zone_id, status, created_at, updated_at
     FROM org_hierarchy WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findByUserAndCampaign(userId: string, campaignId: string): Promise<OrgNodeRow | null> {
  const { rows } = await pool.query<OrgNodeRow>(
    `SELECT id, campaign_id, user_id, parent_user_id, role, zone_id, status, created_at, updated_at
     FROM org_hierarchy WHERE user_id = $1 AND campaign_id = $2`,
    [userId, campaignId],
  );
  return rows[0] ?? null;
}

export async function getFullHierarchy(campaignId: string): Promise<OrgNodeWithUser[]> {
  const { rows } = await pool.query<OrgNodeWithUser>(
    `SELECT oh.id, oh.campaign_id, oh.user_id, oh.parent_user_id, oh.role,
            oh.zone_id, oh.status, oh.created_at, oh.updated_at,
            u.full_name AS user_name, u.email AS user_email,
            pu.full_name AS parent_name,
            z.name AS zone_name
     FROM org_hierarchy oh
     JOIN users u ON u.id = oh.user_id
     LEFT JOIN users pu ON pu.id = oh.parent_user_id
     LEFT JOIN zones z ON z.id = oh.zone_id
     WHERE oh.campaign_id = $1 AND oh.status = 'active'
     ORDER BY
       CASE oh.role
         WHEN 'admin' THEN 1
         WHEN 'consultor' THEN 2
         WHEN 'candidato' THEN 3
         WHEN 'brigadista_zonal' THEN 4
         WHEN 'agente_campo' THEN 5
       END,
       u.full_name`,
    [campaignId],
  );
  return rows;
}

export async function getSubordinates(userId: string, campaignId: string): Promise<OrgNodeWithUser[]> {
  const { rows } = await pool.query<OrgNodeWithUser>(
    `WITH RECURSIVE subordinates AS (
       SELECT oh.id, oh.campaign_id, oh.user_id, oh.parent_user_id, oh.role,
              oh.zone_id, oh.status, oh.created_at, oh.updated_at
       FROM org_hierarchy oh
       WHERE oh.parent_user_id = $1 AND oh.campaign_id = $2 AND oh.status = 'active'
       UNION ALL
       SELECT oh2.id, oh2.campaign_id, oh2.user_id, oh2.parent_user_id, oh2.role,
              oh2.zone_id, oh2.status, oh2.created_at, oh2.updated_at
       FROM org_hierarchy oh2
       JOIN subordinates s ON oh2.parent_user_id = s.user_id
       WHERE oh2.campaign_id = $2 AND oh2.status = 'active'
     )
     SELECT s.*, u.full_name AS user_name, u.email AS user_email,
            pu.full_name AS parent_name, z.name AS zone_name
     FROM subordinates s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN users pu ON pu.id = s.parent_user_id
     LEFT JOIN zones z ON z.id = s.zone_id
      ORDER BY
        CASE s.role
          WHEN 'candidato' THEN 1
          WHEN 'brigadista_zonal' THEN 2
          WHEN 'agente_campo' THEN 3
          WHEN 'agente_digital' THEN 3
          ELSE 4
        END,
       u.full_name`,
    [userId, campaignId],
  );
  return rows;
}

export async function update(id: string, input: UpdateOrgNodeInput): Promise<OrgNodeRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.parent_user_id !== undefined) { setClauses.push(`parent_user_id = $${idx++}`); values.push(input.parent_user_id); }
  if (input.role !== undefined) { setClauses.push(`role = $${idx++}`); values.push(input.role); }
  if (input.zone_id !== undefined) { setClauses.push(`zone_id = $${idx++}`); values.push(input.zone_id); }
  if (input.status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(input.status); }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<OrgNodeRow>(
    `UPDATE org_hierarchy SET ${setClauses.join(", ")} WHERE id = $${idx}
     RETURNING id, campaign_id, user_id, parent_user_id, role, zone_id, status, created_at, updated_at`,
    values,
  );
  return rows[0] ?? null;
}

export async function remove(campaignId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE org_hierarchy SET status = 'inactive', updated_at = now()
     WHERE campaign_id = $1 AND user_id = $2`,
    [campaignId, userId],
  );
  return (rowCount ?? 0) > 0;
}
