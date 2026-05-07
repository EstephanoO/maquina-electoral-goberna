import { Router } from "express";
import { db } from "../db.js";
import { safe } from "../middleware/safe.js";
import { embed, vecToPg, embedderAvailable } from "../lib/embedder.js";
import { embedInteractionInBackground } from "../services/embed.js";

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
