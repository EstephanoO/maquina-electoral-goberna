import { Router } from "express";
import { db } from "../db.js";
import { safe } from "../middleware/safe.js";
import { embed, vecToPg, embedderAvailable } from "../lib/embedder.js";

/**
 * Endpoints semánticos del cascade del bot:
 *   POST /templates/pick-semantic  — fallback cuando rule-based no matchea
 *   POST /rules/match-semantic     — intent matching por embedding
 *   POST /learned-replies/match    — reuso de respuestas históricas de Kathy
 *
 * Todos exigen embedderAvailable() (Gemini text-embedding-004). Si no, devuelven
 * `{ template/match/matches: null/[], reason: "no_embedder" }` y el bot cae al
 * próximo paso del cascade.
 */
export const semanticRouter = Router();

semanticRouter.post("/templates/pick-semantic", safe(async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body || body.length < 8) return res.json({ template: null, reason: "body_too_short" });
  if (!embedderAvailable()) return res.json({ template: null, reason: "no_embedder" });

  const r = await embed(body, "RETRIEVAL_QUERY");
  if (!r.ok) return res.json({ template: null, reason: r.reason });

  const matches = await db.searchTemplatesSemantic(vecToPg(r.vec), 1, 0.72);
  if (matches.length === 0) return res.json({ template: null, reason: "no_match_above_threshold" });

  const top = matches[0];
  return res.json({
    template: {
      id: top.id, name: top.name, body: top.body,
      image_url: top.image_url, category: top.category, uses_count: top.uses_count,
    },
    score: top.score,
    method: "semantic",
  });
}));

semanticRouter.post("/rules/match-semantic", safe(async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (!body || body.length < 8) return res.json({ matches: [], reason: "body_too_short" });
  if (!embedderAvailable()) return res.json({ matches: [], reason: "no_embedder" });

  const r = await embed(body, "RETRIEVAL_QUERY");
  if (!r.ok) return res.json({ matches: [], reason: r.reason });

  const matches = await db.searchRulesSemantic(vecToPg(r.vec), 5, 0.78);
  return res.json({ matches, method: "semantic" });
}));

// Learned replies match: reuso de respuestas históricas de Kathy. Filtra por
// country (PE/MX) cuando viene set, para no traer pricing en MXN a un lead PE.
// Threshold 0.72 — bajado iterativamente desde 0.85→0.78→0.72 (sesión 2026-05-07).
semanticRouter.post("/learned-replies/match", safe(async (req, res) => {
  const body = String(req.body?.body ?? "").trim();
  const country = req.body?.country ? String(req.body.country).trim() : null;
  if (!body || body.length < 8) return res.json({ match: null, reason: "body_too_short" });
  if (!embedderAvailable()) return res.json({ match: null, reason: "no_embedder" });

  const r = await embed(body, "RETRIEVAL_QUERY");
  if (!r.ok) return res.json({ match: null, reason: r.reason });

  const matches = await db.searchLearnedReplies(vecToPg(r.vec), 1, 0.72, true, country);
  if (matches.length === 0) return res.json({ match: null, reason: "no_match_above_threshold" });

  const top = matches[0];
  void db.incrementLearnedReplyHits(top.id);

  return res.json({
    match: {
      id: top.id,
      response: top.pii_redacted_response ?? top.response_text,
      original_query: top.query_text,
      score: top.score,
      hits_count: top.hits_count,
      country: top.country,
    },
    method: "learned_reply",
  });
}));
