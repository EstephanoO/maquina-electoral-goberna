import { Router } from "express";
import { db } from "../db.js";
import { sql } from "../sql.js";
import type { AuthedRequest } from "../auth.js";

export const chatsRouter = Router();

// List all chats — agrupa por lead, ordena por último mensaje, calcula unread.
chatsRouter.get("/chats", async (req, res) => {
  const { assigned_to, q, limit: lim } = req.query as any;
  const limitN = Math.min(Number(lim) || 50, 200);

  const rows = await sql`
    WITH last_msg AS (
      SELECT DISTINCT ON (lead_id)
        lead_id, id as last_interaction_id, kind, body, created_at, by_user,
        COALESCE((meta->>'auto_reply')::boolean, false) AS is_auto_reply
      FROM interactions
      WHERE kind IN ('message_in', 'message_out')
      ORDER BY lead_id, created_at DESC
    ),
    unread AS (
      -- Cuenta inbounds posteriores al MAYOR de:
      --  (a) el último message_out (operador contestó), o
      --  (b) leads.last_read_at (operador abrió el chat sin contestar).
      -- Antes solo (a): abrir un chat sin responder no bajaba el badge.
      -- Fix de mark-as-read 2026-05-06.
      SELECT lead_id, count(*)::int as unread_count
      FROM interactions
      WHERE kind = 'message_in'
        AND created_at > GREATEST(
          COALESCE(
            (SELECT max(created_at) FROM interactions i2
             WHERE i2.lead_id = interactions.lead_id AND i2.kind = 'message_out'),
            '1970-01-01'::timestamptz
          ),
          COALESCE(
            (SELECT last_read_at FROM leads l WHERE l.id = interactions.lead_id),
            '1970-01-01'::timestamptz
          )
        )
      GROUP BY lead_id
    )
    SELECT
      l.id, l.name, l.phone, l.country, l.stage, l.buyer_tier,
      l.total_usd_spent, l.n_purchases, l.assigned_to,
      l.interests, l.tags, l.course,
      lm.body as last_message,
      lm.kind as last_message_kind,
      lm.created_at as last_message_at,
      lm.is_auto_reply as last_message_is_bot,
      COALESCE(u.unread_count, 0) as unread_count
    FROM leads l
    JOIN last_msg lm ON lm.lead_id = l.id
    LEFT JOIN unread u ON u.lead_id = l.id
    WHERE
      (${assigned_to ?? null}::text IS NULL OR l.assigned_to = ${assigned_to ?? null})
      AND (${(q as string) ?? null}::text IS NULL OR
           lower(l.name) LIKE '%' || ${((q as string) ?? "").toLowerCase()} || '%' OR
           lower(coalesce(l.phone, '')) LIKE '%' || ${((q as string) ?? "").toLowerCase()} || '%')
    ORDER BY lm.created_at DESC
    LIMIT ${limitN}
  `;

  res.json(rows.map((r: any) => ({
    lead_id: r.id, name: r.name, phone: r.phone, country: r.country,
    stage: r.stage, buyer_tier: r.buyer_tier,
    total_usd_spent: Number(r.total_usd_spent) || 0,
    n_purchases: r.n_purchases || 0,
    assigned_to: r.assigned_to,
    interests: r.interests || [], tags: r.tags || [], course: r.course,
    last_message: r.last_message,
    last_message_kind: r.last_message_kind,
    last_message_at: r.last_message_at,
    last_message_is_bot: !!r.last_message_is_bot,
    unread_count: r.unread_count,
  })));
});

// Detail panel para CRM: lead + purchases + actividad reciente
chatsRouter.get("/chats/:leadId/detail", async (req, res) => {
  const leadId = Number(req.params.leadId);
  const lead = await db.get(leadId);
  if (!lead) return res.status(404).json({ error: "not found" });

  const purchases = await sql`
    SELECT id, body, meta, created_at FROM interactions
    WHERE lead_id = ${leadId} AND kind = 'purchase'
    ORDER BY created_at DESC
  `;
  const activity = await sql`
    SELECT id, kind, body, meta, by_user, created_at FROM interactions
    WHERE lead_id = ${leadId}
    ORDER BY created_at DESC LIMIT 20
  `;

  res.json({
    lead,
    purchases: purchases.map((p: any) => ({
      id: p.id, product: p.meta?.product || "Producto",
      amount_usd: Number(p.meta?.amount_usd) || 0,
      method: p.meta?.method || null,
      date: p.created_at,
    })),
    activity: activity.map((a: any) => ({
      id: a.id, kind: a.kind, body: a.body, by: a.by_user, meta: a.meta, time: a.created_at,
    })),
  });
});

