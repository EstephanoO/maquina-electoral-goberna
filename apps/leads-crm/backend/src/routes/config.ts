import { Router } from "express";
import { sql } from "../sql.js";

/**
 * Config CRUD: bot_instances, pipeline_stages, bank_accounts. Todos protegidos
 * por auth (excepto los GETs que el bot lee internamente sin token — listados
 * en bot-allow.ts).
 */
export const configRouter = Router();

// ── Pipeline stages ─────────────────────────────────────────────────
configRouter.get("/config/pipeline", async (_req, res) => {
  const rows = await sql`
    SELECT id, key, label, color, position, enabled, group_name
      FROM pipeline_stages
     ORDER BY position ASC
  `;
  res.json({ stages: rows });
});

configRouter.put("/config/pipeline", async (req, res) => {
  const stages = (req.body?.stages ?? []) as Array<{
    id?: number; key: string; label: string; color?: string;
    position?: number; enabled?: boolean; group_name?: string;
  }>;
  if (!Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({ error: "stages_required" });
  }
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (!s.key || !s.label) continue;
    await sql`
      INSERT INTO pipeline_stages (key, label, color, position, enabled, group_name)
      VALUES (${s.key}, ${s.label}, ${s.color ?? 'bg-slate-100 text-slate-800'},
              ${s.position ?? i}, ${s.enabled ?? true}, ${s.group_name ?? 'sale'})
      ON CONFLICT (key) DO UPDATE SET
        label = EXCLUDED.label, color = EXCLUDED.color,
        position = EXCLUDED.position, enabled = EXCLUDED.enabled,
        group_name = EXCLUDED.group_name, updated_at = now()
    `;
  }
  const rows = await sql`SELECT id, key, label, color, position, enabled, group_name FROM pipeline_stages ORDER BY position ASC`;
  res.json({ stages: rows });
});

// ── Bot instances ────────────────────────────────────────────────────
configRouter.get("/config/instances", async (_req, res) => {
  const rows = await sql`
    SELECT id, slug, display_name, phone, agent_name, agent_signature,
           product_skus, cuenta_bancaria, yape_numero, extra_prompt,
           rule_ids, enabled, auto_reply, escalation_phone, auto_reply_whitelist, notes,
           created_at, updated_at
      FROM bot_instances
     ORDER BY slug ASC
  `;
  res.json({ instances: rows });
});

configRouter.post("/config/instances", async (req, res) => {
  const b = req.body ?? {};
  if (!b.slug || !b.display_name) {
    return res.status(400).json({ error: "slug_and_display_name_required" });
  }
  const rows = await sql`
    INSERT INTO bot_instances (slug, display_name, phone, agent_name, agent_signature,
                               product_skus, cuenta_bancaria, yape_numero, extra_prompt,
                               rule_ids, enabled, auto_reply, notes)
    VALUES (${b.slug}, ${b.display_name}, ${b.phone ?? null},
            ${b.agent_name ?? 'Goberna'}, ${b.agent_signature ?? null},
            ${b.product_skus ?? null}, ${b.cuenta_bancaria ?? null}, ${b.yape_numero ?? null},
            ${b.extra_prompt ?? null}, ${b.rule_ids ?? null},
            ${b.enabled ?? true}, ${b.auto_reply ?? false}, ${b.notes ?? null})
    RETURNING *
  `;
  res.json(rows[0]);
});

configRouter.put("/config/instances/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const b = req.body ?? {};
  const rows = await sql`
    UPDATE bot_instances SET
      slug            = COALESCE(${b.slug ?? null}, slug),
      display_name    = COALESCE(${b.display_name ?? null}, display_name),
      phone           = ${b.phone ?? null},
      agent_name      = COALESCE(${b.agent_name ?? null}, agent_name),
      agent_signature = ${b.agent_signature ?? null},
      product_skus    = ${b.product_skus ?? null},
      cuenta_bancaria = ${b.cuenta_bancaria ?? null},
      yape_numero     = ${b.yape_numero ?? null},
      extra_prompt    = ${b.extra_prompt ?? null},
      rule_ids        = ${b.rule_ids ?? null},
      enabled         = COALESCE(${b.enabled ?? null}, enabled),
      auto_reply      = COALESCE(${b.auto_reply ?? null}, auto_reply),
      escalation_phone= ${b.escalation_phone ?? null},
      notes           = ${b.notes ?? null},
      updated_at      = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// Copia config de un instance a otro (excluye slug/phone/display_name)
configRouter.post("/config/instances/:id/copy-from/:fromId", async (req, res) => {
  const id = Number(req.params.id);
  const fromId = Number(req.params.fromId);
  if (!Number.isFinite(id) || !Number.isFinite(fromId)) return res.status(400).json({ error: "invalid_id" });
  const src = await sql`SELECT * FROM bot_instances WHERE id = ${fromId}`;
  if (src.length === 0) return res.status(404).json({ error: "source_not_found" });
  const s = src[0];
  const rows = await sql`
    UPDATE bot_instances SET
      agent_name      = ${s.agent_name},
      agent_signature = ${s.agent_signature},
      product_skus    = ${s.product_skus},
      cuenta_bancaria = ${s.cuenta_bancaria},
      yape_numero     = ${s.yape_numero},
      extra_prompt    = ${s.extra_prompt},
      rule_ids        = ${s.rule_ids},
      updated_at      = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "target_not_found" });
  res.json(rows[0]);
});

configRouter.delete("/config/instances/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  // Soft delete — preservamos data histórica.
  await sql`UPDATE bot_instances SET enabled = FALSE, updated_at = now() WHERE id = ${id}`;
  res.json({ ok: true, id });
});

// ── Bank accounts ────────────────────────────────────────────────────
configRouter.get("/config/banks", async (_req, res) => {
  const rows = await sql`SELECT * FROM bank_accounts ORDER BY is_default DESC, name ASC`;
  res.json({ banks: rows });
});

configRouter.post("/config/banks", async (req, res) => {
  const b = req.body ?? {};
  if (!b.name || !b.body) return res.status(400).json({ error: "name_and_body_required" });
  if (b.is_default === true) {
    await sql`UPDATE bank_accounts SET is_default = FALSE`;
  }
  const rows = await sql`
    INSERT INTO bank_accounts (name, body, yape_numero, is_default)
    VALUES (${b.name}, ${b.body}, ${b.yape_numero ?? null}, ${b.is_default ?? false})
    RETURNING *
  `;
  res.json(rows[0]);
});

configRouter.put("/config/banks/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const b = req.body ?? {};
  if (b.is_default === true) {
    await sql`UPDATE bank_accounts SET is_default = FALSE WHERE id <> ${id}`;
  }
  const rows = await sql`
    UPDATE bank_accounts SET
      name = COALESCE(${b.name ?? null}, name),
      body = COALESCE(${b.body ?? null}, body),
      yape_numero = ${b.yape_numero ?? null},
      is_default = COALESCE(${b.is_default ?? null}, is_default),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

configRouter.delete("/config/banks/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  await sql`DELETE FROM bank_accounts WHERE id = ${id}`;
  res.json({ ok: true });
});
