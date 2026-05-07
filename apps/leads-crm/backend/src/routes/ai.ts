import { Router } from "express";
import { sql } from "../sql.js";
import { embedRuleInBackground } from "../services/embed.js";
import type { AuthedRequest } from "../auth.js";

/**
 * AI training endpoints: rules + prompt + feedback + sandbox. Sistema de
 * personalización del classifier. Migration 012 crea las tablas. El bot
 * lee /ai/rules con cache 60s.
 *
 *   /ai/rules         — CRUD reglas regex → tag
 *   /ai/prompt        — singleton: contexto + categorías + few-shot para Gemini
 *   /ai/feedback      — loop de correcciones del operador
 *   /ai/test-classify — sandbox: paste text, ver tags sin persistir
 */
export const aiRouter = Router();

aiRouter.get("/ai/rules", async (_req, res) => {
  const rows = await sql`
    SELECT id, name, description, pattern, tag, weight, enabled, hits_count, last_hit_at, source,
           created_by, created_at, updated_at
    FROM ai_rules
    ORDER BY enabled DESC, hits_count DESC, id DESC
  `;
  res.json(rows);
});

aiRouter.post("/ai/rules", async (req: AuthedRequest, res) => {
  const { name, description, pattern, tag, weight, enabled } = req.body ?? {};
  if (!name || !pattern || !tag) {
    return res.status(400).json({ error: "name_pattern_tag_required" });
  }
  try { new RegExp(pattern); } catch (e: any) {
    return res.status(400).json({ error: "invalid_regex", message: e.message });
  }
  const createdBy = req.user?.email ?? "ui";
  const rows = await sql`
    INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, created_by)
    VALUES (${name}, ${description ?? null}, ${pattern}, ${tag},
            ${typeof weight === "number" ? weight : 1.0},
            ${enabled !== false}, ${createdBy})
    RETURNING *
  `;
  // Embed name como canonical-example para semantic intent fallback.
  embedRuleInBackground(rows[0].id, rows[0].name);
  res.status(201).json(rows[0]);
});

