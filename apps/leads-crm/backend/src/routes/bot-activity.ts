import { Router } from "express";
import { sql } from "../sql.js";

/**
 * Bot activity dashboard — todo lo que el frontend pulla para visualizar
 * estado del bot hoy / serie 14d / drilldowns por country, hour, intent,
 * top leads, data quality, etc. Read-only excepto rule-hit (incrementa
 * hits_count batch).
 */
export const botActivityRouter = Router();

botActivityRouter.get("/bot-activity/today", async (_req, res) => {
  const rows = await sql`SELECT * FROM v_bot_activity_today`;
  res.json(rows[0] ?? {});
});

botActivityRouter.get("/bot-activity/daily", async (req, res) => {
  const days = Math.min(Number(req.query.days) || 14, 60);
  const rows = await sql.unsafe(`
    SELECT
      created_at::date AS day,
      count(*) FILTER (WHERE kind = 'message_in')::int AS msgs_in,
      count(*) FILTER (WHERE kind = 'message_out' AND (meta->>'auto_reply')::bool IS TRUE)::int AS auto_replies,
      count(*) FILTER (WHERE kind = 'message_out' AND ((meta->>'auto_reply')::bool IS NULL OR (meta->>'auto_reply')::bool = false))::int AS msgs_manual,
      count(DISTINCT lead_id) FILTER (WHERE kind = 'message_in')::int AS unique_leads
    FROM interactions
    WHERE created_at >= current_date - interval '${days} days'
    GROUP BY 1 ORDER BY 1 DESC
  `);
  res.json({ items: rows });
});

botActivityRouter.get("/bot-activity/templates", async (_req, res) => {
  const rows = await sql`SELECT * FROM v_template_stats LIMIT 30`;
  res.json({ items: rows });
});

botActivityRouter.get("/bot-activity/hot-leads", async (_req, res) => {
  const rows = await sql`SELECT * FROM v_hot_leads`;
  res.json({ items: rows });
});

botActivityRouter.get("/bot-activity/rules", async (_req, res) => {
  const rows = await sql`
    SELECT id, name, source, hits_count, last_hit_at, enabled, tag
      FROM ai_rules
     WHERE enabled = TRUE
     ORDER BY hits_count DESC, id ASC
     LIMIT 50
  `;
  res.json({ items: rows });
});

// Bot reporta qué reglas matcheó (incrementa hits_count batch).
botActivityRouter.post("/bot-activity/rule-hit", async (req, res) => {
  const ids = (req.body?.rule_ids ?? []) as number[];
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ ok: true });
  await sql`SELECT increment_rule_hits(${ids}::int[])`;
  res.json({ ok: true });
});

// Stale lead recovery on-demand
botActivityRouter.post("/bot-activity/recover-stale", async (_req, res) => {
  const r = await sql`SELECT mark_stale_leads_followup() AS affected`;
  res.json({ affected: Number(r[0]?.affected ?? 0) });
});

botActivityRouter.get("/bot-activity/by-country", async (_req, res) => {
  const rows = await sql`
    SELECT l.country AS country, count(*)::int AS msgs
      FROM interactions i
      JOIN leads l ON l.id = i.lead_id
     WHERE i.created_at::date = current_date
       AND i.kind = 'message_in'
       AND l.country IS NOT NULL
     GROUP BY l.country
     ORDER BY msgs DESC
     LIMIT 12
  `;
  res.json({ items: rows });
});

// Distribución por hora (Lima TZ)
botActivityRouter.get("/bot-activity/by-hour", async (_req, res) => {
  const rows = await sql`
    SELECT
      EXTRACT(HOUR FROM i.created_at AT TIME ZONE 'America/Lima')::int AS hour,
      count(*) FILTER (WHERE i.kind = 'message_in')::int AS in_count,
      count(*) FILTER (WHERE i.kind = 'message_out')::int AS out_count
    FROM interactions i
    WHERE i.created_at::date = current_date
    GROUP BY 1
    ORDER BY 1
  `;
  res.json({ items: rows });
});

