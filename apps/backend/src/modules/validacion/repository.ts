import { pool } from "../../db";
import type { ValidationRow, ValidationStatus, ClassificationEventRow, ClassificationSource, ScorerConfigInput } from "./schemas";


/* ─── Ensure table ─── */

export async function ensureValidacionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_validations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id text NOT NULL,
      campaign_id uuid NOT NULL REFERENCES campaigns(id),
      nombre text NOT NULL DEFAULT '',
      telefono text NOT NULL DEFAULT '',
      encuestador text NOT NULL DEFAULT '',
      zona text NOT NULL DEFAULT '',
      form_created_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT 'pendiente',
      notes text,
      tags text[] NOT NULL DEFAULT '{}',
      score int NOT NULL DEFAULT 0,
      vote_class text NOT NULL DEFAULT '',
      claimed_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // Add columns if table already existed without them
  await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS vote_class text NOT NULL DEFAULT ''`);
  // Unique per phone per campaign (dedup across forms + form_submissions)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_form_validations_phone_campaign
    ON form_validations(telefono, campaign_id)
  `);
  // Index for fast campaign queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_form_validations_campaign
    ON form_validations(campaign_id, status)
  `);
}

/* ─── Sync: populate validations from forms + form_submissions ─── */

export async function syncValidations(campaignId: string): Promise<number> {
  const result = await pool.query<{ cnt: string }>(`
    WITH source AS (
      -- Legacy forms
      SELECT
        id::text as form_id,
        campaign_id,
        nombre,
        telefono,
        encuestador,
        zona,
        created_at as form_created_at
      FROM forms
      WHERE campaign_id = $1 AND deleted_at IS NULL
        AND telefono IS NOT NULL AND telefono != ''
      
      UNION ALL

      -- New form_submissions
      SELECT
        fs.id::text as form_id,
        fs.campaign_id,
        COALESCE(fs.data->>'nombre', fs.data->>'Nombre Completo', '') as nombre,
        COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', '') as telefono,
        COALESCE(fs.data->>'encuestador', u.full_name, 'Agente') as encuestador,
        COALESCE(fs.data->>'zona', 'Sin zona') as zona,
        fs.created_at as form_created_at
      FROM form_submissions fs
      LEFT JOIN users u ON u.id = fs.submitted_by
      WHERE fs.campaign_id = $1 AND fs.deleted_at IS NULL
        AND COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', '') != ''
    ),
    deduped AS (
      SELECT DISTINCT ON (telefono, campaign_id)
        form_id, campaign_id, nombre, telefono, encuestador, zona, form_created_at
      FROM source
      ORDER BY telefono, campaign_id, form_created_at DESC
    )
    INSERT INTO form_validations (form_id, campaign_id, nombre, telefono, encuestador, zona, form_created_at)
    SELECT form_id, campaign_id, nombre, telefono, encuestador, zona, form_created_at
    FROM deduped
    ON CONFLICT (telefono, campaign_id) DO UPDATE SET
      form_id = EXCLUDED.form_id,
      nombre = EXCLUDED.nombre,
      encuestador = EXCLUDED.encuestador,
      zona = EXCLUDED.zona
    RETURNING id
  `, [campaignId]);
  return result.rowCount ?? 0;
}

/* ─── List validations by campaign ─── */

export async function listByCampaign(
  campaignId: string,
  status?: ValidationStatus,
  limit = 100,
  offset = 0,
): Promise<ValidationRow[]> {
  const params: unknown[] = [campaignId];
  let where = "WHERE fv.campaign_id = $1";

  if (status) {
    params.push(status);
    where += ` AND fv.status = $${params.length}`;
  }

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const query = `
    SELECT
      fv.id, fv.form_id, fv.campaign_id::text,
      fv.nombre, fv.telefono, fv.encuestador, fv.zona,
      pd.nomdep as departamento,
      fv.form_created_at as created_at,
      fv.status, fv.notes,
      COALESCE(fv.tags, '{}') as tags,
      COALESCE(fv.score, 0) as score,
      COALESCE(fv.vote_class, '') as vote_class,
      fv.claimed_by::text,
      cu.full_name as claimed_by_name,
      fv.updated_at
    FROM form_validations fv
    LEFT JOIN users cu ON cu.id = fv.claimed_by
    LEFT JOIN form_submissions fs ON fs.id::text = fv.form_id
    LEFT JOIN peru_departamentos pd ON pd.coddep = LEFT(fs.ubigeo_distrito, 2)
    ${where}
    ORDER BY fv.form_created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query<ValidationRow>(query, params);
  return rows;
}

