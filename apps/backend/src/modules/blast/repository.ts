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
// blast_log may already exist with a legacy schema (columns: jid, phone, own_number).
// We ADD the new columns we need (IF NOT EXISTS) and create new indexes safely.
export async function ensureBlastTables(): Promise<void> {
  // blast_log: create if missing, or migrate existing legacy table.
  // Legacy schema had: jid, phone, own_number, message, error
  // New schema adds: wa_number, contact_phone, message_text, error_msg
  // We use ADD COLUMN IF NOT EXISTS for all new columns and CREATE INDEX IF NOT EXISTS.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blast_log (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id   uuid        NOT NULL REFERENCES campaigns(id),
      contact_phone text        NOT NULL DEFAULT '',
      contact_name  text,
      message_text  text,
      status        text        NOT NULL DEFAULT 'sent',
      error_msg     text,
      sent_at       timestamptz NOT NULL DEFAULT now(),
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Migrate legacy columns to new names (ADD IF NOT EXISTS is safe to run multiple times)
  await pool.query(`
    ALTER TABLE blast_log
      ADD COLUMN IF NOT EXISTS wa_number     text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS contact_id    uuid,
      ADD COLUMN IF NOT EXISTS message_text  text,
      ADD COLUMN IF NOT EXISTS error_msg     text
  `);

  // Indexes — CREATE INDEX IF NOT EXISTS is safe even if index already exists
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blast_log_campaign_number
    ON blast_log(campaign_id, wa_number, sent_at DESC)
  `);

  // Partial unique index — skip if contact_phone column might be all-empty (legacy rows)
  // Use DO $$ to catch and ignore error if index already exists with different columns
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blast_log_unique_send
    ON blast_log(campaign_id, wa_number, contact_phone)
    WHERE status = 'sent' AND contact_phone != ''
  `);

  // Configuración de segmentación por número WA para la campaña
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blast_number_config (
      id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id uuid  NOT NULL REFERENCES campaigns(id),
      wa_number   text  NOT NULL,
      label       text,
      segment_idx int   NOT NULL DEFAULT 0,
      total_slots int   NOT NULL DEFAULT 6,
      active      bool  NOT NULL DEFAULT true,
      warmup_day  int   NOT NULL DEFAULT 1,
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
    // Skip contacts already sent successfully by this wa_number (histórico)
    `NOT EXISTS (
       SELECT 1 FROM blast_log bl
       WHERE bl.campaign_id = $1
         AND bl.wa_number   = $4
         AND bl.contact_phone = regexp_replace(COALESCE(fs.data->>'telefono',''), '[^0-9]', '', 'g')
         AND bl.status = 'sent'
     )`,
    // Skip contacts marked no_wa HOY — se reintentarán mañana via retry-no-wa
    `COALESCE(fs.cms_status, 'nuevo') != 'no_wa'
     OR fs.cms_hablado_at < CURRENT_DATE`,
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
         COALESCE(fs.data->>'departamento', '') AS departamento,
         COALESCE(fs.data->>'encuestador','') AS encuestador,
         COALESCE(fs.cms_status, 'nuevo') AS cms_status
       FROM form_submissions fs
       WHERE ${where}
        ORDER BY
          fs.cms_hablado_at NULLS FIRST,
          fs.created_at ASC
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
  departamento: string;
  encuestador:  string;
  cms_status:   string;
}

// ── Mark contacts as hablado ──────────────────────────────────────────
// ids     = contactos que recibieron mensaje exitosamente → cms_status='hablado'
// no_wa_ids = contactos sin WhatsApp → cms_status='no_wa' (reintentables mañana)
export async function markHablado(
  campaign_id: string,
  ids: string[],
  wa_number?: string | null,
  no_wa_ids?: string[]
): Promise<number> {
  let total = 0;

  // Marca enviados exitosos como 'hablado'
  if (ids.length) {
    const result = await pool.query(
      `UPDATE form_submissions
       SET cms_status     = 'hablado',
           cms_hablado_at = now()
       WHERE id = ANY($1::uuid[])
         AND campaign_id = $2
         AND COALESCE(cms_status, 'nuevo') IN ('nuevo', 'hablado', 'no_wa')`,
      [ids, campaign_id]
    );
    total += result.rowCount ?? 0;

    // Audit log — best-effort
    if (wa_number) {
      pool.query(
        `INSERT INTO blast_log (campaign_id, wa_number, contact_phone, contact_id, status)
         SELECT $1, $2, COALESCE(fs.data->>'telefono',''), fs.id, 'sent'
         FROM form_submissions fs
         WHERE fs.id = ANY($3::uuid[]) AND fs.campaign_id = $1
         ON CONFLICT (campaign_id, wa_number, contact_phone) WHERE status = 'sent' DO NOTHING`,
        [campaign_id, wa_number, ids]
      ).catch(() => {});
    }
  }

  // Marca sin WhatsApp como 'no_wa' — se pueden reintentar pasadas 24h
  if (no_wa_ids?.length) {
    await pool.query(
      `UPDATE form_submissions
       SET cms_status     = 'no_wa',
           cms_hablado_at = now()
       WHERE id = ANY($1::uuid[])
         AND campaign_id = $2
         AND COALESCE(cms_status, 'nuevo') IN ('nuevo', 'no_wa')`,
      [no_wa_ids, campaign_id]
    );
  }

  return total;
}