// Intents detectados HOY (regex match a reglas activas)
botActivityRouter.get("/bot-activity/intents-today", async (_req, res) => {
  const rows = await sql`
    WITH today_intents AS (
      SELECT DISTINCT ON (i.lead_id, r.id)
        r.tag, r.name, r.source
      FROM interactions i
      JOIN ai_rules r ON r.enabled = TRUE
      WHERE i.kind = 'message_in'
        AND i.created_at::date = current_date
        AND i.body IS NOT NULL
        AND i.body ~* r.pattern
    )
    SELECT tag, source, count(*)::int AS leads
      FROM today_intents
     GROUP BY tag, source
     ORDER BY leads DESC
     LIMIT 20
  `;
  res.json({ items: rows });
});

// Top 10 leads más activos hoy
botActivityRouter.get("/bot-activity/top-active-leads", async (_req, res) => {
  const rows = await sql`
    SELECT
      l.id, l.name, l.phone, l.country, l.stage, l.buyer_tier,
      count(*) FILTER (WHERE i.kind = 'message_in')::int  AS in_count,
      count(*) FILTER (WHERE i.kind = 'message_out')::int AS out_count,
      l.attention_reason, l.needs_human_attention
    FROM interactions i
    JOIN leads l ON l.id = i.lead_id
    WHERE i.created_at::date = current_date
    GROUP BY l.id
    ORDER BY count(*) DESC
    LIMIT 10
  `;
  res.json({ items: rows });
});

// Últimos mensajes IN (para feed)
botActivityRouter.get("/bot-activity/recent-messages", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 15, 50);
  const rows = await sql`
    SELECT
      i.id, i.created_at, i.body,
      i.meta->>'message_type' AS type,
      l.id AS lead_id, l.name AS lead_name, l.country, l.buyer_tier,
      l.needs_human_attention
    FROM interactions i
    JOIN leads l ON l.id = i.lead_id
    WHERE i.created_at::date = current_date
      AND i.kind = 'message_in'
    ORDER BY i.id DESC
    LIMIT ${limit}
  `;
  res.json({ items: rows });
});

// Stats globales más profundas hoy
botActivityRouter.get("/bot-activity/today-deep", async (_req, res) => {
  const stats = await sql`
    SELECT
      count(*) FILTER (WHERE i.kind = 'message_in')::int AS msgs_in,
      count(*) FILTER (WHERE i.kind = 'message_in' AND i.meta->>'message_type' IN ('image','video','document','audio'))::int AS media_in,
      count(*) FILTER (WHERE i.kind = 'message_out')::int AS msgs_out,
      count(*) FILTER (WHERE i.kind = 'message_out' AND (i.meta->>'auto_reply')::bool IS TRUE)::int AS auto_replies,
      count(*) FILTER (WHERE i.kind = 'message_out' AND i.meta->>'message_type' IN ('image','video','document','audio'))::int AS media_out,
      count(DISTINCT i.lead_id) FILTER (WHERE i.kind = 'message_in')::int AS unique_leads_in,
      count(DISTINCT i.lead_id) FILTER (WHERE i.kind = 'message_out' AND (i.meta->>'auto_reply')::bool IS TRUE)::int AS unique_leads_replied,
      count(*) FILTER (WHERE i.kind = 'message_out' AND (i.meta->>'holding')::bool IS TRUE)::int AS holdings,
      count(*) FILTER (WHERE i.kind = 'message_out' AND (i.meta->>'agenda_proposed')::bool IS TRUE)::int AS agenda_proposed,
      count(*) FILTER (WHERE i.kind = 'message_out' AND (i.meta->>'agenda_confirmed')::bool IS TRUE)::int AS agenda_confirmed
    FROM interactions i
    WHERE i.created_at::date = current_date
  `;
  const newLeads = await sql`
    SELECT count(*)::int AS new_leads FROM leads WHERE created_at::date = current_date
  `;
  const sales = await sql`
    SELECT count(*)::int AS sold_today
      FROM interactions
     WHERE created_at::date = current_date
       AND kind = 'stage_change'
       AND meta->>'to_stage' = 'sold'
  `;
  res.json({
    ...stats[0],
    new_leads_today: newLeads[0].new_leads,
    auto_sold_today: sales[0].sold_today,
  });
});

