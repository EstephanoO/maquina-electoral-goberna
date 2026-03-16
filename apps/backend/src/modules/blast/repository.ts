// blast/repository.ts
// Capa de datos para el módulo de blast masivo WA.
//
// La fuente de contactos es form_submissions (la base territorial).
// Segmentación: cada número de WA (wa_number) recibe un rango de contactos
// basado en un hash determinístico del phone — garantiza que el mismo contacto
// siempre va al mismo número, sin solapamiento entre celulares.
//
// Tabla auxiliar: blast_log
//   Registra cada mensaje enviado (número origen, contacto, resultado).
//   Permite calcular progreso por número y evitar reenvíos.

import { pool } from "../../db";

// ── Ensure tables ─────────────────────────────────────────────────────
export async function ensureBlastTables(): Promise<void> {
  // Log de mensajes enviados por el blast
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blast_log (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id   uuid        NOT NULL REFERENCES campaigns(id),
      wa_number     text        NOT NULL,   -- número del celular que envió (ej: 51901938157)
      contact_phone text        NOT NULL,   -- número del destinatario
      contact_name  text,
      contact_id    uuid,                   -- FK a form_submissions.id si aplica
      message_text  text,
      status        text        NOT NULL DEFAULT 'sent',  -- sent | failed | bounced
      error_msg     text,
      sent_at       timestamptz NOT NULL DEFAULT now(),
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Índices para queries rápidas de progreso por número
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blast_log_campaign_number
    ON blast_log(campaign_id, wa_number, sent_at DESC)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blast_log_unique_send
    ON blast_log(campaign_id, wa_number, contact_phone)
    WHERE status = 'sent'
  `);

  // Configuración de segmentación por número WA para la campaña
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blast_number_config (
      id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id uuid  NOT NULL REFERENCES campaigns(id),
      wa_number   text  NOT NULL,
      label       text,                     -- ej: 'Celular 1 — Lima Norte'
      segment_idx int   NOT NULL DEFAULT 0, -- 0-5 para 6 celulares
      total_slots int   NOT NULL DEFAULT 6, -- cuántos celulares en total
      active      bool  NOT NULL DEFAULT true,
      warmup_day  int   NOT NULL DEFAULT 1, -- día de warmup (1-14)
      created_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE(campaign_id, wa_number)
    )
  `);
}

