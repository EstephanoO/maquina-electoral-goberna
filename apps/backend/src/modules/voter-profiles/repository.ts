import { pool } from "../../db";

// ── Types ─────────────────────────────────────────────────────────────

export type VoterProfile = {
  id: string;
  campaign_id: string;
  canonical_phone: string;
  canonical_name: string;
  name_variants: string[];
  jids: string[];
  departamento: string;
  provincia: string;
  distrito: string;
  zona: string;
  domicilio: string;
  local_votacion: string;
  last_lat: number | null;
  last_lng: number | null;
  vote_class: string;
  vote_class_source: string;
  confidence: number | null;
  category: string;
  signal_score: number;
  signal_flags: Record<string, boolean>;
  pipeline_status: string;
  first_captured_at: string;
  last_contacted_at: string | null;
  last_responded_at: string | null;
  wa_sent_count: number;
  wa_received_count: number;
  source_submission_ids: string[];
  source_conversation_ids: string[];
  source_validation_id: string | null;
  captured_by: string[];
  contacted_by: string[];
  tags: string[];
  notes: string;
  operator_notes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type VoterProfileStats = {
  total: number;
  by_status: Record<string, number>;
  by_vote_class: Record<string, number>;
  with_responses: number;
  with_wa_contact: number;
};

export type ListFilters = {
  campaign_id: string;
  pipeline_status?: string;
  vote_class?: string;
  search?: string;
  has_wa?: boolean;
  limit: number;
  offset: number;
};

// ── Helpers ───────────────────────────────────────────────────────────

/** Normalize phone to 9-digit Peruvian mobile suffix */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-9);
}

/** Check if a name looks like garbage (WA display name junk) */
function isJunkName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;
  // Only emojis/symbols
  if (/^[\p{Emoji}\p{Symbol}\s]+$/u.test(trimmed)) return true;
  // Known junk patterns
  const junk = /mamita|hermano|mi amor|te amo|te extra[ñn]o|bb|bebe|coraz[oó]n|papi|mami/i;
  if (junk.test(trimmed)) return true;
  // Only digits
  if (/^\d+$/.test(trimmed)) return true;
  return false;
}

/** Pick the best name from candidates */
export function pickBestName(current: string, ...candidates: (string | null | undefined)[]): string {
  // If current is already good, keep it
  if (current && !isJunkName(current)) return current;
  for (const c of candidates) {
    if (c && c.trim().length >= 2 && !isJunkName(c)) return c.trim();
  }
  return current; // fallback to whatever we have
}

// ── Repository ────────────────────────────────────────────────────────

