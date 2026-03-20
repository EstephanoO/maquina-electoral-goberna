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

  // blast_blocklist: números bloqueados globalmente para TODOS los celulares.
  // Se verifica en TODAS las queries de blast — un contacto aquí = excluido para todos.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blast_blocklist (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_digits  text        NOT NULL UNIQUE,
      source        text        DEFAULT 'csv',
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blast_blocklist_phone
    ON blast_blocklist(phone_digits)
  `);

  // Migrate legacy columns to new names (ADD IF NOT EXISTS is safe to run multiple times)
  await pool.query(`
    ALTER TABLE blast_log
      ADD COLUMN IF NOT EXISTS wa_number     text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS contact_id    uuid,
      ADD COLUMN IF NOT EXISTS message_text  text,
      ADD COLUMN IF NOT EXISTS error_msg     text,
      ADD COLUMN IF NOT EXISTS block_id      text
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blast_log_block_id
    ON blast_log(campaign_id, block_id) WHERE block_id IS NOT NULL
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
  brigadista?:  string;   // filtrar por nombre del encuestador/brigadista
  limit:        number;
  offset:       number;
}): Promise<{ contacts: ContactRow[]; total: number }> {
  const {
    campaign_id, wa_number, segment_idx, total_slots,
    status, district, brigadista, limit, offset,
  } = params;

  // Base filter: contacts in this number's segment, not already sent by this number
  const conditions: string[] = [
    `fs.campaign_id = $1`,
    `fs.deleted_at IS NULL`,
    `COALESCE(fs.data->>'telefono', '') != ''`,
    // Deterministic segment assignment
    `ABS(hashtext(COALESCE(fs.data->>'telefono', fs.id::text))) % $2 = $3`,
    // Skip contacts already sent successfully by ANY wa_number (no solo este)
    // CRÍTICO: Si CUALQUIER celular ya envió a este teléfono, no enviar de nuevo.
    // Esto previene duplicados cuando el mark-hablado falla pero blast_log sí se registró.
    `NOT EXISTS (
       SELECT 1 FROM blast_log bl
       WHERE bl.campaign_id = $1
         AND regexp_replace(bl.contact_phone, '[^0-9]', '', 'g') = regexp_replace(COALESCE(fs.data->>'telefono',''), '[^0-9]', '', 'g')
         AND bl.status = 'sent'
     )`,
    // Skip contacts marked no_wa HOY — se reintentarán mañana via retry-no-wa
    `COALESCE(fs.cms_status, 'nuevo') != 'no_wa'
     OR fs.cms_hablado_at < CURRENT_DATE`,
    // Skip contacts que ya fueron procesados (hablado, respondieron, archivado, claimed)
    `COALESCE(fs.cms_status, 'nuevo') NOT IN ('hablado', 'respondieron', 'archivado', 'claimed')`,
    // Skip teléfonos inválidos (menos de 9 dígitos)
    `LENGTH(regexp_replace(COALESCE(fs.data->>'telefono', ''), '[^0-9]', '', 'g')) >= 9`,
    // Bloqueo global — si el teléfono está en blast_blocklist, NINGÚN celular puede enviarle
    `NOT EXISTS (
       SELECT 1 FROM blast_blocklist bl2
       WHERE bl2.phone_digits = regexp_replace(COALESCE(fs.data->>'telefono',''), '[^0-9]', '', 'g')
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
  if (brigadista) {
    conditions.push(`(fs.data->>'encuestador' ILIKE $${argIdx} OR fs.data->>'brigadista' ILIKE $${argIdx})`);
    args.push(`%${brigadista}%`);
    argIdx++;
  }

  const where = conditions.join(' AND ');

  const [rowsResult, countResult] = await Promise.all([
    pool.query<ContactRow>(
       `WITH hot_phones AS (
          SELECT DISTINCT data->>'telefono' AS tel
          FROM form_submissions
          WHERE campaign_id = $1
            AND cms_status = 'respondieron'
            AND COALESCE(data->>'telefono','') != ''
        )
        SELECT
          fs.id,
          COALESCE(fs.data->>'nombre',    '') AS nombre,
          COALESCE(fs.data->>'apellidos', '') AS apellidos,
          COALESCE(fs.data->>'telefono',  '') AS telefono,
          COALESCE(fs.data->>'distrito',  fs.data->>'zona', '') AS distrito,
          COALESCE(fs.data->>'departamento', '') AS departamento,
          COALESCE(fs.data->>'encuestador','') AS encuestador,
          COALESCE(fs.cms_status, 'nuevo') AS cms_status,
          CASE
            WHEN hp.tel IS NOT NULL THEN 2
            WHEN fs.cms_status = 'no_wa' THEN 0
            ELSE 1
          END AS heat_score
        FROM form_submissions fs
        LEFT JOIN hot_phones hp ON hp.tel = fs.data->>'telefono'
        WHERE ${where}
        ORDER BY
          CASE WHEN hp.tel IS NOT NULL THEN 0 ELSE 1 END ASC,
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
  heat_score:   number;  // 2=caliente, 1=normal, 0=frío
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

  // Marca como 'hablado' — SIN filtrar por cms_status.
  // Si el operador dice "marcar hablado", se marca sin condiciones.
  // Esto evita el bug de updated:0 con status desconocidos.
  if (ids.length) {
    const result = await pool.query(
      `UPDATE form_submissions
       SET cms_status     = 'hablado',
           cms_hablado_at = now()
       WHERE id = ANY($1::uuid[])
         AND campaign_id = $2`,
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
          ON CONFLICT (campaign_id, wa_number, contact_phone) WHERE status = 'sent' AND contact_phone <> '' DO NOTHING`,
        [campaign_id, wa_number, ids]
      ).catch((err) => { console.warn("[blast] audit log insert failed", String(err)); });
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

// ── Dashboard: stats completas por celular + quality + spam ────────────
export async function getDashboardStats(campaign_id: string) {
  // 1. Stats por segmento (celular) desde form_submissions (fuente real)
  const perSegment = await pool.query<{
    segmento: number; total: string; hablado: string;
    respondieron: string; no_wa: string; pendiente: string;
    hablado_hoy: string; respondieron_hoy: string;
  }>(`
    SELECT
      ABS(hashtext(COALESCE(data->>'telefono', id::text))) % 6 AS segmento,
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE cms_status = 'hablado')::text AS hablado,
      COUNT(*) FILTER (WHERE cms_status = 'respondieron')::text AS respondieron,
      COUNT(*) FILTER (WHERE cms_status = 'no_wa')::text AS no_wa,
      COUNT(*) FILTER (WHERE COALESCE(cms_status,'nuevo') = 'nuevo')::text AS pendiente,
      COUNT(*) FILTER (WHERE cms_status = 'hablado' AND cms_hablado_at >= CURRENT_DATE)::text AS hablado_hoy,
      COUNT(*) FILTER (WHERE cms_status = 'respondieron' AND cms_hablado_at >= CURRENT_DATE)::text AS respondieron_hoy
    FROM form_submissions
    WHERE campaign_id = $1 AND deleted_at IS NULL
      AND COALESCE(data->>'telefono','') != ''
    GROUP BY 1 ORDER BY 1
  `, [campaign_id]);

  // 2. Config de números (label, segment_idx)
  const configs = await pool.query<{
    wa_number: string; label: string; segment_idx: number;
    created_at: string; active: boolean;
  }>(`
    SELECT wa_number, COALESCE(label, wa_number) AS label, segment_idx,
           created_at::text, active
    FROM blast_number_config
    WHERE campaign_id = $1
    ORDER BY segment_idx
  `, [campaign_id]);

  // 3. Blast log: últimos envíos y mensajes más repetidos (para spam check)
  const topMessages = await pool.query<{ message_preview: string; veces: string }>(`
    SELECT LEFT(message_text, 80) AS message_preview, COUNT(*)::text AS veces
    FROM blast_log
    WHERE campaign_id = $1 AND status = 'sent' AND message_text IS NOT NULL
    GROUP BY LEFT(message_text, 80)
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `, [campaign_id]);

  // 4. Ritmo por hora (últimas 24h) — para gráfica de actividad
  const hourlyActivity = await pool.query<{ hora: string; enviados: string }>(`
    SELECT
      to_char(date_trunc('hour', cms_hablado_at AT TIME ZONE 'America/Lima'), 'HH24:00') AS hora,
      COUNT(*)::text AS enviados
    FROM form_submissions
    WHERE campaign_id = $1 AND cms_status IN ('hablado','respondieron')
      AND cms_hablado_at >= NOW() - INTERVAL '24 hours'
    GROUP BY date_trunc('hour', cms_hablado_at AT TIME ZONE 'America/Lima')
    ORDER BY date_trunc('hour', cms_hablado_at AT TIME ZONE 'America/Lima')
  `, [campaign_id]);

  // Mapear configs por segment_idx
  const configMap: Record<number, { wa_number: string; label: string; created_at: string; active: boolean }> = {};
  for (const c of configs.rows) configMap[c.segment_idx] = c;

  // Construir response por celular
  // Calcular globales desde perSegment (evita una query redundante)
  let totalContacts = 0, totalHablado = 0, totalRespondieron = 0, totalNoWa = 0, totalPendiente = 0;
  for (const r of perSegment.rows) {
    totalContacts     += parseInt(r.total, 10);
    totalHablado      += parseInt(r.hablado, 10);
    totalRespondieron += parseInt(r.respondieron, 10);
    totalNoWa         += parseInt(r.no_wa, 10);
    totalPendiente    += parseInt(r.pendiente, 10);
  }
  const totalContactados = totalHablado + totalRespondieron;
  const globalResponseRate = totalContactados > 0 ? totalRespondieron / totalContactados : 0;

  const celulares = perSegment.rows.map(r => {
    const seg    = r.segmento;
    const cfg    = configMap[seg];
    const total  = parseInt(r.total, 10);
    const hab    = parseInt(r.hablado, 10);
    const resp   = parseInt(r.respondieron, 10);
    const noWa   = parseInt(r.no_wa, 10);
    const pend   = parseInt(r.pendiente, 10);
    const habHoy = parseInt(r.hablado_hoy, 10);
    const respHoy= parseInt(r.respondieron_hoy, 10);
    const contactados = hab + resp;
    const responseRate = contactados > 0 ? resp / contactados : 0;

    return {
      segmento:        seg,
      wa_number:       cfg?.wa_number ?? null,
      label:           cfg?.label ?? `Celular ${seg + 1}`,
      active:          cfg?.active ?? false,
      age_days:        cfg?.created_at ? Math.max(1, Math.floor((Date.now() - new Date(cfg.created_at).getTime()) / 86400000)) : 0,
      total,
      hablado:         hab,
      respondieron:    resp,
      no_wa:           noWa,
      pendiente:       pend,
      hablado_hoy:     habHoy,
      respondieron_hoy: respHoy,
      response_rate:   Math.round(responseRate * 1000) / 1000,
      quality_rating:  responseRate >= 0.40 ? 'green' as const : responseRate >= 0.25 ? 'yellow' as const : 'red' as const,
    };
  });

  return {
    global: {
      total_contacts:    totalContacts,
      total_hablado:     totalHablado,
      total_respondieron: totalRespondieron,
      total_no_wa:       totalNoWa,
      total_pendiente:   totalPendiente,
      response_rate:     Math.round(globalResponseRate * 1000) / 1000,
      quality_rating:    globalResponseRate >= 0.40 ? 'green' as const : globalResponseRate >= 0.25 ? 'yellow' as const : 'red' as const,
    },
    celulares,
    top_messages: topMessages.rows.map(r => ({
      preview: r.message_preview,
      count:   parseInt(r.veces, 10),
    })),
    hourly_activity: hourlyActivity.rows.map(r => ({
      hour:  r.hora,
      count: parseInt(r.enviados, 10),
    })),
  };
}

// ── Block stats: respuestas del bloque de 50 ──────────────────────────
// Cuenta cuántos de los contact_ids del bloque respondieron (cms_status='respondieron')
export async function getBlockStats(
  campaign_id: string,
  block_id: string
): Promise<{ sent: number; responded: number; response_rate: number; unlocked_10: boolean; unlocked_50: boolean }> {
  const result = await pool.query<{ sent: string; responded: string }>(
    `SELECT
       COUNT(*)::text AS sent,
       COUNT(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM form_submissions fs
           WHERE fs.id = bl.contact_id
             AND fs.campaign_id = $1
             AND fs.cms_status = 'respondieron'
         )
       )::text AS responded
     FROM blast_log bl
     WHERE bl.campaign_id = $1
       AND bl.block_id    = $2
       AND bl.status      = 'sent'`,
    [campaign_id, block_id]
  );
  const sent      = parseInt(result.rows[0]?.sent      ?? "0", 10);
  const responded = parseInt(result.rows[0]?.responded ?? "0", 10);
  const rate      = sent > 0 ? responded / sent : 0;
  return {
    sent,
    responded,
    response_rate:  Math.round(rate * 1000) / 1000,
    unlocked_10:    rate >= 0.10,   // 10% → desbloqueado para ver resultados
    unlocked_50:    rate >= 0.50,   // 50% → desbloqueado para enviar los siguientes 50
  };
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

// ── Sincronizar cms_status con blast_log ──────────────────────────────
// Marca como 'hablado' todos los contactos que tienen registro en blast_log
// con status='sent' pero que aún tienen cms_status='nuevo'.
// Esto corrige inconsistencias donde el mensaje se envió pero no se marcó.
export async function syncCmsStatusWithBlastLog(campaign_id: string): Promise<{
  synced: number;
  already_hablado: number;
  in_blast_log: number;
  pending_nuevo: number;
}> {
  // 1. Contar estado actual
  const statsResult = await pool.query<{
    in_blast_log: string;
    pending_nuevo: string;
    already_hablado: string;
  }>(`
    SELECT
      (SELECT COUNT(DISTINCT regexp_replace(contact_phone, '[^0-9]', '', 'g'))
       FROM blast_log WHERE campaign_id = $1 AND status = 'sent') AS in_blast_log,
      (SELECT COUNT(*) FROM form_submissions
       WHERE campaign_id = $1 AND deleted_at IS NULL
         AND COALESCE(cms_status, 'nuevo') = 'nuevo'
         AND COALESCE(data->>'telefono', '') != '') AS pending_nuevo,
      (SELECT COUNT(*) FROM form_submissions
       WHERE campaign_id = $1 AND deleted_at IS NULL
         AND cms_status = 'hablado') AS already_hablado
  `, [campaign_id]);

  const stats = statsResult.rows[0];

  // 2. Sincronizar: marcar como 'hablado' los que están en blast_log pero tienen cms_status='nuevo'
  const syncResult = await pool.query(`
    UPDATE form_submissions fs
    SET cms_status = 'hablado',
        cms_hablado_at = COALESCE(fs.cms_hablado_at, NOW())
    WHERE fs.campaign_id = $1
      AND fs.deleted_at IS NULL
      AND COALESCE(fs.cms_status, 'nuevo') = 'nuevo'
      AND EXISTS (
        SELECT 1 FROM blast_log bl
        WHERE bl.campaign_id = $1
          AND bl.status = 'sent'
          AND regexp_replace(bl.contact_phone, '[^0-9]', '', 'g') =
              regexp_replace(COALESCE(fs.data->>'telefono', ''), '[^0-9]', '', 'g')
      )
  `, [campaign_id]);

  return {
    synced: syncResult.rowCount ?? 0,
    already_hablado: parseInt(stats?.already_hablado ?? '0', 10),
    in_blast_log: parseInt(stats?.in_blast_log ?? '0', 10),
    pending_nuevo: parseInt(stats?.pending_nuevo ?? '0', 10),
  };
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
    contact_id?:  string | null;
    block_id?:    string | null;  // ID del bloque de 50 para checkpoint
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
      block_id:     r.block_id ?? null,
    }))
    .filter(r => r.phone);

  if (!clean.length) return 0;

  const phones     = clean.map(r => r.phone);
  const waNumbers  = clean.map(r => r.wa_number);
  const names      = clean.map(r => r.contact_name);
  const messages   = clean.map(r => r.message_text);
  const statuses   = clean.map(r => r.status);
  const errors     = clean.map(r => r.error_msg);
  const contactIds = clean.map(r => r.contact_id);
  const blockIds   = clean.map(r => r.block_id);

  try {
    const result = await pool.query(
      `INSERT INTO blast_log
         (campaign_id, wa_number, contact_phone, contact_name, message_text, status, error_msg, contact_id, block_id)
       SELECT $1,
         unnest($2::text[]),  unnest($3::text[]),  unnest($4::text[]),
         unnest($5::text[]),  unnest($6::text[]),  unnest($7::text[]),
         unnest($8::uuid[]),  unnest($9::text[])
       ON CONFLICT (campaign_id, wa_number, contact_phone) WHERE status = 'sent'
       DO UPDATE SET
         contact_name = EXCLUDED.contact_name,
         message_text = EXCLUDED.message_text,
         status       = EXCLUDED.status,
         error_msg    = EXCLUDED.error_msg,
         contact_id   = COALESCE(EXCLUDED.contact_id, blast_log.contact_id),
         block_id     = COALESCE(EXCLUDED.block_id,   blast_log.block_id),
         sent_at      = now()`,
      [campaign_id, waNumbers, phones, names, messages, statuses, errors, contactIds, blockIds]
    );
    return result.rowCount ?? 0;
  } catch (err) {
    console.error("[blast] batch insert failed, falling back to individual inserts", String(err));
    let saved = 0;
    for (const r of clean) {
      try {
        await pool.query(
          `INSERT INTO blast_log
             (campaign_id, wa_number, contact_phone, contact_name, message_text, status, error_msg, contact_id, block_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (campaign_id, wa_number, contact_phone) WHERE status = 'sent'
           DO UPDATE SET
             contact_name = EXCLUDED.contact_name, message_text = EXCLUDED.message_text,
             contact_id   = COALESCE(EXCLUDED.contact_id, blast_log.contact_id),
             block_id     = COALESCE(EXCLUDED.block_id,   blast_log.block_id),
             sent_at      = now()`,
          [campaign_id, r.wa_number, r.phone, r.contact_name, r.message_text, r.status, r.error_msg, r.contact_id, r.block_id]
        );
        saved++;
      } catch (rowErr) {
        console.warn("[blast] individual insert failed", { phone: r.phone, error: String(rowErr) });
      }
    }
    return saved;
  }
}

// ── Stats: global + per WA number + quality rating ────────────────────
export async function getBlastStats(campaign_id: string): Promise<{
  stats: {
    total_contacts:   number;
    total_sent:       number;
    total_pending:    number;
    total_failed:     number;
    total_no_wa:      number;
    // Quality rating metrics
    total_responded:  number;   // cms_status='respondieron' que fueron blasted
    response_rate:    number;   // responded / sent (0-1)
    no_response_rate: number;   // (sent - responded) / sent (0-1)
    quality_rating:   'green' | 'yellow' | 'red';
    can_scale:        boolean;  // response_rate>40% AND no_response_rate<50%
  };
  by_number: Record<string, {
    sent:    number;
    failed:  number;
    today:   number;
    label?:  string;
  }>;
}> {
  const [globalResult, byNumberResult, configResult] = await Promise.all([
    pool.query<{ total: string; sent: string; failed: string; no_wa: string; responded: string }>(
      `SELECT
         (SELECT COUNT(*) FROM form_submissions WHERE campaign_id = $1 AND deleted_at IS NULL
            AND COALESCE(data->>'telefono','') != '') AS total,
         (SELECT COUNT(*) FROM blast_log WHERE campaign_id = $1 AND status = 'sent') AS sent,
         (SELECT COUNT(*) FROM blast_log WHERE campaign_id = $1 AND status = 'failed') AS failed,
         (SELECT COUNT(*) FROM blast_log WHERE campaign_id = $1 AND status = 'no_wa') AS no_wa,
         -- Respondieron: contactos blasted que luego cambiaron a 'respondieron'
         (SELECT COUNT(*) FROM form_submissions fs
          WHERE fs.campaign_id = $1
            AND fs.cms_status = 'respondieron'
            AND EXISTS (
              SELECT 1 FROM blast_log bl
              WHERE bl.campaign_id = $1
                AND bl.status = 'sent'
                AND regexp_replace(bl.contact_phone, '[^0-9]', '', 'g') = regexp_replace(COALESCE(fs.data->>'telefono',''), '[^0-9]', '', 'g')
            )
         ) AS responded`,
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
  const total         = parseInt(row?.total     ?? "0", 10);
  const totalSent     = parseInt(row?.sent      ?? "0", 10);
  const totalFailed   = parseInt(row?.failed    ?? "0", 10);
  const totalNoWa     = parseInt(row?.no_wa     ?? "0", 10);
  const totalResponded= parseInt(row?.responded ?? "0", 10);

  // Quality rating — basado en métricas reales de WA quality system
  const responseRate    = totalSent > 0 ? totalResponded / totalSent : 0;
  const noResponseRate  = totalSent > 0 ? (totalSent - totalResponded) / totalSent : 0;

  // quality_rating: green/yellow/red basado en response_rate
  // 🟢 ≥40% respuesta | 🟡 25-40% | 🔴 <25%
  const qualityRating: 'green' | 'yellow' | 'red' =
    responseRate >= 0.40 ? 'green' :
    responseRate >= 0.25 ? 'yellow' : 'red';

  // can_scale: puede aumentar volumen +20% si cumple las 3 condiciones PRO
  const canScale = responseRate >= 0.40 && noResponseRate < 0.50;

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
      total_contacts:   total,
      total_sent:       totalSent,
      total_pending:    Math.max(0, total - totalSent - totalNoWa),
      total_failed:     totalFailed,
      total_no_wa:      totalNoWa,
      total_responded:  totalResponded,
      response_rate:    Math.round(responseRate  * 1000) / 1000,  // 3 decimales
      no_response_rate: Math.round(noResponseRate * 1000) / 1000,
      quality_rating:   qualityRating,
      can_scale:        canScale,
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

// ── Get used segment indexes for a campaign ───────────────────────────
export async function getUsedSegments(campaign_id: string): Promise<Set<number>> {
  const result = await pool.query<{ segment_idx: number }>(
    `SELECT segment_idx FROM blast_number_config WHERE campaign_id = $1 AND active = true`,
    [campaign_id]
  );
  return new Set(result.rows.map(r => r.segment_idx));
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
  // Escalado: +20%/día máximo según estrategia PRO de WhatsApp quality.
  // Día 1: 30 | Día 2: 80 | Día 3: 150 | Día 5-9: 200 | Día 10-14: 250 | Día 15+: 300
  const BASE_DAILY_LIMIT =
    ageDays <= 1  ? 30  :
    ageDays <= 2  ? 80  :
    ageDays <= 4  ? 150 :
    ageDays <= 9  ? 200 :
    ageDays <= 14 ? 250 : 300;

  // Quality bonus: si el quality rating es verde (≥40% respuesta), +20% de límite
  // Esto implementa la regla de oro: response_rate>40% → PUEDES AUMENTAR VOLUMEN
  let qualityMultiplier = 1.0;
  try {
    const qResult = await pool.query<{ response_rate: string; no_response_rate: string }>(
      `SELECT
         CASE WHEN sent.total > 0 THEN resp.total::numeric / sent.total ELSE 0 END AS response_rate,
         CASE WHEN sent.total > 0 THEN (sent.total - resp.total)::numeric / sent.total ELSE 1 END AS no_response_rate
       FROM
         (SELECT COUNT(*) AS total FROM blast_log WHERE campaign_id = $1 AND status = 'sent') sent,
         (SELECT COUNT(*) AS total FROM form_submissions
          WHERE campaign_id = $1 AND cms_status = 'respondieron') resp`,
      [campaign_id]
    );
    const rr  = parseFloat(qResult.rows[0]?.response_rate  ?? "0");
    const nrr = parseFloat(qResult.rows[0]?.no_response_rate ?? "1");
    // Regla de oro: response_rate>40% AND no_response_rate<50% → escalar
    if (rr >= 0.40 && nrr < 0.50) qualityMultiplier = 1.20;
    // Peligro: response_rate<25% → reducir 20%
    else if (rr < 0.25 && rr > 0) qualityMultiplier = 0.80;
  } catch (err) { console.warn("[blast] quality multiplier query failed", String(err)); }

  const DAILY_LIMIT  = Math.round(BASE_DAILY_LIMIT * qualityMultiplier);
  const HOURLY_LIMIT = Math.min(60, Math.max(20, Math.round(DAILY_LIMIT * 0.20)));

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

// ── Blast conversation bridge ──────────────────────────────────────────
// See: migration 044_blast_jid_phone_map.sql
//
// reportBlastConversation:
//   1. Upsert into blast_jid_phone_map (jid → phone mapping)
//   2. Upsert into conversations with source='blast'
// Both in a transaction so they're atomic.
//
// resolvePhoneByJid:
//   Looks up the canonical phone number for a given JID.
//   Used by the extension on incoming replies.

export async function reportBlastConversation(params: {
  campaign_id:  string;
  own_number:   string;
  jid:          string;
  phone:        string;
  contact_name: string | null;
}): Promise<{ conversation_id: number; is_new: boolean }> {
  const { campaign_id, own_number, jid, phone, contact_name } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1: upsert blast_jid_phone_map
    await client.query(`
      INSERT INTO blast_jid_phone_map
        (campaign_id, own_number, jid, phone, contact_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (campaign_id, own_number, jid) DO UPDATE SET
        phone = EXCLUDED.phone,
        contact_name = COALESCE(EXCLUDED.contact_name, blast_jid_phone_map.contact_name),
        created_at = now()
    `, [campaign_id, own_number, jid, phone, contact_name]);

    // Step 2: upsert conversations with source='blast'
    const msgEntry = JSON.stringify({
      d: "out",
      t: "(mensaje de blast)",
      ts: Date.now(),
      op: null,
    });

    const { rows } = await client.query<{ id: string; is_new: boolean }>(`
      INSERT INTO conversations (
        campaign_id, own_number, jid, phone, contact_name,
        messages, message_count, inbound_count,
        source, classified_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        jsonb_build_array($6::jsonb), 1, 0,
        'blast', 'pending'
      )
      ON CONFLICT (campaign_id, own_number, jid) DO UPDATE SET
        phone = EXCLUDED.phone,
        contact_name = COALESCE(EXCLUDED.contact_name, conversations.contact_name),
        messages = CASE
          WHEN jsonb_array_length(conversations.messages) >= 50
          THEN (conversations.messages - 0) || jsonb_build_array($6::jsonb)
          ELSE conversations.messages || jsonb_build_array($6::jsonb)
        END,
        message_count = conversations.message_count + 1,
        updated_at = now()
      RETURNING id::text, (xmax = 0) as is_new
    `, [campaign_id, own_number, jid, phone, contact_name, msgEntry]);

    await client.query("COMMIT");

    return {
      conversation_id: parseInt(rows[0]!.id, 10),
      is_new: rows[0]!.is_new,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function resolvePhoneByJid(params: {
  campaign_id: string;
  jid:         string;
}): Promise<{ phone: string | null; contact_name: string | null }> {
  const { campaign_id, jid } = params;

  // Look up in blast_jid_phone_map first (most specific for blast)
  const { rows: bjpmRows } = await pool.query<{
    phone:        string;
    contact_name: string | null;
  }>(`
    SELECT phone, contact_name
    FROM blast_jid_phone_map
    WHERE campaign_id = $1 AND jid = $2
    LIMIT 1
  `, [campaign_id, jid]);

  if (bjpmRows.length > 0) {
    return {
      phone:        bjpmRows[0]!.phone,
      contact_name: bjpmRows[0]!.contact_name,
    };
  }

  // Fallback: look in conversations table directly
  const { rows: convRows } = await pool.query<{
    phone:        string | null;
    contact_name: string | null;
  }>(`
    SELECT phone, contact_name
    FROM conversations
    WHERE campaign_id = $1 AND jid = $2
    LIMIT 1
  `, [campaign_id, jid]);

  if (convRows.length > 0) {
    return {
      phone:        convRows[0]!.phone,
      contact_name: convRows[0]!.contact_name,
    };
  }

  return { phone: null, contact_name: null };
}

// ── Capa 5: check-contacts — realtime deduplicación anti-duplicado ─────
// Recibe una lista de {id, phone} y devuelve cuáles siguen siendo 'nuevo'.
// Si un contacto fue marcado 'hablado' por CUALQUIER phone, lo detectamos aquí.
// CRÍTICO: Verifica blast_log sin filtrar por wa_number para evitar duplicados globales.
export async function checkContactsStillNew(params: {
  campaign_id: string;
  wa_number:   string;
  contacts:     { id: string; phone: string }[];
}): Promise<Set<string>> {
  const { campaign_id, contacts } = params;
  if (!contacts.length) return new Set();

  // Build placeholders: $1=campaign_id
  // contacts[i] = { id: $2+i*2, phone: $3+i*2 }
  const args: unknown[] = [campaign_id];
  const idPlaceholders:  string[] = [];
  const phonePlaceholders: string[] = [];

  contacts.forEach((c, i) => {
    args.push(c.id, c.phone.replace(/\D/g, ''));
    idPlaceholders.push(`$${args.length - 1}`);
    phonePlaceholders.push(`$${args.length}`);
  });

  const { rows } = await pool.query<{ id: string }>(`
    SELECT fs.id
    FROM form_submissions fs
    WHERE fs.campaign_id = $1
      AND fs.deleted_at IS NULL
      AND fs.id IN (${idPlaceholders.join(',')})
      -- Normalizar teléfono para comparación correcta
      AND regexp_replace(COALESCE(fs.data->>'telefono', ''), '[^0-9]', '', 'g') IN (${phonePlaceholders.join(',')})
      AND COALESCE(fs.cms_status, 'nuevo') NOT IN ('hablado', 'respondieron')
      -- CRÍTICO: Sin filtro de wa_number — excluir si CUALQUIER celular ya envió
      AND NOT EXISTS (
        SELECT 1 FROM blast_log bl
        WHERE bl.campaign_id = $1
          AND regexp_replace(bl.contact_phone, '[^0-9]', '', 'g') = regexp_replace(COALESCE(fs.data->>'telefono', ''), '[^0-9]', '', 'g')
          AND bl.status = 'sent'
      )
      AND NOT EXISTS (
        SELECT 1 FROM blast_blocklist bl2
        WHERE bl2.phone_digits = regexp_replace(COALESCE(fs.data->>'telefono', ''), '[^0-9]', '', 'g')
      )
  `);

  return new Set(rows.map(r => r.id));
}

// ── Capa 6: report-skips — visibilidad de skips en blast_log ───────────
// Registra cada skip con su razón para trazabilidad en el dashboard.
export async function reportSkips(params: {
  campaign_id: string;
  wa_number:   string;
  skips: {
    contact_id:    string | null;
    phone:         string;
    contact_phone: string;
    contact_name:  string | null;
    reason:        string;
  }[];
}): Promise<number> {
  const { campaign_id, wa_number, skips } = params;
  if (!skips.length) return 0;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const skip of skips) {
    placeholders.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
    );
    values.push(
      campaign_id,
      skip.contact_id,
      skip.phone,
      skip.contact_phone,
      skip.contact_name ?? null,
      'skipped',
      skip.reason,
      new Date(),
    );
  }

  const { rowCount } = await pool.query(`
    INSERT INTO blast_log (
      campaign_id, contact_id, phone, contact_phone, contact_name,
      status, message, sent_at, created_at
    )
    VALUES ${placeholders.join(', ')}
    ON CONFLICT DO NOTHING
  `, values);

  return rowCount ?? 0;
}