// ── Retry no_wa: vuelve a 'nuevo' los contactos sin WA de más de 24h ──
// Llamado al arrancar el blast — permite reintentar al día siguiente.
export async function retryNoWaContacts(campaign_id: string): Promise<number> {
  const result = await pool.query(
    `UPDATE form_submissions
     SET cms_status     = 'nuevo',
         cms_hablado_at = NULL
     WHERE campaign_id = $1
       AND cms_status   = 'no_wa'
       AND cms_hablado_at < NOW() - INTERVAL '24 hours'`,
    [campaign_id]
  );
  return result.rowCount ?? 0;
}

// ── Save blast log batch ───────────────────────────────────────────────
export async function saveBlastReport(
  campaign_id: string,
  results: Array<{
    phone:        string;
    contact_name?: string;
    message?:     string;
    status:       'sent' | 'failed' | 'no_wa';
    error?:       string | null;
    own_number?:  string | null;
    contact_id?:  string | null;  // UUID de form_submissions — para trazabilidad completa
  }>
): Promise<number> {
  if (!results.length) return 0;

  const clean = results
    .map(r => ({
      phone:        r.phone?.replace(/\D/g, '') ?? '',
      wa_number:    r.own_number ?? 'unknown',
      contact_name: r.contact_name ?? null,
      message_text: r.message?.slice(0, 500) ?? null,
      status:       r.status,
      error_msg:    r.error ?? null,
      contact_id:   r.contact_id ?? null,
    }))
    .filter(r => r.phone);

  if (!clean.length) return 0;

  const phones       = clean.map(r => r.phone);
  const waNumbers    = clean.map(r => r.wa_number);
  const names        = clean.map(r => r.contact_name);
  const messages     = clean.map(r => r.message_text);
  const statuses     = clean.map(r => r.status);
  const errors       = clean.map(r => r.error_msg);
  const contactIds   = clean.map(r => r.contact_id);

  try {
    const result = await pool.query(
      `INSERT INTO blast_log
         (campaign_id, wa_number, contact_phone, contact_name, message_text, status, error_msg, contact_id)
       SELECT $1,
         unnest($2::text[]),
         unnest($3::text[]),
         unnest($4::text[]),
         unnest($5::text[]),
         unnest($6::text[]),
         unnest($7::text[]),
         unnest($8::uuid[])
       ON CONFLICT (campaign_id, wa_number, contact_phone) WHERE status = 'sent'
       DO UPDATE SET
         contact_name = EXCLUDED.contact_name,
         message_text = EXCLUDED.message_text,
         status       = EXCLUDED.status,
         error_msg    = EXCLUDED.error_msg,
         contact_id   = COALESCE(EXCLUDED.contact_id, blast_log.contact_id),
         sent_at      = now()`,
      [campaign_id, waNumbers, phones, names, messages, statuses, errors, contactIds]
    );
    return result.rowCount ?? 0;
  } catch (err) {
    // Fallback a inserts individuales
    let saved = 0;
    for (const r of clean) {
      try {
        await pool.query(
          `INSERT INTO blast_log
             (campaign_id, wa_number, contact_phone, contact_name, message_text, status, error_msg, contact_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (campaign_id, wa_number, contact_phone) WHERE status = 'sent'
           DO UPDATE SET
             contact_name = EXCLUDED.contact_name,
             message_text = EXCLUDED.message_text,
             contact_id   = COALESCE(EXCLUDED.contact_id, blast_log.contact_id),
             sent_at      = now()`,
          [campaign_id, r.wa_number, r.phone, r.contact_name, r.message_text, r.status, r.error_msg, r.contact_id]
        );
        saved++;
      } catch { /* ignore individual failures */ }
    }
    return saved;
  }
}