// ── GET contacts for a specific WA number ────────────────────────────
// Segmentación determinística: los contactos se asignan por
// MOD(hashtext(phone), total_slots) = segment_idx
// Esto garantiza que el mismo contacto siempre va al mismo número.
// El offset/límite permite paginación dentro del segmento.
export async function getFormContactsForNumber(params: {
  campaign_id:  string;
  wa_number:    string;
  segment_idx:  number;
  total_slots:  number;
  status?:      string;   // 'nuevo' | 'hablado' | '' (todos)
  district?:    string;
  limit:        number;
  offset:       number;
}): Promise<{ contacts: ContactRow[]; total: number }> {
  const {
    campaign_id, wa_number, segment_idx, total_slots,
    status, district, limit, offset,
  } = params;

  // Base filter: contacts in this number's segment, not already sent by this number
  const conditions: string[] = [
    `fs.campaign_id = $1`,
    `fs.deleted_at IS NULL`,
    `COALESCE(fs.data->>'telefono', '') != ''`,
    // Deterministic segment assignment
    `ABS(hashtext(COALESCE(fs.data->>'telefono', fs.id::text))) % $2 = $3`,
    // Skip contacts already successfully blasted from this wa_number
    `NOT EXISTS (
       SELECT 1 FROM blast_log bl
       WHERE bl.campaign_id = $1
         AND bl.wa_number   = $4
         AND bl.contact_phone = regexp_replace(COALESCE(fs.data->>'telefono',''), '[^0-9]', '', 'g')
         AND bl.status = 'sent'
     )`,
  ];

  const args: unknown[] = [campaign_id, total_slots, segment_idx, wa_number];
  let argIdx = 5;

  if (status) {
    conditions.push(`COALESCE(fs.cms_status, 'nuevo') = $${argIdx++}`);
    args.push(status);
  }
  if (district) {
    conditions.push(`(fs.data->>'distrito' ILIKE $${argIdx} OR fs.data->>'zona' ILIKE $${argIdx})`);
    args.push(`%${district}%`);
    argIdx++;
  }

  const where = conditions.join(' AND ');

  const [rowsResult, countResult] = await Promise.all([
    pool.query<ContactRow>(
      `SELECT
         fs.id,
         COALESCE(fs.data->>'nombre',    '') AS nombre,
         COALESCE(fs.data->>'apellidos', '') AS apellidos,
         COALESCE(fs.data->>'telefono',  '') AS telefono,
         COALESCE(fs.data->>'distrito',  fs.data->>'zona', '') AS distrito,
         COALESCE(fs.data->>'encuestador','') AS encuestador,
         COALESCE(fs.cms_status, 'nuevo') AS cms_status
       FROM form_submissions fs
       WHERE ${where}
       ORDER BY fs.created_at ASC
       LIMIT $${argIdx} OFFSET $${argIdx + 1}`,
      [...args, limit, offset]
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM form_submissions fs
       WHERE ${where}`,
      args
    ),
  ]);

  return {
    contacts: rowsResult.rows,
    total:    parseInt(countResult.rows[0]?.count ?? "0", 10),
  };
}

export interface ContactRow {
  id:           string;
  nombre:       string;
  apellidos:    string;
  telefono:     string;
  distrito:     string;
  encuestador:  string;
  cms_status:   string;
}

// ── Mark contacts as hablado ──────────────────────────────────────────
// Updates cms_status in form_submissions for the given IDs.
export async function markHablado(
  campaign_id: string,
  ids: string[],
  wa_number?: string | null
): Promise<number> {
  if (!ids.length) return 0;

  const result = await pool.query(
    `UPDATE form_submissions
     SET cms_status  = 'hablado',
         updated_at  = now()
     WHERE id = ANY($1::uuid[])
       AND campaign_id = $2
       AND COALESCE(cms_status, 'nuevo') IN ('nuevo', 'hablado')`,
    [ids, campaign_id]
  );

  // Log who touched these contacts
  if (wa_number && ids.length > 0) {
    // Fire-and-forget insert to hablado audit log (best-effort)
    pool.query(
      `INSERT INTO blast_log (campaign_id, wa_number, contact_phone, contact_id, status)
       SELECT $1, $2, COALESCE(fs.data->>'telefono',''), fs.id, 'sent'
       FROM form_submissions fs
       WHERE fs.id = ANY($3::uuid[]) AND fs.campaign_id = $1
       ON CONFLICT (campaign_id, wa_number, contact_phone) WHERE status = 'sent' DO NOTHING`,
      [campaign_id, wa_number, ids]
    ).catch(() => {});
  }

  return result.rowCount ?? 0;
}

// ── Save blast log batch ───────────────────────────────────────────────
export async function saveBastReport(
  campaign_id: string,
  results: Array<{
    phone:        string;
    contact_name?: string;
    message?:     string;
    status:       'sent' | 'failed';
    error?:       string | null;
    own_number?:  string | null;
  }>
): Promise<number> {
  if (!results.length) return 0;

  let saved = 0;
  for (const r of results) {
    const phone = r.phone?.replace(/\D/g, '') ?? '';
    if (!phone) continue;
    try {
      await pool.query(
        `INSERT INTO blast_log
           (campaign_id, wa_number, contact_phone, contact_name, message_text, status, error_msg)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (campaign_id, wa_number, contact_phone) WHERE status = 'sent'
         DO UPDATE SET
           contact_name = EXCLUDED.contact_name,
           message_text = EXCLUDED.message_text,
           sent_at      = now()`,
        [
          campaign_id,
          r.own_number ?? 'unknown',
          phone,
          r.contact_name ?? null,
          r.message?.slice(0, 500) ?? null,
          r.status,
          r.error ?? null,
        ]
      );
      saved++;
    } catch { /* ignore individual failures */ }
  }

  return saved;
}

// ── Stats: global + per WA number ─────────────────────────────────────
export async function getBlastStats(campaign_id: string): Promise<{
  stats: {
    total_contacts:  number;
    total_sent:      number;
    total_pending:   number;
    total_failed:    number;
  };
  by_number: Record<string, {
    sent:    number;
    failed:  number;
    today:   number;
    label?:  string;
  }>;
}> {
  const [globalResult, byNumberResult, configResult] = await Promise.all([
    pool.query<{ total: string; sent: string; failed: string }>(
      `SELECT
         (SELECT COUNT(*) FROM form_submissions WHERE campaign_id = $1 AND deleted_at IS NULL
            AND COALESCE(data->>'telefono','') != '') AS total,
         (SELECT COUNT(*) FROM blast_log WHERE campaign_id = $1 AND status = 'sent') AS sent,
         (SELECT COUNT(*) FROM blast_log WHERE campaign_id = $1 AND status = 'failed') AS failed`,
      [campaign_id]
    ),
    pool.query<{ wa_number: string; sent: string; failed: string; today: string }>(
      `SELECT
         wa_number,
         COUNT(*) FILTER (WHERE status = 'sent')   AS sent,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE status = 'sent' AND sent_at >= CURRENT_DATE) AS today
       FROM blast_log
       WHERE campaign_id = $1
       GROUP BY wa_number`,
      [campaign_id]
    ),
    pool.query<{ wa_number: string; label: string }>(
      `SELECT wa_number, COALESCE(label, wa_number) AS label
       FROM blast_number_config
       WHERE campaign_id = $1 AND active = true`,
      [campaign_id]
    ),
  ]);

  const row        = globalResult.rows[0];
  const total      = parseInt(row?.total  ?? "0", 10);
  const totalSent  = parseInt(row?.sent   ?? "0", 10);
  const totalFailed= parseInt(row?.failed ?? "0", 10);

  const labelMap: Record<string, string> = {};
  for (const c of configResult.rows) labelMap[c.wa_number] = c.label;

  const byNumber: Record<string, { sent: number; failed: number; today: number; label?: string }> = {};
  for (const r of byNumberResult.rows) {
    byNumber[r.wa_number] = {
      sent:   parseInt(r.sent,   10),
      failed: parseInt(r.failed, 10),
      today:  parseInt(r.today,  10),
      label:  labelMap[r.wa_number],
    };
  }

  return {
    stats: {
      total_contacts: total,
      total_sent:     totalSent,
      total_pending:  Math.max(0, total - totalSent),
      total_failed:   totalFailed,
    },
    by_number: byNumber,
  };
}

// ── Get or create number config ────────────────────────────────────────
export async function upsertNumberConfig(params: {
  campaign_id:  string;
  wa_number:    string;
  label?:       string;
  segment_idx:  number;
  total_slots:  number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO blast_number_config
       (campaign_id, wa_number, label, segment_idx, total_slots, active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (campaign_id, wa_number)
     DO UPDATE SET
       label       = COALESCE(EXCLUDED.label, blast_number_config.label),
       segment_idx = EXCLUDED.segment_idx,
       total_slots = EXCLUDED.total_slots,
       active      = true`,
    [
      params.campaign_id,
      params.wa_number,
      params.label ?? null,
      params.segment_idx,
      params.total_slots,
    ]
  );
}

// ── Get config for a number ────────────────────────────────────────────
export async function getNumberConfig(
  campaign_id: string,
  wa_number: string
): Promise<{ segment_idx: number; total_slots: number; label: string | null } | null> {
  const result = await pool.query<{
    segment_idx: number;
    total_slots: number;
    label: string | null;
  }>(
    `SELECT segment_idx, total_slots, label
     FROM blast_number_config
     WHERE campaign_id = $1 AND wa_number = $2 AND active = true`,
    [campaign_id, wa_number]
  );
  return result.rows[0] ?? null;
}
