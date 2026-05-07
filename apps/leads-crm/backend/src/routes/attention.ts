import { Router } from "express";
import { sql } from "../sql.js";
import type { AuthedRequest } from "../auth.js";

/**
 * Human attention queue. Bot llama flag-attention cuando no sabe responder
 * (holding template + needs_human_attention=true). Operador resuelve desde
 * el chat panel. v_attention_queue ordena por waiting time.
 */
export const attentionRouter = Router();

attentionRouter.get("/attention", async (_req, res) => {
  const rows = await sql`SELECT * FROM v_attention_queue LIMIT 200`;
  res.json({ items: rows });
});

// Bot lo llama cuando no sabe responder. Operador también puede llamarlo
// manualmente desde el chat.
attentionRouter.post("/leads/:id/flag-attention", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const reason = (req.body?.reason as string) || "unknown";
  const rows = await sql`
    UPDATE leads
       SET needs_human_attention = TRUE,
           attention_reason = ${reason}
     WHERE id = ${id}
     RETURNING id, needs_human_attention, attention_at
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

attentionRouter.post("/leads/:id/resolve-attention", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`
    UPDATE leads
       SET needs_human_attention = FALSE,
           attention_resolved_by = ${(req as any).userEmail ?? 'unknown'}
     WHERE id = ${id}
     RETURNING id, needs_human_attention, attention_resolved_at, attention_resolved_by
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});