export async function countByCampaign(
  campaignId: string,
  status?: ValidationStatus,
): Promise<number> {
  const params: unknown[] = [campaignId];
  let where = "WHERE campaign_id = $1";

  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM form_validations ${where}`,
    params,
  );
  return Number(rows[0]?.cnt ?? 0);
}

/* ─── Stats ─── */

export async function statsByCampaign(campaignId: string) {
  const { rows } = await pool.query<{ status: string; count: string }>(`
    SELECT status, count(*)::text as count
    FROM form_validations
    WHERE campaign_id = $1
    GROUP BY status
  `, [campaignId]);

  const stats: Record<string, number> = { pendiente: 0, contactado: 0, respondido: 0, invalido: 0 };
  for (const r of rows) stats[r.status] = Number(r.count);
  // Merge legacy 'validado' into 'respondido'
  if (stats.validado) { stats.respondido = (stats.respondido ?? 0) + stats.validado; delete stats.validado; }
  return stats;
}

/* ─── Stats by encuestador (brigadista ranking) ─── */

export interface EncuestadorStats {
  encuestador: string;
  total: number;
  pendiente: number;
  contactado: number;
  respondido: number;
  invalido: number;
  voto_duro: number;
  voto_blando: number;
  voto_flotante: number;
  tasa_invalido: number;
  tasa_validado: number;
}

export async function statsByEncuestador(campaignId: string): Promise<EncuestadorStats[]> {
  const { rows } = await pool.query<{
    encuestador: string;
    total: string;
    pendiente: string;
    contactado: string;
    respondido: string;
    invalido: string;
    voto_duro: string;
    voto_blando: string;
    voto_flotante: string;
  }>(`
    SELECT
      encuestador,
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE status = 'pendiente')::text AS pendiente,
      COUNT(*) FILTER (WHERE status = 'contactado')::text AS contactado,
      COUNT(*) FILTER (WHERE status = 'respondido' OR status = 'validado')::text AS respondido,
      COUNT(*) FILTER (WHERE status = 'invalido')::text AS invalido,
      COUNT(*) FILTER (WHERE vote_class = 'duro')::text AS voto_duro,
      COUNT(*) FILTER (WHERE vote_class = 'blando')::text AS voto_blando,
      COUNT(*) FILTER (WHERE vote_class = 'flotante')::text AS voto_flotante
    FROM form_validations
    WHERE campaign_id = $1
      AND encuestador IS NOT NULL AND encuestador != ''
    GROUP BY encuestador
    ORDER BY COUNT(*) FILTER (WHERE status = 'invalido') DESC, COUNT(*) DESC
  `, [campaignId]);

  return rows.map((r: { encuestador: string; total: string; pendiente: string; contactado: string; respondido: string; invalido: string; voto_duro: string; voto_blando: string; voto_flotante: string }) => {
    const total = Number(r.total);
    const invalido = Number(r.invalido);
    const respondido = Number(r.respondido);
    const procesados = Number(r.contactado) + respondido + invalido;
    return {
      encuestador: r.encuestador,
      total,
      pendiente: Number(r.pendiente),
      contactado: Number(r.contactado),
      respondido,
      invalido,
      voto_duro: Number(r.voto_duro),
      voto_blando: Number(r.voto_blando),
      voto_flotante: Number(r.voto_flotante),
      tasa_invalido: total > 0 ? Math.round((invalido / total) * 1000) / 10 : 0,
      tasa_validado: procesados > 0 ? Math.round((respondido / procesados) * 1000) / 10 : 0,
    };
  });
}

/* ─── Lookup by phone ─── */

export async function lookupByPhone(
  campaignId: string,
  phone: string,
): Promise<ValidationRow | null> {
  // Normalize: strip non-digits, try with/without country code prefix
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;

  // Try exact match, then suffix match (last 9 digits — Peru mobile format)
  const suffix = digits.slice(-9);

  const { rows } = await pool.query<ValidationRow>(`
    SELECT
      fv.id, fv.form_id, fv.campaign_id::text,
      fv.nombre, fv.telefono, fv.encuestador, fv.zona,
      pd.nomdep as departamento,
      fv.form_created_at as created_at,
      fv.status, fv.notes,
      COALESCE(fv.tags, '{}') as tags,
      COALESCE(fv.score, 0) as score,
      COALESCE(fv.vote_class, '') as vote_class,
      fv.claimed_by::text,
      cu.full_name as claimed_by_name,
      fv.updated_at
    FROM form_validations fv
    LEFT JOIN users cu ON cu.id = fv.claimed_by
    LEFT JOIN form_submissions fs ON fs.id::text = fv.form_id
    LEFT JOIN peru_departamentos pd ON pd.coddep = LEFT(fs.ubigeo_distrito, 2)
    WHERE fv.campaign_id = $1
      AND (
        fv.telefono = $2
        OR fv.telefono = $3
        OR RIGHT(fv.telefono, 9) = $4
      )
    ORDER BY fv.updated_at DESC
    LIMIT 1
  `, [campaignId, digits, phone, suffix]);

  return rows[0] ?? null;
}

/* ─── Update status ─── */

export async function updateStatus(
  id: string,
  campaignId: string,
  status: ValidationStatus,
  notes: string | null,
  userId: string,
  vote_class?: string | null,
): Promise<ValidationRow | null> {
  const finalVoteClass = vote_class ?? "";

  const { rows } = await pool.query<ValidationRow>(`
    UPDATE form_validations
    SET status = $3,
        notes = COALESCE($4, notes),
        claimed_by = $5,
        tags = $6,
        score = $7,
        vote_class = $8,
        updated_at = now()
    WHERE id = $1 AND campaign_id = $2
    RETURNING
      id, form_id, campaign_id::text, nombre, telefono, encuestador, zona,
      NULL::text as departamento,
      form_created_at as created_at, status, notes, tags, score, vote_class,
      claimed_by::text, NULL::text as claimed_by_name, updated_at
  `, [id, campaignId, status, notes, userId, [], 0, finalVoteClass]);
  return rows[0] ?? null;
}

/* ─── Claim a contact ─── */

export async function claim(
  id: string,
  campaignId: string,
  userId: string,
): Promise<ValidationRow | null> {
  const { rows } = await pool.query<ValidationRow>(`
    UPDATE form_validations
    SET claimed_by = $3, updated_at = now()
    WHERE id = $1 AND campaign_id = $2
      AND (claimed_by IS NULL OR claimed_by = $3)
    RETURNING
      id, form_id, campaign_id::text, nombre, telefono, encuestador, zona,
      NULL::text as departamento,
      form_created_at as created_at, status, notes,
      COALESCE(tags, '{}') as tags, COALESCE(score, 0) as score,
      COALESCE(vote_class, '') as vote_class,
      claimed_by::text, NULL::text as claimed_by_name, updated_at
  `, [id, campaignId, userId]);
  return rows[0] ?? null;
}


// ═══════════════════════════════════════════════════════════════════════
// CLASSIFICATION EVENTS
// ═══════════════════════════════════════════════════════════════════════

/* ─── Ensure classification_events table ─── */

export async function ensureClassificationEventsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classification_events (
      id            BIGSERIAL    PRIMARY KEY,
      campaign_id   UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      operator_id   UUID         NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
      validation_id UUID         REFERENCES form_validations(id)   ON DELETE SET NULL,
      phone         TEXT,
      contact_name  TEXT,
      message_text  TEXT         NOT NULL DEFAULT '',
      source        TEXT         NOT NULL DEFAULT 'auto',
      category      TEXT         NOT NULL DEFAULT '',
      vote_class    TEXT         NOT NULL DEFAULT '',
      status        TEXT         NOT NULL DEFAULT '',
      confidence    REAL         NOT NULL DEFAULT 0,
      reason        TEXT         NOT NULL DEFAULT '',
      corrected_vote_class TEXT,
      corrected_status     TEXT,
      corrected_by         UUID     REFERENCES users(id) ON DELETE SET NULL,
      corrected_at         TIMESTAMPTZ,
      original_event_id    BIGINT  REFERENCES classification_events(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_classification_events_campaign ON classification_events(campaign_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_classification_events_phone ON classification_events(campaign_id, phone)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_classification_events_validation ON classification_events(validation_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_classification_events_source ON classification_events(campaign_id, source)`);
}