// Messages thread para chat UI (ordenado oldest-first para render)
chatsRouter.get("/chats/:leadId/messages", async (req, res) => {
  const leadId = Number(req.params.leadId);
  const { before, limit: lim } = req.query as any;
  const limitN = Math.min(Number(lim) || 50, 200);

  const rows = await sql`
    SELECT id, lead_id, kind, body, meta, by_user, created_at, external_id
    FROM interactions
    WHERE lead_id = ${leadId}
      AND kind IN ('message_in', 'message_out')
      AND (${before ?? null}::timestamptz IS NULL OR created_at < ${before ?? null})
    ORDER BY created_at DESC
    LIMIT ${limitN}
  `;

  res.json(rows.reverse().map((r: any) => ({
    id: r.id, kind: r.kind, body: r.body, by: r.by_user, time: r.created_at, meta: r.meta,
  })));
});

// Manda mensaje vía bot. Auto-detecta instancia: explicit `via` → assigned_to →
// primer instance con status=ready.
chatsRouter.post("/chats/:leadId/send", async (req: AuthedRequest, res) => {
  const leadId = Number(req.params.leadId);
  const { message, via } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const lead = await db.get(leadId);
  if (!lead) return res.status(404).json({ error: "lead not found" });
  if (!lead.phone) return res.status(400).json({ error: "lead has no phone" });

  const botUrl = process.env.BOT_URL || "http://bot:4020";

  let instanceId = via || "";
  if (!instanceId && lead.assigned_to) {
    // Mantenemos aliases legacy peru1..4 — números nuevos se resuelven via /bot/status
    if (lead.assigned_to.includes("986855496")) instanceId = "peru1";
    else if (lead.assigned_to.includes("986394450")) instanceId = "peru2";
    else if (lead.assigned_to.includes("954562435")) instanceId = "peru3";
    else if (lead.assigned_to.includes("944531711")) instanceId = "peru4";
  }
  if (!instanceId) {
    try {
      const statusRes = await fetch(`${botUrl}/status`);
      const statuses = await statusRes.json() as any[];
      const ready = statuses.find((s: any) => s.status === "ready");
      if (ready) instanceId = ready.id;
    } catch { /* fallback below */ }
  }
  if (!instanceId) instanceId = "peru1";

  try {
    const botRes = await fetch(`${botUrl}/send/${instanceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: lead.phone, message }),
    });
    if (!botRes.ok) {
      const err = await botRes.text();
      return res.status(502).json({ error: `bot: ${instanceId} — ${err}` });
    }
    const interaction = await db.addInteraction(leadId, {
      kind: "message_out",
      body: message,
      by: req.user?.email || instanceId,
    });
    res.json({ ok: true, interaction });
  } catch (e: any) {
    res.status(502).json({ error: `bot unreachable: ${e.message}` });
  }
});

// Mark chat as read — setea last_read_at para que el unread_count baje sin
// que el operador tenga que contestar. Frontend lo llama en chat select.
chatsRouter.post("/chats/:leadId/read", async (req, res) => {
  const leadId = Number(req.params.leadId);
  if (!Number.isFinite(leadId)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`
    UPDATE leads SET last_read_at = now()
    WHERE id = ${leadId}
    RETURNING id, last_read_at
  `;
  if (!rows[0]) return res.status(404).json({ error: "lead_not_found" });
  res.json({ ok: true, lead_id: rows[0].id, last_read_at: rows[0].last_read_at });
});

// Chats v2 con tabs (dm / group / attention)
chatsRouter.get("/chats/v2", async (req, res) => {
  const tab = (req.query.tab as string) || "all";
  const search = (req.query.q as string)?.toLowerCase() ?? null;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const filters: string[] = [];
  if (tab === "dm")        filters.push("is_group = FALSE");
  if (tab === "group")     filters.push("is_group = TRUE");
  if (tab === "attention") filters.push("needs_human_attention = TRUE");

  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const searchClause = search
    ? `AND (lower(name) LIKE '%' || $1 || '%' OR phone LIKE '%' || $1 || '%' OR lower(coalesce(group_subject,'')) LIKE '%' || $1 || '%')`
    : "";

  const queryStr = `
    SELECT * FROM v_chats_summary
    ${where}
    ${searchClause}
    ORDER BY needs_human_attention DESC, last_message_at DESC NULLS LAST
    LIMIT ${limit}
  `;

  const rows = search
    ? await sql.unsafe(queryStr, [search])
    : await sql.unsafe(queryStr);

  const counts = await sql`
    SELECT
      count(*) FILTER (WHERE is_group = FALSE) AS dm,
      count(*) FILTER (WHERE is_group = TRUE)  AS group_,
      count(*) FILTER (WHERE needs_human_attention) AS attention,
      count(*) AS total
    FROM v_chats_summary
  `;

  res.json({ chats: rows, counts: counts[0] });
});
