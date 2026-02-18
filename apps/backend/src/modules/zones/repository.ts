import { pool } from "../../db";
import type { CreateZoneInput, UpdateZoneInput } from "./schemas";

export type ZoneRow = {
  id: string;
  campaign_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  color: string;
  assigned_to: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type ZoneWithAssignee = ZoneRow & {
  assignee_name: string | null;
  assignee_role: string | null;
};

const ZONE_COLS = `z.id, z.campaign_id, z.name, z.center_lat, z.center_lng, z.radius_meters,
  z.color, z.assigned_to, z.metadata, z.created_at, z.updated_at`;

export async function create(input: CreateZoneInput): Promise<ZoneRow> {
  const { rows } = await pool.query<ZoneRow>(
    `INSERT INTO zones (campaign_id, name, center_lat, center_lng, radius_meters, color, assigned_to, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, campaign_id, name, center_lat, center_lng, radius_meters, color, assigned_to, metadata, created_at, updated_at`,
    [
      input.campaign_id,
      input.name,
      input.center_lat,
      input.center_lng,
      input.radius_meters ?? 500,
      input.color ?? "#3b82f6",
      input.assigned_to ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return rows[0]!;
}

export async function findById(id: string): Promise<ZoneRow | null> {
  const { rows } = await pool.query<ZoneRow>(
    `SELECT id, campaign_id, name, center_lat, center_lng, radius_meters, color, assigned_to, metadata, created_at, updated_at
     FROM zones WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listByCampaign(campaignId: string): Promise<ZoneWithAssignee[]> {
  const { rows } = await pool.query<ZoneWithAssignee>(
    `SELECT ${ZONE_COLS}, u.full_name AS assignee_name, u.role AS assignee_role
     FROM zones z
     LEFT JOIN users u ON u.id = z.assigned_to
     WHERE z.campaign_id = $1
     ORDER BY z.name`,
    [campaignId],
  );
  return rows;
}

export async function update(id: string, input: UpdateZoneInput): Promise<ZoneRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(input.name); }
  if (input.center_lat !== undefined) { setClauses.push(`center_lat = $${idx++}`); values.push(input.center_lat); }
  if (input.center_lng !== undefined) { setClauses.push(`center_lng = $${idx++}`); values.push(input.center_lng); }
  if (input.radius_meters !== undefined) { setClauses.push(`radius_meters = $${idx++}`); values.push(input.radius_meters); }
  if (input.color !== undefined) { setClauses.push(`color = $${idx++}`); values.push(input.color); }
  if (input.assigned_to !== undefined) { setClauses.push(`assigned_to = $${idx++}`); values.push(input.assigned_to); }
  if (input.metadata !== undefined) { setClauses.push(`metadata = $${idx++}`); values.push(JSON.stringify(input.metadata)); }

  if (setClauses.length === 0) return findById(id);

  setClauses.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<ZoneRow>(
    `UPDATE zones SET ${setClauses.join(", ")} WHERE id = $${idx}
     RETURNING id, campaign_id, name, center_lat, center_lng, radius_meters, color, assigned_to, metadata, created_at, updated_at`,
    values,
  );
  return rows[0] ?? null;
}

export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM zones WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function getGeoJsonByCampaign(campaignId: string): Promise<object> {
  const zones = await listByCampaign(campaignId);
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature",
      properties: {
        id: z.id,
        name: z.name,
        radius_meters: z.radius_meters,
        color: z.color,
        assigned_to: z.assigned_to,
        assignee_name: z.assignee_name,
      },
      geometry: {
        type: "Point",
        coordinates: [z.center_lng, z.center_lat],
      },
    })),
  };
}
