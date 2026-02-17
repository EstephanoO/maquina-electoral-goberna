import { pool } from "../../db";
import type { CreateMeetInput, MeetStatus, UpdateMeetInput } from "./schema";

// ── Row types ───────────────────────────────────────────────────────

export type MeetRow = {
  id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  status: MeetStatus;
  starts_at: Date;
  ends_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type MeetWithParticipantCount = MeetRow & {
  participant_count: number;
};

export type ParticipantRow = {
  meet_id: string;
  user_id: string;
  full_name: string;
  role: string;
  joined_at: Date;
  left_at: Date | null;
};

// ── SELECT columns ──────────────────────────────────────────────────

const MEET_COLS = `id, campaign_id, title, description, location_name, lat, lng,
  status, starts_at, ends_at, created_by, created_at, updated_at`;

// ── CRUD ────────────────────────────────────────────────────────────

export async function create(input: CreateMeetInput, userId: string): Promise<MeetRow> {
  // If created without lat/lng → pending_location, otherwise → scheduled
  const status: MeetStatus = input.lat != null && input.lng != null ? "scheduled" : "pending_location";

  const { rows } = await pool.query<MeetRow>(
    `INSERT INTO meets (campaign_id, title, description, location_name, lat, lng, status, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${MEET_COLS}`,
    [
      input.campaign_id,
      input.title,
      input.description ?? null,
      input.location_name ?? null,
      input.lat ?? null,
      input.lng ?? null,
      status,
      input.starts_at,
      input.ends_at ?? null,
      userId,
    ],
  );
  return rows[0]!;
}

export async function findById(id: string): Promise<MeetRow | null> {
  const { rows } = await pool.query<MeetRow>(
    `SELECT ${MEET_COLS} FROM meets WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listByCampaign(
  campaignId: string,
  statusFilter?: MeetStatus[],
): Promise<MeetWithParticipantCount[]> {
  let query = `
    SELECT m.id, m.campaign_id, m.title, m.description, m.location_name,
           m.lat, m.lng, m.status, m.starts_at, m.ends_at,
           m.created_by, m.created_at, m.updated_at,
           COUNT(mp.user_id)::int AS participant_count
    FROM meets m
    LEFT JOIN meet_participants mp ON mp.meet_id = m.id AND mp.left_at IS NULL
    WHERE m.campaign_id = $1`;
  const params: unknown[] = [campaignId];

  if (statusFilter && statusFilter.length > 0) {
    query += ` AND m.status = ANY($2)`;
    params.push(statusFilter);
  }

  query += ` GROUP BY m.id ORDER BY m.starts_at DESC`;

  const { rows } = await pool.query<MeetWithParticipantCount>(query, params);
  return rows;
}

export async function listActiveByCampaign(campaignId: string): Promise<MeetWithParticipantCount[]> {
  return listByCampaign(campaignId, ["scheduled", "active"]);
}

export async function update(id: string, input: UpdateMeetInput): Promise<MeetRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.location_name !== undefined) {
    setClauses.push(`location_name = $${paramIndex++}`);
    values.push(input.location_name);
  }
  if (input.lat !== undefined) {
    setClauses.push(`lat = $${paramIndex++}`);
    values.push(input.lat);
  }
  if (input.lng !== undefined) {
    setClauses.push(`lng = $${paramIndex++}`);
    values.push(input.lng);
  }
  if (input.starts_at !== undefined) {
    setClauses.push(`starts_at = $${paramIndex++}`);
    values.push(input.starts_at);
  }
  if (input.ends_at !== undefined) {
    setClauses.push(`ends_at = $${paramIndex++}`);
    values.push(input.ends_at);
  }

  // If lat/lng are being set and meet was pending_location, transition to scheduled
  if (input.lat !== undefined && input.lng !== undefined) {
    setClauses.push(`status = CASE WHEN status = 'pending_location' THEN 'scheduled' ELSE status END`);
  }

  if (setClauses.length === 0) return findById(id);

  setClauses.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<MeetRow>(
    `UPDATE meets SET ${setClauses.join(", ")} WHERE id = $${paramIndex}
     RETURNING ${MEET_COLS}`,
    values,
  );
  return rows[0] ?? null;
}

export async function updateStatus(id: string, status: MeetStatus): Promise<MeetRow | null> {
  const { rows } = await pool.query<MeetRow>(
    `UPDATE meets SET status = $1, updated_at = now() WHERE id = $2
     RETURNING ${MEET_COLS}`,
    [status, id],
  );
  return rows[0] ?? null;
}

// ── Summary (meet detail with form count) ──────────────────────

export type MeetSummary = MeetRow & {
  participant_count: number;
  active_participants: number;
  forms_count: number;
};

export async function getSummary(meetId: string): Promise<MeetSummary | null> {
  const { rows } = await pool.query<MeetSummary>(
    `SELECT m.id, m.campaign_id, m.title, m.description, m.location_name,
            m.lat, m.lng, m.status, m.starts_at, m.ends_at,
            m.created_by, m.created_at, m.updated_at,
            COUNT(DISTINCT mp.user_id)::int AS participant_count,
            COUNT(DISTINCT mp.user_id) FILTER (WHERE mp.left_at IS NULL)::int AS active_participants,
            COUNT(f.id)::int AS forms_count
     FROM meets m
     LEFT JOIN meet_participants mp ON mp.meet_id = m.id
     LEFT JOIN forms f ON f.meet_id = m.id
     WHERE m.id = $1
     GROUP BY m.id`,
    [meetId],
  );
  return rows[0] ?? null;
}

// ── DELETE ──────────────────────────────────────────────────────────

export async function remove(id: string): Promise<boolean> {
  // Participants are deleted via ON DELETE CASCADE on meet_participants.meet_id
  const { rowCount } = await pool.query(`DELETE FROM meets WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ── Participants ────────────────────────────────────────────────────

export async function join(meetId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO meet_participants (meet_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (meet_id, user_id)
     DO UPDATE SET left_at = NULL, joined_at = now()`,
    [meetId, userId],
  );
}

export async function leave(meetId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE meet_participants SET left_at = now()
     WHERE meet_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [meetId, userId],
  );
}

export async function listParticipants(meetId: string): Promise<ParticipantRow[]> {
  const { rows } = await pool.query<ParticipantRow>(
    `SELECT mp.meet_id, mp.user_id, u.full_name,
            COALESCE(uc.role, u.role) AS role,
            mp.joined_at, mp.left_at
     FROM meet_participants mp
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN user_campaigns uc ON uc.user_id = mp.user_id
       AND uc.campaign_id = (SELECT campaign_id FROM meets WHERE id = $1)
     WHERE mp.meet_id = $1
     ORDER BY mp.joined_at`,
    [meetId],
  );
  return rows;
}