// ── Stats: global + per WA number ─────────────────────────────────────
export async function getBlastStats(campaign_id: string): Promise<{
  stats: {
    total_contacts:  number;
    total_sent:      number;
    total_pending:   number;
    total_failed:    number;
    total_no_wa:     number;
  };
  by_number: Record<string, {
    sent:    number;
    failed:  number;
    today:   number;
    label?:  string;
  }>;
}> {
  const [globalResult, byNumberResult, configResult] = await Promise.all([
    pool.query<{ total: string; sent: string; failed: string; no_wa: string }>(
      `SELECT
         (SELECT COUNT(*) FROM form_submissions WHERE campaign_id = $1 AND deleted_at IS NULL
            AND COALESCE(data->>'telefono','') != '') AS total,
         (SELECT COUNT(*) FROM blast_log WHERE campaign_id = $1 AND status = 'sent') AS sent,
         (SELECT COUNT(*) FROM blast_log WHERE campaign_id = $1 AND status = 'failed') AS failed,
         (SELECT COUNT(*) FROM blast_log WHERE campaign_id = $1 AND status = 'no_wa') AS no_wa`,
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
  const totalNoWa  = parseInt(row?.no_wa  ?? "0", 10);

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
      total_pending:  Math.max(0, total - totalSent - totalNoWa),
      total_failed:   totalFailed,
      total_no_wa:    totalNoWa,
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

// ── Number health: limits + warm-up ────────────────────────────────────
export async function getNumberHealth(
  campaign_id: string,
  wa_number: string
): Promise<{
  sent_last_hour: number;
  sent_today: number;
  hourly_limit: number;
  daily_limit: number;
  age_days: number;
  warm_up_limit: number;
  risk_level: string;
  can_send: boolean;
  next_available_at: string | null;
}> {
  const [hourResult, todayResult, configResult] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM blast_log
       WHERE campaign_id = $1
         AND wa_number = $2
         AND status = 'sent'
         AND sent_at >= NOW() - INTERVAL '1 hour'`,
      [campaign_id, wa_number]
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM blast_log
       WHERE campaign_id = $1
         AND wa_number = $2
         AND status = 'sent'
         AND sent_at >= CURRENT_DATE`,
      [campaign_id, wa_number]
    ),
    pool.query<{ warmup_day: number; created_at: string }>(
      `SELECT warmup_day, created_at::text
       FROM blast_number_config
       WHERE campaign_id = $1 AND wa_number = $2 AND active = true`,
      [campaign_id, wa_number]
    ),
  ]);

  const sentLastHour = parseInt(hourResult.rows[0]?.count ?? "0", 10);
  const sentToday    = parseInt(todayResult.rows[0]?.count ?? "0", 10);

  // Edad del número en días desde que fue registrado
  const configRow = configResult.rows[0];
  const createdAt = configRow?.created_at ? new Date(configRow.created_at) : new Date();
  const ageDays   = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / 86400000));

  // Curva de calentamiento progresiva por día de vida del número.
  // Día 1: 30 | Día 2: 80 | Día 3: 150 | Día 5: 200 | Día 10+: 300
  // Límite horario: 20% del límite diario, mínimo 20, máximo 60
  const DAILY_LIMIT =
    ageDays <= 1 ? 30  :
    ageDays <= 2 ? 80  :
    ageDays <= 4 ? 150 :
    ageDays <= 9 ? 200 : 300;
  const HOURLY_LIMIT = Math.min(60, Math.max(20, Math.round(DAILY_LIMIT * 0.2)));

  // Risk assessment
  const hourlyPct = HOURLY_LIMIT > 0 ? sentLastHour / HOURLY_LIMIT : 1;
  const dailyPct  = DAILY_LIMIT  > 0 ? sentToday    / DAILY_LIMIT  : 1;
  let riskLevel = "low";
  if      (hourlyPct > 0.9 || dailyPct > 0.9) riskLevel = "critical";
  else if (hourlyPct > 0.7 || dailyPct > 0.7) riskLevel = "high";
  else if (hourlyPct > 0.5 || dailyPct > 0.5) riskLevel = "medium";

  const canSend = sentLastHour < HOURLY_LIMIT && sentToday < DAILY_LIMIT;

  // next_available_at: calcula el tiempo exacto hasta que se libere cupo horario.
  // Si el límite diario se alcanzó, retorna mañana a las 00:00 UTC-5 (Perú).
  let nextAvailableAt: string | null = null;
  if (!canSend) {
    if (sentToday >= DAILY_LIMIT) {
      // Mañana a las 00:01 hora Perú (UTC-5)
      const tomorrow = new Date();
      tomorrow.setUTCHours(5, 1, 0, 0); // 00:01 Perú = 05:01 UTC
      if (tomorrow.getTime() <= Date.now()) tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      nextAvailableAt = tomorrow.toISOString();
    } else {
      // Límite horario — la hora más antigua del blast_log en la última hora
      // Para simplificar: next = oldest_msg_in_last_hour + 60min
      // Aproximación conservadora: now + (60 - minutos_transcurridos_en_hora_actual)
      const now = new Date();
      const msIntoCurrentHour = (now.getMinutes() * 60 + now.getSeconds()) * 1000;
      const msUntilNextHour   = 3600000 - msIntoCurrentHour;
      nextAvailableAt = new Date(Date.now() + msUntilNextHour).toISOString();
    }
  }

  return {
    sent_last_hour:    sentLastHour,
    sent_today:        sentToday,
    hourly_limit:      HOURLY_LIMIT,
    daily_limit:       DAILY_LIMIT,
    age_days:          ageDays,
    warm_up_limit:     DAILY_LIMIT,
    risk_level:        riskLevel,
    can_send:          canSend,
    next_available_at: nextAvailableAt,
  };
}