// Personas únicas que nos hablaron — series 14 días
botActivityRouter.get("/bot-activity/people-daily", async (req, res) => {
  const days = Math.min(Number(req.query.days) || 14, 60);
  const rows = await sql`
    SELECT
      i.created_at::date AS day,
      count(DISTINCT i.lead_id)::int AS people_in,
      count(DISTINCT i.lead_id) FILTER (WHERE l.created_at::date = i.created_at::date)::int AS new_people
    FROM interactions i
    JOIN leads l ON l.id = i.lead_id
    WHERE i.kind = 'message_in'
      AND i.created_at >= current_date - (${days}::int * INTERVAL '1 day')
    GROUP BY 1
    ORDER BY 1 DESC
  `;
  res.json({ items: rows });
});

// Calidad de datos — qué tan completos están los leads
botActivityRouter.get("/bot-activity/data-quality", async (_req, res) => {
  const stats = await sql`
    WITH base AS (
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE name IS NOT NULL AND name <> '' AND name <> phone)::int AS with_name,
        count(*) FILTER (WHERE email IS NOT NULL AND email <> '')::int                       AS with_email,
        count(*) FILTER (WHERE country IS NOT NULL AND country <> 'Unknown')::int            AS with_country,
        count(*) FILTER (WHERE dni IS NOT NULL AND dni <> '')::int                           AS with_dni,
        count(*) FILTER (WHERE ocupacion IS NOT NULL AND ocupacion <> '')::int               AS with_ocupacion,
        count(*) FILTER (WHERE stage IS NOT NULL AND stage <> 'lead')::int                   AS with_stage,
        count(*) FILTER (WHERE buyer_tier IS NOT NULL AND buyer_tier <> '')::int             AS with_tier,
        count(*) FILTER (WHERE escuela_client_id IS NOT NULL)::int                           AS with_escuela_link,
        count(*) FILTER (WHERE last_course IS NOT NULL AND last_course <> '')::int           AS with_last_course
      FROM leads
      WHERE is_group IS NOT TRUE
    ),
    today_engaged AS (
      SELECT count(DISTINCT i.lead_id)::int AS people
        FROM interactions i
        JOIN leads l ON l.id = i.lead_id
       WHERE i.kind = 'message_in'
         AND i.created_at::date = current_date
         AND l.is_group IS NOT TRUE
    ),
    today_unknown AS (
      SELECT
        count(DISTINCT l.id) FILTER (WHERE l.country IS NULL OR l.country = 'Unknown')::int AS no_country,
        count(DISTINCT l.id) FILTER (WHERE l.name IS NULL OR l.name = '' OR l.name = l.phone)::int AS no_name,
        count(DISTINCT l.id) FILTER (WHERE l.email IS NULL OR l.email = '')::int AS no_email
      FROM interactions i
      JOIN leads l ON l.id = i.lead_id
     WHERE i.kind = 'message_in'
       AND i.created_at::date = current_date
       AND l.is_group IS NOT TRUE
    ),
    tags AS (
      SELECT count(*)::int AS leads_with_tags FROM leads WHERE is_group IS NOT TRUE AND cardinality(tags) > 0
    )
    SELECT b.*, te.people AS engaged_today,
           tu.no_country AS today_no_country,
           tu.no_name    AS today_no_name,
           tu.no_email   AS today_no_email,
           t.leads_with_tags
      FROM base b CROSS JOIN today_engaged te CROSS JOIN today_unknown tu CROSS JOIN tags t
  `;
  res.json(stats[0]);
});
