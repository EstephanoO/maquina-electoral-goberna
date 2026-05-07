import { Router } from "express";
import { db, type LeadInput } from "../db.js";
import { safe } from "../middleware/safe.js";

export const leadsRouter = Router();

leadsRouter.get("/leads/count", safe(async (req, res) => {
  const { q, stage, buyer_tier, country, year } = req.query as any;
  res.json(await db.count({ q, stage, buyer_tier, country, year }));
}));

leadsRouter.get("/leads", safe(async (req, res) => {
  const {
    q, stage, course, interest, level, year, tag, assigned_to, priority,
    follow_up_due, buyer_tier, country, limit, offset,
  } = req.query as any;
  res.json(await db.list({
    q, stage, course, interest, level, year, tag, assigned_to, priority, buyer_tier, country,
    follow_up_due: follow_up_due === "true" || follow_up_due === "1",
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  }));
}));

leadsRouter.get("/leads/by-phone/:phone", async (req, res) => {
  const lead = await db.findByPhone(req.params.phone);
  if (!lead) return res.status(404).json({ error: "not_found" });
  res.json(lead);
});

leadsRouter.get("/leads/:id", async (req, res) => {
  const lead = await db.get(Number(req.params.id));
  if (!lead) return res.status(404).json({ error: "not_found" });
  res.json(lead);
});

leadsRouter.post("/leads", async (req, res) => {
  const body = req.body as LeadInput;
  if (!body?.name && !body?.phone) return res.status(400).json({ error: "name_or_phone_required" });
  if (body.phone) {
    const existing = await db.findByPhone(body.phone);
    if (existing) {
      const updated = await db.update(existing.id, body);
      if (body.last_activity_at && !existing.last_contacted_at) {
        await db.backfillActivity(existing.id, body.last_activity_at, body.assigned_to ?? existing.assigned_to ?? null);
      }
      return res.json(updated);
    }
  }
  try {
    const lead = await db.create({ ...body, name: body.name || body.phone! });
    res.status(201).json(lead);
  } catch (e: any) {
    if (e?.code === "23505" && body.phone) {
      try {
        const digits = body.phone.replace(/\D/g, "");
        const { sql } = await import("../sql.js");
        const rows = await sql`SELECT id FROM leads WHERE regexp_replace(phone, '\\D', '', 'g') = ${digits} LIMIT 1`;
        if (rows[0]) return res.json(await db.update(rows[0].id, body));
      } catch { /* ignore */ }
    }
    res.status(409).json({ error: "duplicate_phone" });
  }
});

leadsRouter.patch("/leads/:id", async (req, res) => {
  const updated = await db.update(Number(req.params.id), req.body as LeadInput);
  if (!updated) return res.status(404).json({ error: "not_found" });
  res.json(updated);
});

leadsRouter.delete("/leads/:id", async (req, res) => {
  const ok = await db.remove(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "not_found" });
  res.status(204).end();
});

leadsRouter.post("/leads/bulk", async (req, res) => {
  try {
    const { ids, patch } = req.body as { ids: number[]; patch: LeadInput };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids_required" });
    const results = [];
    for (const id of ids) {
      try {
        const r = await db.update(id, patch);
        if (r) results.push(r);
      } catch (e: any) {
        console.warn(`[bulk] Failed to update lead ${id}:`, e.message);
      }
    }
    res.json({ updated: results.length, leads: results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
