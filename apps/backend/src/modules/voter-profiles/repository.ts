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
  const [simpleRes, voteRes, totalsRes] = await Promise.all([
    pool.query<{ pipeline_status: string; cnt: string }>(
      `SELECT COALESCE(NULLIF(pipeline_status, ''), 'nuevo') as pipeline_status, COUNT(*) as cnt
       FROM voter_profiles WHERE campaign_id = $1
       GROUP BY 1`,
      [campaignId],
    ),
    pool.query<{ vote_class: string; cnt: string }>(
      `SELECT COALESCE(NULLIF(vote_class, ''), 'sin_clasificar') as vote_class, COUNT(*) as cnt
       FROM voter_profiles WHERE campaign_id = $1
       GROUP BY 1`,
      [campaignId],
    ),
    pool.query<{ total: string; with_responses: string; with_wa_contact: string }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN wa_received_count > 0 THEN 1 ELSE 0 END) as with_responses,
         SUM(CASE WHEN wa_sent_count > 0 THEN 1 ELSE 0 END) as with_wa_contact
       FROM voter_profiles WHERE campaign_id = $1`,
      [campaignId],
    ),
  ]);

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

  const profile = res.rows[0];
  if (!profile) throw new Error("upsertByPhone: RETURNING yielded no row");
  return profile;
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

// ── Engagement state machine ─────────────────────────────────────────
//
// Estados manejados en pipeline_status:
//   'nuevo'             — perfil creado, sin actividad WA
//   'pendiente_envio'   — el ciudadano escaneó un QR pero todavía no llegó
//                         su primer mensaje a wa-events
//   'comparte'          — primer inbound recibido (compartió el contacto)
//   'no_comparte'       — escaneó pero pasó X tiempo sin que llegue inbound
//                         (TODO en cron job, no implementado todavía)
//   'responde'          — respondió a un mensaje saliente nuestro
//   'no_responde'       — le mandamos algo y no contestó tras N horas
//   'fidelizado'        — engagement_score >= FIDELIZADO_THRESHOLD
//   'invalido'          — phone bouncea o el contacto pidió baja
//
// Estados legacy (compatibles): 'contactado', 'respondido', 'comprometido'.
//
// Reglas de transición (las aplica `applyEngagementTransition`):
//   inbound + estado in {nuevo, pendiente_envio}  → comparte
//   inbound + último mensaje fue outbound          → responde
//   outbound + estado in {nuevo, pendiente_envio}  → contactado
//                                                    (deja la puerta abierta
//                                                    a que después llegue
//                                                    'responde' o 'no_responde')
//   engagement_score >= threshold (any direction)  → fidelizado
//
// La promoción a 'fidelizado' es terminal: una vez fidelizado, no rebaja.

export type EngagementDirection = "in" | "out";

/**
 * Marca un perfil como `pendiente_envio`. Usado por /api/q/:token cuando el
 * ciudadano escaneó pero todavía no se envió mensaje en WhatsApp. Idempotente:
 * solo aplica si el perfil está en 'nuevo' (no degrada estados posteriores).
 */
export async function markPendingEnvio(campaignId: string, phone: string): Promise<void> {
  const canon = normalizePhone(phone);
  if (canon.length !== 9 || canon === "987654321") return;

  await pool.query(`
    UPDATE voter_profiles SET
      pipeline_status    = 'pendiente_envio',
      last_engagement_at = now(),
      updated_at         = now()
    WHERE campaign_id = $1
      AND canonical_phone = $2
      AND pipeline_status IN ('', 'nuevo')
  `, [campaignId, canon]);
}

/**
 * Aplica la transición de engagement al recibir/enviar un mensaje WA.
 * Llamada desde wa-events después del upsert del perfil.
 *
 * Atómico: usa CTE para leer el perfil + decidir nuevo estado en un solo UPDATE.
 * Promueve a fidelizado si engagement_score (post-incremento) >= threshold.
 */
export async function applyEngagementTransition(
  profileId: string,
  direction: EngagementDirection,
  fidelizadoThreshold: number,
): Promise<{ pipeline_status: string; engagement_score: number } | null> {
  // Reglas:
  //   inbound  → si estado ∈ {nuevo, pendiente_envio} ⇒ comparte
  //              si estado ∈ {comparte, contactado, no_responde, no_comparte} ⇒ responde
  //   outbound → si estado ∈ {nuevo, pendiente_envio} ⇒ contactado
  //              (no degrada respond/comparte/fidelizado)
  //   any      → engagement_score++; si llega al threshold ⇒ fidelizado
  //
  // 'fidelizado' nunca rebaja; 'invalido' tampoco se toca acá.
  const sql = `
    WITH bumped AS (
      UPDATE voter_profiles SET
        engagement_score   = engagement_score + 1,
        last_engagement_at = now(),
        updated_at         = now()
      WHERE id = $1
      RETURNING id, pipeline_status, engagement_score
    ),
    transition AS (
      SELECT
        id,
        engagement_score,
        CASE
          WHEN engagement_score >= $3                          THEN 'fidelizado'
          WHEN pipeline_status IN ('fidelizado', 'invalido')   THEN pipeline_status
          WHEN $2 = 'in'  AND pipeline_status IN ('', 'nuevo', 'pendiente_envio')
                                                                THEN 'comparte'
          WHEN $2 = 'in'  AND pipeline_status IN ('comparte', 'contactado', 'no_responde', 'no_comparte')
                                                                THEN 'responde'
          WHEN $2 = 'out' AND pipeline_status IN ('', 'nuevo', 'pendiente_envio')
                                                                THEN 'contactado'
          ELSE pipeline_status
        END AS next_status
      FROM bumped
    )
    UPDATE voter_profiles SET
      pipeline_status = transition.next_status,
      updated_at      = now()
    FROM transition
    WHERE voter_profiles.id = transition.id
    RETURNING voter_profiles.pipeline_status, voter_profiles.engagement_score
  `;

  const res = await pool.query<{ pipeline_status: string; engagement_score: number }>(
    sql,
    [profileId, direction, fidelizadoThreshold],
  );
  return res.rows[0] ?? null;
}

/**
 * Cron-style sweep: marca como 'no_responde' los perfiles a los que les enviamos
 * algo (status='contactado') y no respondieron en `hours` horas.
 * Devuelve el número de perfiles afectados.
 */
export async function sweepNoResponde(hours: number): Promise<number> {
  const res = await pool.query(`
    UPDATE voter_profiles SET
      pipeline_status = 'no_responde',
      updated_at      = now()
    WHERE pipeline_status = 'contactado'
      AND last_contacted_at IS NOT NULL
      AND last_contacted_at < now() - ($1::int * INTERVAL '1 hour')
      AND (last_responded_at IS NULL OR last_responded_at < last_contacted_at)
  `, [hours]);
  return res.rowCount ?? 0;
}

/**
 * Cron-style sweep: marca como 'no_comparte' los pendientes que llevan
 * `hours` horas sin inbound (escanearon el QR pero nunca enviaron).
 */
export async function sweepNoComparte(hours: number): Promise<number> {
  const res = await pool.query(`
    UPDATE voter_profiles SET
      pipeline_status = 'no_comparte',
      updated_at      = now()
    WHERE pipeline_status = 'pendiente_envio'
      AND last_engagement_at IS NOT NULL
      AND last_engagement_at < now() - ($1::int * INTERVAL '1 hour')
  `, [hours]);
  return res.rowCount ?? 0;
}

/**
 * Setea ai_classification y mergea tags devueltas por el módulo ai/.
 * Tags son union-merge (no se sobreescriben las existentes manuales).
 */
export async function setAiClassification(
  profileId: string,
  classification: {
    category?: string;
    vote_class?: string;
    confidence?: number;
    reason?: string;
    model?: string;
  },
  tagsToMerge: string[],
): Promise<void> {
  const aiPayload = {
    ...classification,
    classified_at: new Date().toISOString(),
  };

  // Sanitiza: tags como strings cortos, sin duplicados, sin vacíos.
  const cleanTags = Array.from(
    new Set(
      tagsToMerge
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 60),
    ),
  );

  await pool.query(`
    UPDATE voter_profiles SET
      ai_classification = $2::jsonb,
      tags              = ARRAY(SELECT DISTINCT unnest(tags || $3::text[])),
      vote_class        = CASE
        WHEN COALESCE(vote_class, '') = '' AND $4::text != ''
        THEN $4::text
        ELSE vote_class
      END,
      vote_class_source = CASE
        WHEN COALESCE(vote_class, '') = '' AND $4::text != ''
        THEN 'auto'
        ELSE vote_class_source
      END,
      category          = CASE
        WHEN COALESCE(category, '') = '' AND $5::text != ''
        THEN $5::text
        ELSE category
      END,
      confidence        = COALESCE($6::real, confidence),
      updated_at        = now()
    WHERE id = $1
  `, [
    profileId,
    JSON.stringify(aiPayload),
    cleanTags,
    classification.vote_class ?? "",
    classification.category ?? "",
    classification.confidence ?? null,
  ]);
}

/** Devuelve el perfil por (campaign_id, phone) o null. Útil para hooks de wa-events. */
export async function findByPhone(campaignId: string, phone: string): Promise<VoterProfile | null> {
  const canon = normalizePhone(phone);
  if (canon.length !== 9) return null;
  const res = await pool.query<VoterProfile>(
    "SELECT * FROM voter_profiles WHERE campaign_id = $1 AND canonical_phone = $2",
    [campaignId, canon],
  );
  return res.rows[0] ?? null;
}
