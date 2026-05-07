import { Router } from "express";
import { sql } from "../sql.js";
import { db, classifyMessage } from "../db.js";

/**
 * Endpoints sueltos: stats globales, listado de operadores, reportes, lead
 * facets para filter UI, recommendations ("a quiénes hablar ahora"),
 * enrichment (datos cross-DB del lead).
 */
export const miscRouter = Router();

// ── Operators (used by web to assign sends) ──────────────────────────
miscRouter.get("/users", async (_req, res) => {
  res.json(await db.listOperators());
});

// ── Stats globales ───────────────────────────────────────────────────
miscRouter.get("/stats", async (_req, res) => res.json(await db.stats()));

// ── Lead enrichment (datos extra del ERP Escuela) ────────────────────
// Usa escuela_client_id + columnas pobladas via consolidate.sql.
miscRouter.get("/leads/:id/enrichment", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`
    SELECT
      l.id, l.escuela_client_id, l.dni, l.ocupacion, l.fecha_nacimiento,
      l.last_course, l.enrollments_count, l.certificates_count,
      l.buyer_tier, l.total_usd_spent, l.n_purchases,
      l.first_purchase_at, l.last_purchase_year,
      l.is_group, l.group_subject, l.last_chat_kind,
      l.needs_human_attention, l.attention_reason, l.attention_at
    FROM leads l
    WHERE l.id = ${id}
    LIMIT 1
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// ── Lead facets (countries, tags, courses, tiers, stages) ────────────
miscRouter.get("/lead-facets", async (_req, res) => {
  const [countries, tags, courses, tiers, stages] = await Promise.all([
    sql`
      SELECT country, count(*)::int AS n
      FROM leads WHERE country IS NOT NULL AND country <> ''
      GROUP BY country ORDER BY n DESC LIMIT 30
    `,
    sql`
      SELECT t AS tag, count(*)::int AS n
      FROM leads, unnest(tags) AS t
      WHERE t IS NOT NULL AND t <> ''
      GROUP BY t ORDER BY n DESC LIMIT 50
    `,
    sql`
      SELECT last_course AS course, count(*)::int AS n
      FROM leads WHERE last_course IS NOT NULL AND last_course <> ''
      GROUP BY last_course ORDER BY n DESC LIMIT 30
    `,
    sql`SELECT buyer_tier AS tier, count(*)::int AS n FROM leads WHERE buyer_tier IS NOT NULL GROUP BY buyer_tier ORDER BY n DESC`,
    sql`SELECT stage, count(*)::int AS n FROM leads WHERE stage IS NOT NULL GROUP BY stage ORDER BY n DESC`,
  ]);
  res.json({ countries, tags, courses, tiers, stages });
});

// ── Recommendations: "a quiénes hablar ahora" ────────────────────────
// Sistema de scoring: VIP inactivo / hot interest / stuck / cross-sell /
// ERP activo. Penalty si lo contactamos hace <24h.
miscRouter.get("/recommendations", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const reason = (req.query.reason as string) || "all";

  const rows = await sql`
    WITH lead_signals AS (
      SELECT
        l.id, l.name, l.phone, l.country, l.stage, l.tags, l.buyer_tier,
        l.total_usd_spent, l.n_purchases, l.last_course,
        l.escuela_client_id, l.dni, l.ocupacion,
        (SELECT MAX(created_at) FROM interactions
          WHERE lead_id = l.id AND kind = 'message_in') AS last_inbound,
        (SELECT MAX(created_at) FROM interactions
          WHERE lead_id = l.id AND kind = 'message_out') AS last_outbound,
        EXTRACT(DAY FROM now() - (SELECT MAX(created_at) FROM interactions
          WHERE lead_id = l.id AND kind = 'message_in'))::int AS days_since_in,
        (SELECT count(*) FROM interactions WHERE lead_id = l.id AND kind = 'message_in') AS msgs_in_count,
        EXISTS(
          SELECT 1 FROM unnest(l.tags) t
          WHERE t LIKE 'interés:%' OR t LIKE 'producto:%'
        ) AS has_interest_tag
      FROM leads l
      WHERE l.phone IS NOT NULL
    ),
    scored AS (
      SELECT *,
        CASE WHEN buyer_tier = 'vip' AND days_since_in BETWEEN 30 AND 365 THEN 30 ELSE 0 END
        + CASE WHEN has_interest_tag AND n_purchases = 0 AND days_since_in <= 14 THEN 35 ELSE 0 END
        + CASE WHEN stage = 'interested' AND days_since_in BETWEEN 3 AND 30 THEN 25 ELSE 0 END
        + CASE WHEN buyer_tier = 'repeat' AND days_since_in <= 60 THEN 20 ELSE 0 END
        + CASE WHEN n_purchases >= 1 AND last_course IS NOT NULL AND days_since_in <= 14 THEN 15 ELSE 0 END
        + CASE WHEN escuela_client_id IS NOT NULL AND days_since_in <= 7 THEN 25 ELSE 0 END
        - CASE WHEN last_outbound > now() - interval '1 day' THEN 30 ELSE 0 END
        AS score,

        ARRAY(
          SELECT r FROM (VALUES
            (CASE WHEN buyer_tier = 'vip' AND days_since_in BETWEEN 30 AND 365 THEN 'VIP inactivo' END),
            (CASE WHEN has_interest_tag AND n_purchases = 0 AND days_since_in <= 14 THEN 'Hot lead con interés' END),
            (CASE WHEN stage = 'interested' AND days_since_in BETWEEN 3 AND 30 THEN 'Interesado estancado' END),
            (CASE WHEN buyer_tier = 'repeat' AND days_since_in <= 60 THEN 'Repeat buyer' END),
            (CASE WHEN n_purchases >= 1 AND last_course IS NOT NULL AND days_since_in <= 14 THEN 'Cross-sell' END),
            (CASE WHEN escuela_client_id IS NOT NULL AND days_since_in <= 7 THEN 'Cliente ERP activo' END)
          ) AS t(r) WHERE r IS NOT NULL
        ) AS reasons
      FROM lead_signals
      WHERE days_since_in IS NOT NULL
    )
    SELECT id, name, phone, country, stage, tags, buyer_tier,
           total_usd_spent::float, n_purchases, last_course,
           escuela_client_id, days_since_in, msgs_in_count,
           score, reasons,
           last_inbound::text, last_outbound::text
    FROM scored
    WHERE score > 0
    ${reason === "vip_inactive"  ? sql`AND 'VIP inactivo' = ANY(reasons)` :
      reason === "hot_interest"  ? sql`AND 'Hot lead con interés' = ANY(reasons)` :
      reason === "stuck"         ? sql`AND 'Interesado estancado' = ANY(reasons)` :
      reason === "crosssell"     ? sql`AND 'Cross-sell' = ANY(reasons)` :
      sql``}
    ORDER BY score DESC, days_since_in ASC
    LIMIT ${limit}
  `;

  res.json({ items: rows });
});

// ── Reports daily (period=day | month | year) ────────────────────────
miscRouter.get("/reports/daily", async (req, res) => {
  const period = (req.query.period as string) || "day";
  const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  let rangeStart: string, rangeEnd: string, periodLabel: string;
  if (period === "year") {
    const year = dateStr.slice(0, 4);
    rangeStart = `${year}-01-01T00:00:00Z`;
    rangeEnd = `${year}-12-31T23:59:59Z`;
    periodLabel = year;
  } else if (period === "month") {
    const ym = dateStr.slice(0, 7);
    const [y, m] = ym.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    rangeStart = `${ym}-01T00:00:00Z`;
    rangeEnd = `${ym}-${lastDay}T23:59:59Z`;
    periodLabel = ym;
  } else {
    rangeStart = `${dateStr}T00:00:00Z`;
    rangeEnd = `${dateStr}T23:59:59Z`;
    periodLabel = dateStr;
  }

  const newLeads = await sql`
    SELECT id, name, phone, country, source, stage, buyer_tier, created_at
    FROM leads
    WHERE created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
    ORDER BY created_at DESC
    LIMIT 200
  `;

  const messagesIn = await sql`
    SELECT i.id, i.lead_id, i.body, i.created_at, i.by_user,
           l.name as lead_name, l.phone as lead_phone, l.country as lead_country, l.stage as lead_stage
    FROM interactions i
    JOIN leads l ON l.id = i.lead_id
    WHERE i.kind = 'message_in'
      AND i.created_at >= ${rangeStart} AND i.created_at <= ${rangeEnd}
    ORDER BY i.created_at DESC
    LIMIT 500
  `;

  const msgCounts = await sql`
    SELECT kind, count(*)::int as total
    FROM interactions
    WHERE kind IN ('message_in', 'message_out')
      AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
    GROUP BY kind
  `;
  const messagesInCount = msgCounts.find((r: any) => r.kind === "message_in")?.total || 0;
  const messagesOutCount = msgCounts.find((r: any) => r.kind === "message_out")?.total || 0;

  // Timeline chart: hourly (day) | daily (month) | monthly (year)
  let timelineData: { label: string; count: number }[];
  if (period === "year") {
    const byMonth = await sql`
      SELECT extract(month from created_at)::int as m, count(*)::int as count
      FROM interactions
      WHERE kind = 'message_in' AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
      GROUP BY m ORDER BY m
    `;
    const monthNames = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    timelineData = Array.from({ length: 12 }, (_, i) => ({
      label: monthNames[i + 1],
      count: byMonth.find((r: any) => r.m === i + 1)?.count || 0,
    }));
  } else if (period === "month") {
    const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const byDay = await sql`
      SELECT extract(day from created_at)::int as d, count(*)::int as count
      FROM interactions
      WHERE kind = 'message_in' AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
      GROUP BY d ORDER BY d
    `;
    timelineData = Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      count: byDay.find((r: any) => r.d === i + 1)?.count || 0,
    }));
  } else {
    const byHour = await sql`
      SELECT extract(hour from created_at)::int as hour, count(*)::int as count
      FROM interactions
      WHERE kind = 'message_in' AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
      GROUP BY hour ORDER BY hour
    `;
    timelineData = Array.from({ length: 24 }, (_, h) => ({
      label: `${h.toString().padStart(2, "0")}:00`,
      count: byHour.find((r: any) => r.hour === h)?.count || 0,
    }));
  }

  const uniqueLeads = await sql`
    SELECT count(DISTINCT lead_id)::int as total
    FROM interactions
    WHERE kind = 'message_in' AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
  `;

  const newLeadsCount = await sql`
    SELECT count(*)::int as total FROM leads
    WHERE created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
  `;

  const bySource = await sql`
    SELECT coalesce(source, 'desconocido') as source, count(*)::int as count
    FROM leads WHERE created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
    GROUP BY source ORDER BY count DESC
  `;

  const byCountry = await sql`
    SELECT coalesce(country, 'Sin país') as country, count(*)::int as count
    FROM leads WHERE created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
    GROUP BY country ORDER BY count DESC
  `;

  // Product interest detection — usa el mismo classifier que el auto-sync
  const productInterest: Record<string, { count: number; leads: { name: string; phone: string; body: string; time: string }[] }> = {};
  for (const msg of messagesIn) {
    const classified = classifyMessage(msg.body || "");
    for (const product of classified.products) {
      if (!productInterest[product]) productInterest[product] = { count: 0, leads: [] };
      productInterest[product].count++;
      productInterest[product].leads.push({
        name: msg.lead_name || msg.lead_phone || "Sin nombre",
        phone: msg.lead_phone || "",
        body: msg.body || "",
        time: msg.created_at,
      });
    }
  }

  const firstTimeContacts = await sql`
    SELECT l.id, l.name, l.phone, l.country, i.body, i.created_at as first_msg_at
    FROM leads l
    JOIN interactions i ON i.lead_id = l.id AND i.kind = 'message_in'
    WHERE l.created_at >= ${rangeStart} AND l.created_at <= ${rangeEnd}
      AND i.id = (SELECT min(i2.id) FROM interactions i2 WHERE i2.lead_id = l.id AND i2.kind = 'message_in')
    ORDER BY i.created_at DESC LIMIT 100
  `;

  res.json({
    date: periodLabel,
    period,
    range: { start: rangeStart, end: rangeEnd },
    summary: {
      new_leads: newLeadsCount[0]?.total || 0,
      messages_in: messagesInCount,
      messages_out: messagesOutCount,
      unique_leads_contacted: uniqueLeads[0]?.total || 0,
      first_time_contacts: firstTimeContacts.length,
    },
    timeline: timelineData,
    timeline_label: period === "year" ? "Mensajes por mes" : period === "month" ? "Mensajes por día" : "Mensajes por hora",
    by_source: bySource,
    by_country: byCountry,
    product_interest: Object.entries(productInterest)
      .filter(([, v]) => v.count > 0)
      .map(([product, v]) => ({ product, count: v.count, leads: v.leads.slice(0, 20) }))
      .sort((a, b) => b.count - a.count),
    new_leads: newLeads,
    first_contacts: firstTimeContacts,
    recent_messages: messagesIn.slice(0, 100).map((m: any) => ({
      id: m.id, lead_name: m.lead_name, lead_phone: m.lead_phone,
      lead_country: m.lead_country, lead_stage: m.lead_stage,
      body: m.body, time: m.created_at,
    })),
  });
});