/* ─── Insert classification event ─── */

export async function insertClassificationEvent(
  campaignId: string,
  operatorId: string,
  data: {
    phone?: string;
    contact_name?: string;
    message_text?: string;
    validation_id?: string;
    source: ClassificationSource;
    category?: string;
    vote_class?: string;
    status?: string;
    confidence?: number;
    reason?: string;
  },
): Promise<ClassificationEventRow> {
  const { rows } = await pool.query<ClassificationEventRow>(`
    INSERT INTO classification_events
      (campaign_id, operator_id, validation_id, phone, contact_name, message_text,
       source, category, vote_class, status, confidence, reason)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING
      id::text, campaign_id::text, operator_id::text,
      validation_id::text, phone, contact_name, message_text,
      source, category, vote_class, status, confidence, reason,
      corrected_vote_class, corrected_status, corrected_by::text,
      NULL::text as corrected_by_name,
      corrected_at::text, original_event_id::text, created_at::text,
      NULL::text as nombre, NULL::text as operator_name
  `, [
    campaignId,
    operatorId,
    data.validation_id || null,
    data.phone || null,
    data.contact_name || null,
    data.message_text || "",
    data.source,
    data.category || "",
    data.vote_class || "",
    data.status || "",
    data.confidence ?? 0,
    data.reason || "",
  ]);
  return rows[0]!;
}

