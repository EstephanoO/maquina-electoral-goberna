import { pool } from "../../db";
import type { ValidationRow, ValidationStatus, ClassificationEventRow, ClassificationSource } from "./schemas";


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