aiRouter.patch("/ai/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const { name, description, pattern, tag, weight, enabled } = req.body ?? {};
  if (pattern !== undefined) {
    try { new RegExp(pattern); } catch (e: any) {
      return res.status(400).json({ error: "invalid_regex", message: e.message });
    }
  }
  const rows = await sql`
    UPDATE ai_rules SET
      name        = COALESCE(${name ?? null}, name),
      description = COALESCE(${description ?? null}, description),
      pattern     = COALESCE(${pattern ?? null}, pattern),
      tag         = COALESCE(${tag ?? null}, tag),
      weight      = COALESCE(${typeof weight === "number" ? weight : null}, weight),
      enabled     = COALESCE(${typeof enabled === "boolean" ? enabled : null}, enabled),
      updated_at  = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: "not_found" });
  // Si name cambió (o es nueva sin embedding), re-embed.
  if (name !== undefined) {
    embedRuleInBackground(rows[0].id, rows[0].name);
  }
  res.json(rows[0]);
});

aiRouter.delete("/ai/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  await sql`DELETE FROM ai_rules WHERE id = ${id}`;
  res.json({ ok: true });
});

aiRouter.get("/ai/prompt", async (_req, res) => {
  const rows = await sql`SELECT * FROM ai_prompt_override WHERE id = 1`;
  if (!rows[0]) {
    // Defensa: si no hay row singleton (no debería pasar por el INSERT del migration).
    await sql`INSERT INTO ai_prompt_override (id, extra_context, extra_categories, few_shot_examples) VALUES (1, '', '', '[]'::jsonb)`;
    const fresh = await sql`SELECT * FROM ai_prompt_override WHERE id = 1`;
    return res.json(fresh[0]);
  }
  res.json(rows[0]);
});

aiRouter.patch("/ai/prompt", async (req: AuthedRequest, res) => {
  const { extra_context, extra_categories, few_shot_examples, enabled } = req.body ?? {};
  const updatedBy = req.user?.email ?? "ui";
  const rows = await sql`
    UPDATE ai_prompt_override SET
      extra_context     = COALESCE(${extra_context ?? null}, extra_context),
      extra_categories  = COALESCE(${extra_categories ?? null}, extra_categories),
      few_shot_examples = COALESCE(${few_shot_examples !== undefined ? sql.json(few_shot_examples) : null}, few_shot_examples),
      enabled           = COALESCE(${typeof enabled === "boolean" ? enabled : null}, enabled),
      updated_by        = ${updatedBy},
      updated_at        = now()
    WHERE id = 1
    RETURNING *
  `;
  res.json(rows[0]);
});

aiRouter.post("/ai/feedback", async (req: AuthedRequest, res) => {
  const { lead_id, interaction_id, message_text, original_tags, corrected_tags, reason } = req.body ?? {};
  if (!message_text || !Array.isArray(corrected_tags)) {
    return res.status(400).json({ error: "message_text_and_corrected_tags_required" });
  }
  const createdBy = req.user?.email ?? "ui";
  const rows = await sql`
    INSERT INTO ai_feedback (
      lead_id, interaction_id, message_text, original_tags, corrected_tags, reason, created_by
    ) VALUES (
      ${lead_id ?? null}, ${interaction_id ?? null}, ${message_text},
      ${original_tags ?? []}, ${corrected_tags},
      ${reason ?? null}, ${createdBy}
    ) RETURNING *
  `;
  res.status(201).json(rows[0]);
});

aiRouter.get("/ai/feedback", async (req, res) => {
  const status = (req.query.status as string) ?? "pending";
  const rows = await sql`
    SELECT f.*, l.name AS lead_name, l.phone AS lead_phone
    FROM ai_feedback f
    LEFT JOIN leads l ON l.id = f.lead_id
    WHERE f.status = ${status}
    ORDER BY f.created_at DESC
    LIMIT 200
  `;
  res.json(rows);
});

aiRouter.post("/ai/feedback/:id/promote", async (req: AuthedRequest, res) => {
  const fid = Number(req.params.id);
  const { name, pattern, tag, weight } = req.body ?? {};
  if (!name || !pattern || !tag) return res.status(400).json({ error: "name_pattern_tag_required" });
  try { new RegExp(pattern); } catch (e: any) {
    return res.status(400).json({ error: "invalid_regex", message: e.message });
  }
  const createdBy = req.user?.email ?? "promote";
  const rule = await sql`
    INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, created_by)
    VALUES (${name}, ${"Promovida desde feedback #" + fid}, ${pattern}, ${tag},
            ${typeof weight === "number" ? weight : 1.0}, TRUE, ${createdBy})
    RETURNING *
  `;
  await sql`
    UPDATE ai_feedback SET
      promoted_to_rule_id = ${rule[0]!.id},
      status              = 'promoted',
      resolved_at         = now()
    WHERE id = ${fid}
  `;
  res.status(201).json(rule[0]);
});

aiRouter.post("/ai/feedback/:id/dismiss", async (req, res) => {
  const fid = Number(req.params.id);
  await sql`
    UPDATE ai_feedback SET status = 'dismissed', resolved_at = now()
    WHERE id = ${fid}
  `;
  res.json({ ok: true });
});

// Sandbox: corre rules contra texto y devuelve qué tags aplicarían.
aiRouter.post("/ai/test-classify", async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text_required" });
  }
  const rules = await sql`SELECT id, name, pattern, tag, weight FROM ai_rules WHERE enabled = TRUE`;
  const matched: Array<{ rule_id: number; rule_name: string; tag: string; weight: number }> = [];
  for (const r of rules) {
    try {
      const re = new RegExp(r.pattern, "i");
      if (re.test(text)) {
        matched.push({ rule_id: r.id, rule_name: r.name, tag: r.tag, weight: Number(r.weight) });
      }
    } catch { /* skip rules con regex roto */ }
  }
  res.json({
    text,
    matched,
    tags: Array.from(new Set(matched.map((m) => m.tag))),
    rules_checked: rules.length,
  });
});