export async function list(filters: ListFilters): Promise<{ items: VoterProfile[]; total: number }> {
  const conditions = ["vp.campaign_id = $1"];
  const params: unknown[] = [filters.campaign_id];
  let idx = 2;

  if (filters.pipeline_status) {
    conditions.push(`vp.pipeline_status = $${idx}`);
    params.push(filters.pipeline_status);
    idx++;
  }
  if (filters.vote_class) {
    conditions.push(`vp.vote_class = $${idx}`);
    params.push(filters.vote_class);
    idx++;
  }
  if (filters.search) {
    conditions.push(`(
      vp.canonical_name ILIKE $${idx}
      OR vp.canonical_phone LIKE $${idx + 1}
      OR vp.zona ILIKE $${idx}
      OR vp.distrito ILIKE $${idx}
    )`);
    params.push(`%${filters.search}%`, `%${filters.search}%`);
    idx += 2;
  }
  if (filters.has_wa) {
    conditions.push("(vp.wa_sent_count > 0 OR vp.wa_received_count > 0)");
  }

  const where = conditions.join(" AND ");

  const [countRes, dataRes] = await Promise.all([
    pool.query<{ cnt: string }>(`SELECT COUNT(*) as cnt FROM voter_profiles vp WHERE ${where}`, params),
    pool.query<VoterProfile>(
      `SELECT vp.* FROM voter_profiles vp
       WHERE ${where}
       ORDER BY vp.updated_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, filters.limit, filters.offset],
    ),
  ]);

  return {
    items: dataRes.rows,
    total: parseInt(countRes.rows[0]?.cnt ?? "0", 10),
  };
}

export async function getById(id: string): Promise<VoterProfile | null> {
  const res = await pool.query<VoterProfile>(
    "SELECT * FROM voter_profiles WHERE id = $1",
    [id],
  );
  return res.rows[0] ?? null;
}

export async function getStats(campaignId: string): Promise<VoterProfileStats> {
  const res = await pool.query<{
    total: string;
    by_status: string;
    by_vote_class: string;
    with_responses: string;
    with_wa_contact: string;
  }>(`
    SELECT
      COUNT(*) as total,
      jsonb_object_agg(
        COALESCE(NULLIF(pipeline_status, ''), 'nuevo'),
        cnt
      ) as by_status,
      jsonb_object_agg(
        COALESCE(NULLIF(vote_class, ''), 'sin_clasificar'),
        vcnt
      ) as by_vote_class,
      SUM(CASE WHEN wa_received_count > 0 THEN 1 ELSE 0 END) as with_responses,
      SUM(CASE WHEN wa_sent_count > 0 THEN 1 ELSE 0 END) as with_wa_contact
    FROM (
      SELECT
        pipeline_status,
        vote_class,
        wa_received_count,
        wa_sent_count,
        COUNT(*) OVER (PARTITION BY COALESCE(NULLIF(pipeline_status, ''), 'nuevo')) as cnt,
        COUNT(*) OVER (PARTITION BY COALESCE(NULLIF(vote_class, ''), 'sin_clasificar')) as vcnt
      FROM voter_profiles
      WHERE campaign_id = $1
    ) sub
  `, [campaignId]);

  // Fallback: compute stats with simpler queries if the aggregate is tricky
  const simpleRes = await pool.query<{ pipeline_status: string; cnt: string }>(`
    SELECT COALESCE(NULLIF(pipeline_status, ''), 'nuevo') as pipeline_status, COUNT(*) as cnt
    FROM voter_profiles WHERE campaign_id = $1
    GROUP BY 1
  `, [campaignId]);

  const voteRes = await pool.query<{ vote_class: string; cnt: string }>(`
    SELECT COALESCE(NULLIF(vote_class, ''), 'sin_clasificar') as vote_class, COUNT(*) as cnt
    FROM voter_profiles WHERE campaign_id = $1
    GROUP BY 1
  `, [campaignId]);

  const totalsRes = await pool.query<{ total: string; with_responses: string; with_wa_contact: string }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN wa_received_count > 0 THEN 1 ELSE 0 END) as with_responses,
      SUM(CASE WHEN wa_sent_count > 0 THEN 1 ELSE 0 END) as with_wa_contact
    FROM voter_profiles WHERE campaign_id = $1
  `, [campaignId]);

  const byStatus: Record<string, number> = {};
  for (const r of simpleRes.rows) byStatus[r.pipeline_status] = parseInt(r.cnt, 10);

  const byVote: Record<string, number> = {};
  for (const r of voteRes.rows) byVote[r.vote_class] = parseInt(r.cnt, 10);

  const t = totalsRes.rows[0];
  return {
    total: parseInt(t?.total ?? "0", 10),
    by_status: byStatus,
    by_vote_class: byVote,
    with_responses: parseInt(t?.with_responses ?? "0", 10),
    with_wa_contact: parseInt(t?.with_wa_contact ?? "0", 10),
  };
}

/** Upsert a voter profile — used when new data arrives (form submission, conversation, etc.) */
export async function upsert(data: {
  campaign_id: string;
  phone: string;
  name?: string;
  zona?: string;
  distrito?: string;
  submission_id?: string;
  conversation_id?: number;
  jid?: string;
  captured_by?: string;
  contacted_by?: string;
  lat?: number;
  lng?: number;
}): Promise<VoterProfile> {
  const canon = normalizePhone(data.phone);
  if (canon.length !== 9 || canon === "987654321") {
    throw new Error(`Invalid phone for voter profile: ${data.phone}`);
  }

  const cleanName = data.name && !isJunkName(data.name) ? data.name.trim() : "";

  const res = await pool.query<VoterProfile>(`
    INSERT INTO voter_profiles (
      campaign_id, canonical_phone, canonical_name, zona, distrito,
      source_submission_ids, source_conversation_ids, jids,
      captured_by, contacted_by, last_lat, last_lng
    ) VALUES (
      $1, $2, $3, COALESCE($4, ''), COALESCE($5, ''),
      CASE WHEN $6::uuid IS NOT NULL THEN ARRAY[$6::uuid] ELSE '{}' END,
      CASE WHEN $7::bigint IS NOT NULL THEN ARRAY[$7::bigint] ELSE '{}' END,
      CASE WHEN $8::text IS NOT NULL AND $8 != '' THEN ARRAY[$8::text] ELSE '{}' END,
      CASE WHEN $9::uuid IS NOT NULL THEN ARRAY[$9::uuid] ELSE '{}' END,
      CASE WHEN $10::uuid IS NOT NULL THEN ARRAY[$10::uuid] ELSE '{}' END,
      $11, $12
    )
    ON CONFLICT (campaign_id, canonical_phone)
    DO UPDATE SET
      canonical_name = CASE
        WHEN EXCLUDED.canonical_name != '' AND (voter_profiles.canonical_name = '' OR voter_profiles.canonical_name = voter_profiles.canonical_phone)
        THEN EXCLUDED.canonical_name
        ELSE voter_profiles.canonical_name
      END,
      name_variants = CASE
        WHEN EXCLUDED.canonical_name != '' AND NOT (EXCLUDED.canonical_name = ANY(voter_profiles.name_variants))
        THEN voter_profiles.name_variants || EXCLUDED.canonical_name
        ELSE voter_profiles.name_variants
      END,
      zona = CASE WHEN voter_profiles.zona = '' AND EXCLUDED.zona != '' THEN EXCLUDED.zona ELSE voter_profiles.zona END,
      distrito = CASE WHEN voter_profiles.distrito = '' AND EXCLUDED.distrito != '' THEN EXCLUDED.distrito ELSE voter_profiles.distrito END,
      source_submission_ids = CASE
        WHEN $6::uuid IS NOT NULL AND NOT ($6::uuid = ANY(voter_profiles.source_submission_ids))
        THEN voter_profiles.source_submission_ids || $6::uuid
        ELSE voter_profiles.source_submission_ids
      END,
      source_conversation_ids = CASE
        WHEN $7::bigint IS NOT NULL AND NOT ($7::bigint = ANY(voter_profiles.source_conversation_ids))
        THEN voter_profiles.source_conversation_ids || $7::bigint
        ELSE voter_profiles.source_conversation_ids
      END,
      jids = CASE
        WHEN $8::text IS NOT NULL AND $8 != '' AND NOT ($8::text = ANY(voter_profiles.jids))
        THEN voter_profiles.jids || $8::text
        ELSE voter_profiles.jids
      END,
      captured_by = CASE
        WHEN $9::uuid IS NOT NULL AND NOT ($9::uuid = ANY(voter_profiles.captured_by))
        THEN voter_profiles.captured_by || $9::uuid
        ELSE voter_profiles.captured_by
      END,
      contacted_by = CASE
        WHEN $10::uuid IS NOT NULL AND NOT ($10::uuid = ANY(voter_profiles.contacted_by))
        THEN voter_profiles.contacted_by || $10::uuid
        ELSE voter_profiles.contacted_by
      END,
      last_lat = COALESCE($11, voter_profiles.last_lat),
      last_lng = COALESCE($12, voter_profiles.last_lng),
      updated_at = now()
    RETURNING *
  `, [
    data.campaign_id,
    canon,
    cleanName,
    data.zona ?? null,
    data.distrito ?? null,
    data.submission_id ?? null,
    data.conversation_id ?? null,
    data.jid ?? null,
    data.captured_by ?? null,
    data.contacted_by ?? null,
    data.lat ?? null,
    data.lng ?? null,
  ]);

  return res.rows[0];
}

/** Update a voter profile (manual edits from dashboard) */
export async function update(
  id: string,
  data: Partial<{
    canonical_name: string;
    zona: string;
    distrito: string;
    departamento: string;
    provincia: string;
    domicilio: string;
    local_votacion: string;
    vote_class: string;
    vote_class_source: string;
    pipeline_status: string;
    category: string;
    signal_score: number;
    tags: string[];
    notes: string;
  }>,
): Promise<VoterProfile | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (key === "tags") {
        sets.push(`${key} = $${idx}::text[]`);
      } else {
        sets.push(`${key} = $${idx}`);
      }
      params.push(value);
      idx++;
    }
  }

  if (sets.length === 0) return getById(id);

  sets.push(`updated_at = now()`);
  params.push(id);

  const res = await pool.query<VoterProfile>(
    `UPDATE voter_profiles SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params,
  );
  return res.rows[0] ?? null;
}

/** Update pipeline status with automatic timestamp tracking */
export async function updatePipelineStatus(
  id: string,
  newStatus: string,
  operatorId?: string,
): Promise<VoterProfile | null> {
  const timeField =
    newStatus === "contactado" ? "last_contacted_at" :
    newStatus === "respondido" ? "last_responded_at" :
    null;

  const operatorUpdate = operatorId
    ? `, contacted_by = CASE WHEN NOT ($3::uuid = ANY(contacted_by)) THEN contacted_by || $3::uuid ELSE contacted_by END`
    : "";

  const params: unknown[] = [newStatus, id];
  if (operatorId) params.push(operatorId);

  const res = await pool.query<VoterProfile>(
    `UPDATE voter_profiles SET
      pipeline_status = $1,
      ${timeField ? `${timeField} = now(),` : ""}
      updated_at = now()
      ${operatorUpdate}
    WHERE id = $2 RETURNING *`,
    params,
  );
  return res.rows[0] ?? null;
}

/** Increment WA message counts for a voter profile by phone */
export async function incrementWaCounts(
  campaignId: string,
  phone: string,
  sent: number,
  received: number,
): Promise<void> {
  const canon = normalizePhone(phone);
  if (canon.length !== 9) return;

  await pool.query(`
    UPDATE voter_profiles SET
      wa_sent_count = wa_sent_count + $3,
      wa_received_count = wa_received_count + $4,
      updated_at = now()
    WHERE campaign_id = $1 AND canonical_phone = $2
  `, [campaignId, canon, sent, received]);
}