/* ─── List classification events (paginated) ─── */

export async function listClassificationEvents(
  campaignId: string,
  limit = 50,
  offset = 0,
  filters?: { source?: string; category?: string; vote_class?: string },
): Promise<{ items: ClassificationEventRow[]; total: number }> {
  const params: unknown[] = [campaignId];
  const conditions = ["ce.campaign_id = $1"];

  if (filters?.source) {
    params.push(filters.source);
    conditions.push(`ce.source = $${params.length}`);
  }
  if (filters?.category) {
    params.push(filters.category);
    conditions.push(`ce.category = $${params.length}`);
  }
  if (filters?.vote_class) {
    params.push(filters.vote_class);
    conditions.push(`ce.vote_class = $${params.length}`);
  }

  const where = conditions.join(" AND ");

  // Count
  const countRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM classification_events ce WHERE ${where}`,
    params,
  );
  const total = Number(countRes.rows[0]?.cnt ?? 0);

  // Items with JOINs
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  params.push(limit, offset);

  const { rows } = await pool.query<ClassificationEventRow>(`
    SELECT
      ce.id::text, ce.campaign_id::text, ce.operator_id::text,
      u.full_name as operator_name,
      ce.validation_id::text, ce.phone, ce.contact_name, ce.message_text,
      ce.source, ce.category, ce.vote_class, ce.status, ce.confidence, ce.reason,
      ce.corrected_vote_class, ce.corrected_status,
      ce.corrected_by::text,
      cb.full_name as corrected_by_name,
      ce.corrected_at::text,
      ce.original_event_id::text,
      ce.created_at::text,
      fv.nombre
    FROM classification_events ce
    LEFT JOIN users u ON u.id = ce.operator_id
    LEFT JOIN users cb ON cb.id = ce.corrected_by
    LEFT JOIN form_validations fv ON fv.id = ce.validation_id
    WHERE ${where}
    ORDER BY ce.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  return { items: rows, total };
}

/* ─── Correct a classification event ─── */

