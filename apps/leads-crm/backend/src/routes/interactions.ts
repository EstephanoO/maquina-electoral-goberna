import { Router } from "express";
import { db } from "../db.js";
import { sql } from "../sql.js";
import { safe } from "../middleware/safe.js";
import { embed, vecToPg, embedderAvailable } from "../lib/embedder.js";
import { embedInteractionInBackground } from "../services/embed.js";
import type { AuthedRequest } from "../auth.js";

export const interactionsRouter = Router();

interactionsRouter.get("/leads/:id/interactions", async (req, res) => {
  res.json(await db.listInteractions(Number(req.params.id)));
});

interactionsRouter.post("/leads/:id/interactions", async (req, res) => {
  const it = await db.addInteraction(Number(req.params.id), req.body);
  if (!it) return res.status(404).json({ error: "lead_not_found" });
  // Embed inbound messages para lead-memory RAG. Solo message_in con body
  // útil — outbound no aporta señal de query del lead.
  if (it.kind === "message_in" && it.body && it.body.length >= 12) {
    embedInteractionInBackground(it.id, Number(req.params.id), it.body);
  }
  res.status(201).json(it);
});

// Bulk para sync de history WA
interactionsRouter.post("/leads/:id/interactions/bulk", async (req, res) => {
  const leadId = Number(req.params.id);
  const { items } = req.body as { items?: Array<any> };
  if (!Array.isArray(items)) return res.status(400).json({ error: "items_required" });
  const result = await db.addInteractionsBulk(leadId, items);
  res.status(201).json(result);
});

// /messages — entrypoint para WA inbound (extension/bot). Lookup-or-create lead
// + add interaction + fire-and-forget embed.
interactionsRouter.post("/messages", safe(async (req, res) => {
  const r = await db.recordMessage(req.body);
  if (!r) return res.status(400).json({ error: "invalid_phone" });
  const it = r.interaction;
  if (it && it.kind === "message_in" && it.body && it.body.length >= 12) {
    embedInteractionInBackground(it.id, r.lead.id, it.body);
  }
  res.status(201).json(r);
}));

// Top-K interactions más similares al query, para inyectar como contexto en
// el AI generative path. Bot lo llama solo cuando va por Gemini fallback.
interactionsRouter.post("/leads/:id/relevant-history", safe(async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isFinite(leadId)) return res.status(400).json({ error: "invalid_id" });
  const query = String(req.body?.query ?? "").trim();
  const topK = Math.min(Math.max(Number(req.body?.topK) || 3, 1), 10);
  const minScore = typeof req.body?.minScore === "number" ? req.body.minScore : 0.70;
  if (!query || query.length < 8) return res.json({ history: [], reason: "query_too_short" });
  if (!embedderAvailable()) return res.json({ history: [], reason: "no_embedder" });

  const r = await embed(query, "RETRIEVAL_QUERY");
  if (!r.ok) return res.json({ history: [], reason: r.reason });

  const matches = await db.searchInteractionsSemantic(leadId, vecToPg(r.vec), topK, minScore);
  res.json({ history: matches });
}));

// ── Sprint 2.C: feedback humano sobre auto-replies ─────────────────────
// Operador marca 👍/👎 sobre una respuesta auto del bot. La meta del
// outbound interaction (template_id, picker_method, ai_model, etc.) se
// copia al row de picker_feedback para que el query de tuning sea barato.
//
// POST /interactions/:id/feedback  body: { was_helpful, notes? }
interactionsRouter.post("/interactions/:id/feedback", safe(async (req: AuthedRequest, res) => {
  const interactionId = Number(req.params.id);
  if (!Number.isFinite(interactionId)) return res.status(400).json({ error: "invalid_id" });
  const { was_helpful, notes } = req.body ?? {};
  if (typeof was_helpful !== "boolean") {
    return res.status(400).json({ error: "was_helpful_required (boolean)" });
  }

  // Pull la interaction para sacar meta + lead_id (vinculación FK).
  const found = await sql<Array<{ id: number; lead_id: number; meta: Record<string, any> | null }>>`
    SELECT id, lead_id, meta FROM interactions WHERE id = ${interactionId} LIMIT 1
  `;
  if (found.length === 0) return res.status(404).json({ error: "interaction_not_found" });
  const it = found[0];
  const meta = it.meta ?? {};

  const result = await db.upsertPickerFeedback({
    interaction_id: interactionId,
    lead_id: it.lead_id,
    picker_method: meta.picker_method ?? null,
    picker_score: typeof meta.picker_score === "number" ? meta.picker_score : null,
    template_id: typeof meta.template_id === "number" ? meta.template_id : null,
    learned_reply_id: typeof meta.learned_reply_id === "number" ? meta.learned_reply_id : null,
    ai_model: meta.ai_model ?? null,
    was_helpful,
    notes: typeof notes === "string" ? notes.slice(0, 500) : null,
    created_by: req.user?.email ?? null,
  });
  res.json({ ok: true, feedback_id: result.id });
}));

interactionsRouter.get("/interactions/:id/feedback", safe(async (req, res) => {
  const interactionId = Number(req.params.id);
  if (!Number.isFinite(interactionId)) return res.status(400).json({ error: "invalid_id" });
  const items = await db.getFeedbackForInteraction(interactionId);
  res.json({ items });
}));

// Resumen agregado para tunear thresholds del cascade.
interactionsRouter.get("/admin/picker-feedback/summary", safe(async (_req, res) => {
  const summary = await db.getPickerSummary();
  res.json({ summary });
}));