export async function correctClassificationEvent(
  eventId: string,
  campaignId: string,
  correctedBy: string,
  correctedVoteClass: string,
  correctedStatus: string,
): Promise<ClassificationEventRow | null> {
  const { rows } = await pool.query<ClassificationEventRow>(`
    UPDATE classification_events
    SET corrected_vote_class = $3,
        corrected_status = $4,
        corrected_by = $5,
        corrected_at = now()
    WHERE id = $1::bigint AND campaign_id = $2
    RETURNING
      id::text, campaign_id::text, operator_id::text,
      NULL::text as operator_name,
      validation_id::text, phone, contact_name, message_text,
      source, category, vote_class, status, confidence, reason,
      corrected_vote_class, corrected_status,
      corrected_by::text, NULL::text as corrected_by_name,
      corrected_at::text, original_event_id::text, created_at::text,
      NULL::text as nombre
  `, [eventId, campaignId, correctedVoteClass, correctedStatus, correctedBy]);
  return rows[0] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// CONVERSATION SCORE — computa score conversacional desde classification_events
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// SCORER CONFIG — per-campaign overrides de umbrales, pesos, decay
// Stored in campaigns.config.scorer_config (JSONB)
// ═══════════════════════════════════════════════════════════════════════

export interface ResolvedScorerConfig {
  threshold_duro: number;
  threshold_blando: number;
  threshold_flotante: number;
  invalido_lock_threshold: number;
  invalido_reversal_threshold: number;
  decay_half_life_ms: number;
  category_weights: Record<string, number>;
}

/** Lee la config de scorer de una campaña. Retorna null si no hay overrides. */
export async function getScorerConfig(campaignId: string): Promise<ScorerConfigInput | null> {
  const { rows } = await pool.query<{ scorer_config: unknown }>(`
    SELECT config->'scorer_config' AS scorer_config
    FROM campaigns
    WHERE id = $1
  `, [campaignId]);
  const raw = rows[0]?.scorer_config;
  if (!raw || typeof raw !== "object") return null;
  return raw as ScorerConfigInput;
}

/** Escribe la config de scorer en campaigns.config.scorer_config (merge, no reemplaza). */
export async function setScorerConfig(campaignId: string, config: ScorerConfigInput): Promise<void> {
  await pool.query(`
    UPDATE campaigns
    SET config = jsonb_set(COALESCE(config, '{}')::jsonb, '{scorer_config}', $1::jsonb),
        updated_at = now()
    WHERE id = $2
  `, [JSON.stringify(config), campaignId]);
}

/** Resuelve la config final mergeando overrides de campaña con defaults globales. */
export function resolveScorerConfig(overrides: ScorerConfigInput | null): ResolvedScorerConfig {
  const o = overrides ?? {};
  return {
    threshold_duro: o.threshold_duro ?? 2.5,
    threshold_blando: o.threshold_blando ?? 0.8,
    threshold_flotante: o.threshold_flotante ?? 0.1,
    invalido_lock_threshold: o.invalido_lock_threshold ?? INVALIDO_LOCK_THRESHOLD,
    invalido_reversal_threshold: o.invalido_reversal_threshold ?? INVALIDO_REVERSAL_THRESHOLD,
    decay_half_life_ms: (o.decay_half_life_days ?? 7) * 24 * 60 * 60 * 1000,
    category_weights: { ...CATEGORY_WEIGHTS, ...(o.category_weights ?? {}) },
  };
}

// FUENTE DE VERDAD: Si cambiás estos pesos, actualizá también CATEGORY_WEIGHTS en
// extensions/wspp-store-tester/src/background/conversation-scorer.js (extensión Chrome).
export const CATEGORY_WEIGHTS: Record<string, number> = {
  pide_dinero:          -3.0,
  pide_trabajo:         -2.5,
  publicidad_pagada:    -2.0,
  sector_salud:          2.5,
  coordinador:           3.0,
  apoyo_genuino:         2.0,
  apoyo_probable:        1.0,
  pide_merch:            2.5,
  apoyo_condicional:     1.2,
  indeciso:              0.3,
  sector_salud_indeciso: 0.5,
  ai_sector_salud:       2.5,
  ai_coordinador:        3.0,
  ai_apoyo_genuino:      2.0,
  ai_apoyo_condicional:  1.2,
  ai_indeciso:           0.3,
  ai_pide_dinero:       -3.0,
  ai_pide_trabajo:      -2.5,
  ai_publicidad_pagada: -2.0,
};

// FUENTE DE VERDAD: Si cambiás estos valores, actualizalos también en conversation-scorer.js.
export const DECAY_HALF_LIFE_MS: number = 7 * 24 * 60 * 60 * 1000; // 7 días
export const INVALIDO_LOCK_THRESHOLD: number = 2.5;
export const INVALIDO_REVERSAL_THRESHOLD: number = 3.0;

export interface ConversationScore {
  vote_class: string;
  status: string;
  confidence: number;
  score: number;
  reason: string;
  locked_invalido: boolean;
  positive_score: number;
  negative_score: number;
  signal_count: number;
}

// Mapa de voto → categoría sintética para correcciones manuales.
// Espejo de la lógica de seedConversationScore() en conversation-scorer.js.
const MANUAL_SEED_CATEGORY: Record<string, string> = {
  duro:     "apoyo_genuino",
  blando:   "apoyo_condicional",
  flotante: "indeciso",
  "":       "pide_dinero", // invalido — el negativo más fuerte
};

/**
 * Trae los últimos 20 eventos para un teléfono, combinando:
 *   - Eventos `source='auto'`: clasificaciones automáticas con su confidence real
 *   - Eventos `source='manual'` con corrección: se convierten en signals sintéticos
 *     de conf=1.0 usando la categoría correspondiente al voto corregido.
 *     Esto espeja exactamente lo que hace seedConversationScore() en la extensión.
 *
 * Los events manuales se incluyen aunque superen el LIMIT=20, porque una corrección
 * del operador siempre debe tener peso en el score final.
 *
 * Usado por computeConversationScore() y por el endpoint scorer-debug.
 */
export async function fetchRawSignalsForPhone(
  campaignId: string,
  phone: string,
): Promise<{ category: string; confidence: number; created_at: string }[]> {
  const { rows } = await pool.query<{
    category: string;
    confidence: number;
    created_at: string;
    source: string;
    corrected_vote_class: string | null;
  }>(`
    (
      -- Eventos automáticos: últimos 20
      SELECT category, confidence, created_at, source, corrected_vote_class
      FROM classification_events
      WHERE campaign_id = $1
        AND phone IS NOT NULL
        AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 9) = RIGHT(REGEXP_REPLACE($2, '\\D', '', 'g'), 9)
        AND source = 'auto'
      ORDER BY created_at DESC
      LIMIT 20
    )
    UNION ALL
    (
      -- Correcciones manuales: todas (sin límite — son pocas y valen mucho)
      SELECT category, confidence, created_at, source, corrected_vote_class
      FROM classification_events
      WHERE campaign_id = $1
        AND phone IS NOT NULL
        AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 9) = RIGHT(REGEXP_REPLACE($2, '\\D', '', 'g'), 9)
        AND source = 'manual'
        AND corrected_vote_class IS NOT NULL
    )
    ORDER BY created_at DESC
  `, [campaignId, phone]);

  // Normalizar: las correcciones manuales se convierten en signals sintéticos de conf=1.0
  return rows.map((r) => {
    if (r.source === 'manual' && r.corrected_vote_class !== null) {
      const seedCategory = MANUAL_SEED_CATEGORY[r.corrected_vote_class] ?? "indeciso";
      return { category: seedCategory, confidence: 1.0, created_at: r.created_at };
    }
    return { category: r.category, confidence: r.confidence, created_at: r.created_at };
  });
}

export async function computeConversationScore(
  campaignId: string,
  phone: string,
  configOverrides?: ResolvedScorerConfig | null,
): Promise<ConversationScore | null> {
  const rows = await fetchRawSignalsForPhone(campaignId, phone);
  if (rows.length === 0) return null;

  // Usar config de campaña si se proporcionó, sino defaults globales
  const cfg = configOverrides ?? resolveScorerConfig(null);

  const now = Date.now();
  let positiveScore = 0;
  let negativeScore = 0;

  for (const row of rows) {
    const baseWeight = cfg.category_weights[row.category] ?? 0;
    if (baseWeight === 0) continue;

    const ageMs = now - new Date(row.created_at).getTime();
    const decay = Math.pow(0.5, ageMs / cfg.decay_half_life_ms);
    const effective = baseWeight * row.confidence * decay;

    if (effective > 0) {
      positiveScore += effective;
    } else {
      negativeScore += Math.abs(effective);
    }
  }

  // Lock calculado sobre negativeScore con decay aplicado — igual que conversation-scorer.js
  const lockedInvalido = negativeScore >= cfg.invalido_lock_threshold;
  const netScore = positiveScore - negativeScore;

  if (lockedInvalido && positiveScore < cfg.invalido_reversal_threshold) {
    return {
      vote_class: "",
      status: "invalido",
      confidence: Math.min(0.95, 0.7 + negativeScore * 0.05),
      score: netScore,
      reason: `Invalido bloqueado (neg: ${negativeScore.toFixed(2)}, pos: ${positiveScore.toFixed(2)})`,
      locked_invalido: true,
      positive_score: positiveScore,
      negative_score: negativeScore,
      signal_count: rows.length,
    };
  }

  if (netScore < -0.5 && negativeScore > positiveScore) {
    return {
      vote_class: "",
      status: "invalido",
      confidence: Math.min(0.9, 0.5 + negativeScore * 0.05),
      score: netScore,
      reason: `Score negativo (neg: ${negativeScore.toFixed(2)}, pos: ${positiveScore.toFixed(2)})`,
      locked_invalido: false,
      positive_score: positiveScore,
      negative_score: negativeScore,
      signal_count: rows.length,
    };
  }

  if (netScore >= cfg.threshold_duro) {
    return { vote_class: "duro", status: "respondido", confidence: Math.min(0.95, 0.7 + netScore * 0.04), score: netScore, reason: `Score conversacional duro (${netScore.toFixed(2)})`, locked_invalido: false, positive_score: positiveScore, negative_score: negativeScore, signal_count: rows.length };
  }
  if (netScore >= cfg.threshold_blando) {
    return { vote_class: "blando", status: "respondido", confidence: Math.min(0.85, 0.55 + netScore * 0.05), score: netScore, reason: `Score conversacional blando (${netScore.toFixed(2)})`, locked_invalido: false, positive_score: positiveScore, negative_score: negativeScore, signal_count: rows.length };
  }
  if (netScore >= cfg.threshold_flotante) {
    return { vote_class: "flotante", status: "respondido", confidence: Math.min(0.7, 0.4 + netScore * 0.1), score: netScore, reason: `Score conversacional flotante (${netScore.toFixed(2)})`, locked_invalido: false, positive_score: positiveScore, negative_score: negativeScore, signal_count: rows.length };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// SCORER BOOTSTRAP — devuelve los últimos eventos por teléfono para
// precalentar el conversation-scorer de la extensión Chrome al arrancar.
// ═══════════════════════════════════════════════════════════════════════

export interface ScorerBootstrapSignal {
  phone: string;       // normalizado: últimos 9 dígitos
  category: string;
  confidence: number;
  ts: number;          // epoch ms (cliente usa para decay temporal)
}

/**
 * Lee los últimos `signalsPerPhone` eventos auto por cada teléfono único
 * de la campaña, ordenados del más reciente al más antiguo.
 * El cliente usa estos datos para sembrar su scorer local sin mensajes.
 *
 * Límites:
 *  - maxPhones: protege contra campañas con miles de teléfonos
 *  - signalsPerPhone: igual al SIGNAL_MAX_PER_PHONE de la extensión (20)
 *  - Sólo eventos `source = 'auto'` (los manuales los siembra seedConversationScore)
 *  - Sólo categorías con peso conocido (filtra ruido)
 */
export async function fetchScorerBootstrap(
  campaignId: string,
  maxPhones = 500,
  signalsPerPhone = 20,
): Promise<ScorerBootstrapSignal[]> {
  // Usamos LATERAL para traer los últimos N por teléfono en un solo query.
  // RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 9) normaliza el teléfono igual
  // que _normalizePhoneKey() en la extensión.
  const knownCategories = Object.keys(CATEGORY_WEIGHTS);
  if (knownCategories.length === 0) return [];

  // Construir lista de categorías como literales SQL seguros (son strings fijos del código)
  const catList = knownCategories.map((c) => `'${c}'`).join(", ");

  const { rows } = await pool.query<{
    phone_normalized: string;
    category: string;
    confidence: number;
    created_at: string;
  }>(`
    WITH ranked AS (
      SELECT
        RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 9) AS phone_normalized,
        category,
        confidence,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 9)
          ORDER BY created_at DESC
        ) AS rn
      FROM classification_events
      WHERE campaign_id = $1
        AND source = 'auto'
        AND phone IS NOT NULL
        AND LENGTH(REGEXP_REPLACE(phone, '\\D', '', 'g')) >= 7
        AND category IN (${catList})
    ),
    top_phones AS (
      SELECT DISTINCT phone_normalized
      FROM ranked
      WHERE rn = 1
      LIMIT $2
    )
    SELECT r.phone_normalized, r.category, r.confidence, r.created_at
    FROM ranked r
    INNER JOIN top_phones tp ON tp.phone_normalized = r.phone_normalized
    WHERE r.rn <= $3
    ORDER BY r.phone_normalized, r.created_at DESC
  `, [campaignId, maxPhones, signalsPerPhone]);

  return rows.map((r) => ({
    phone: r.phone_normalized,
    category: r.category,
    confidence: r.confidence,
    ts: new Date(r.created_at).getTime(),
  }));
}

/* ─── Classification stats (aggregated metrics) ─── */

export interface ClassificationStats {
  total: number;
  by_source: Record<string, number>;
  by_category: Record<string, number>;
  by_vote_class: Record<string, number>;
  by_status: Record<string, number>;
  corrections_count: number;
  accuracy_rate: number; // % of auto events NOT corrected
  avg_confidence: number;
  last_hour: number;
  last_24h: number;
}

export async function classificationStats(campaignId: string): Promise<ClassificationStats> {
  // All stats in a single query using CTEs
  const { rows } = await pool.query<{
    total: string;
    by_source: string;
    by_category: string;
    by_vote_class: string;
    by_status: string;
    corrections_count: string;
    auto_count: string;
    auto_corrected: string;
    avg_confidence: string;
    last_hour: string;
    last_24h: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM classification_events WHERE campaign_id = $1) AS total,
      (SELECT COALESCE(json_object_agg(source, cnt), '{}')::text
       FROM (SELECT source, COUNT(*) AS cnt FROM classification_events WHERE campaign_id = $1 GROUP BY source) t
      ) AS by_source,
      (SELECT COALESCE(json_object_agg(category, cnt), '{}')::text
       FROM (SELECT category, COUNT(*) AS cnt FROM classification_events WHERE campaign_id = $1 AND category != '' GROUP BY category) t
      ) AS by_category,
      (SELECT COALESCE(json_object_agg(vote_class, cnt), '{}')::text
       FROM (SELECT vote_class, COUNT(*) AS cnt FROM classification_events WHERE campaign_id = $1 AND vote_class != '' GROUP BY vote_class) t
      ) AS by_vote_class,
      (SELECT COALESCE(json_object_agg(status, cnt), '{}')::text
       FROM (SELECT status, COUNT(*) AS cnt FROM classification_events WHERE campaign_id = $1 AND status != '' GROUP BY status) t
      ) AS by_status,
      (SELECT COUNT(*)::text FROM classification_events WHERE campaign_id = $1 AND corrected_vote_class IS NOT NULL) AS corrections_count,
      (SELECT COUNT(*)::text FROM classification_events WHERE campaign_id = $1 AND source = 'auto') AS auto_count,
      (SELECT COUNT(*)::text FROM classification_events WHERE campaign_id = $1 AND source = 'auto' AND corrected_vote_class IS NOT NULL) AS auto_corrected,
      (SELECT COALESCE(AVG(confidence), 0)::text FROM classification_events WHERE campaign_id = $1 AND source = 'auto') AS avg_confidence,
      (SELECT COUNT(*)::text FROM classification_events WHERE campaign_id = $1 AND created_at > now() - interval '1 hour') AS last_hour,
      (SELECT COUNT(*)::text FROM classification_events WHERE campaign_id = $1 AND created_at > now() - interval '24 hours') AS last_24h
  `, [campaignId]);

  const r = rows[0]!;
  const autoCount = Number(r.auto_count);
  const autoCorrected = Number(r.auto_corrected);

  return {
    total: Number(r.total),
    by_source: JSON.parse(r.by_source),
    by_category: JSON.parse(r.by_category),
    by_vote_class: JSON.parse(r.by_vote_class),
    by_status: JSON.parse(r.by_status),
    corrections_count: Number(r.corrections_count),
    accuracy_rate: autoCount > 0 ? Math.round(((autoCount - autoCorrected) / autoCount) * 1000) / 10 : 100,
    avg_confidence: Number(Number(r.avg_confidence).toFixed(3)),
    last_hour: Number(r.last_hour),
    last_24h: Number(r.last_24h),
  };
}
