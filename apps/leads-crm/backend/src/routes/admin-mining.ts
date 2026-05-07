import { Router } from "express";
import { sql } from "../sql.js";
import { db } from "../db.js";
import { safe } from "../middleware/safe.js";
import { vecToPg } from "../lib/embedder.js";
import { cosineSim, vecMean, parsePgVector } from "../services/semantic-vec.js";
import { embedRuleInBackground } from "../services/embed.js";
import { runMiningReview } from "../services/mining-review.js";
import type { AuthedRequest } from "../auth.js";

/**
 * Intent mining: clustering greedy de inbounds que NO matchean ninguna
 * regla activa. Cada cluster con ≥5 miembros sugiere un suggested_tag
 * (palabra más distintiva) + suggested_pattern (regex de tokens comunes).
 * Operador revisa y promueve a ai_rules activa.
 *
 *   POST /admin/intent-mining/run            — corre clustering, crea candidates
 *   GET  /admin/intent-mining/candidates     — listado pending
 *   POST /admin/intent-mining/promote/:id    — promueve a ai_rule activa
 *   POST /admin/intent-mining/reject/:id
 */
export const adminMiningRouter = Router();

adminMiningRouter.post("/admin/intent-mining/run", safe(async (req, res) => {
  const SIM_THRESHOLD = Number((req.query as any)?.threshold) || 0.85;
  const MIN_CLUSTER_SIZE = Number((req.query as any)?.min_cluster) || 5;
  const SAMPLE_LIMIT = Number((req.query as any)?.limit) || 5000;

  const rows = await db.getUnclassifiedInteractions(SAMPLE_LIMIT);
  if (rows.length === 0) return res.json({ unclassified: 0, candidates_created: 0 });

  const items = rows.map((r) => ({ ...r, vec: parsePgVector(r.embedding), assigned: false }));

  type Cluster = { items: typeof items; centroid: number[] };
  const clusters: Cluster[] = [];

  for (const it of items) {
    if (it.assigned) continue;
    it.assigned = true;
    const cluster: typeof items = [it];
    for (const other of items) {
      if (other.assigned) continue;
      if (cosineSim(it.vec, other.vec) >= SIM_THRESHOLD) {
        other.assigned = true;
        cluster.push(other);
      }
    }
    if (cluster.length >= MIN_CLUSTER_SIZE) {
      const centroid = vecMean(cluster.map((c) => c.vec));
      clusters.push({ items: cluster, centroid });
    }
  }

  let candidatesCreated = 0;
  for (const c of clusters) {
    const top = c.items.slice(0, 8);
    const wordCount: Record<string, number> = {};
    for (const txt of top) {
      const tokens = txt.body.toLowerCase().match(/[a-záéíóúñü]{4,}/g) ?? [];
      for (const t of new Set(tokens)) wordCount[t] = (wordCount[t] ?? 0) + 1;
    }
    const STOPWORDS = new Set([
      "hola","buenos","buenas","días","tardes","noches","gracias","favor","saludos",
      "puedo","quisiera","quiero","tengo","estoy","necesito","puede","como","donde",
      "cuando","porque",
    ]);
    const sortedWords = Object.entries(wordCount)
      .filter(([w]) => !STOPWORDS.has(w))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([w]) => w);
    const suggestedTag = sortedWords.length > 0 ? `intent:${sortedWords[0]}` : null;
    const suggestedPattern = sortedWords.length > 0 ? `\\b(${sortedWords.join("|")})\\b` : null;

    await db.createMiningCandidate({
      centroid_vec: vecToPg(c.centroid),
      sample_message_ids: top.map((t) => t.id),
      sample_texts: top.map((t) => t.body.slice(0, 300)),
      match_count: c.items.length,
      suggested_tag: suggestedTag,
      suggested_pattern: suggestedPattern,
    });
    candidatesCreated++;
  }

  res.json({
    unclassified: items.length,
    clusters_found: clusters.length,
    candidates_created: candidatesCreated,
  });
}));

adminMiningRouter.get("/admin/intent-mining/candidates", safe(async (req, res) => {
  const status = String((req.query as any)?.status ?? "pending");
  const candidates = await db.listMiningCandidates(status);
  res.json({ candidates });
}));

// Promueve a ai_rule activa. Permite override de tag/pattern sugeridos.
adminMiningRouter.post("/admin/intent-mining/promote/:id", safe(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { name, tag, pattern, weight } = req.body ?? {};
  const candidates = await db.listMiningCandidates("pending");
  const c = candidates.find((x: any) => x.id === id);
  if (!c) return res.status(404).json({ error: "candidate_not_found_or_already_processed" });

  const finalTag = String(tag || c.suggested_tag || "intent:custom");
  const finalPattern = String(pattern || c.suggested_pattern || "");
  if (!finalPattern) return res.status(400).json({ error: "pattern_required" });
  try { new RegExp(finalPattern); } catch (e: any) {
    return res.status(400).json({ error: "invalid_regex", message: e.message });
  }

  const finalName = String(name || `mined: ${c.sample_texts[0]?.slice(0, 60) ?? "auto"}`);
  const createdBy = req.user?.email ?? "intent-mining";

  const ruleRows: any = await sql`
    INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, created_by, source)
    VALUES (
      ${finalName},
      ${`Auto-mined intent (cluster of ${c.match_count} unmatched messages)`},
      ${finalPattern}, ${finalTag},
      ${typeof weight === "number" ? weight : 1.0},
      TRUE, ${createdBy}, 'mined'
    ) RETURNING id, name`;
  const ruleId = ruleRows[0].id;

  embedRuleInBackground(ruleId, ruleRows[0].name);
  await db.promoteMiningCandidate(id, ruleId, createdBy);

  res.json({ ok: true, rule_id: ruleId, rule_name: ruleRows[0].name });
}));

adminMiningRouter.post("/admin/intent-mining/reject/:id", safe(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const by = req.user?.email ?? "intent-mining";
  await db.rejectMiningCandidate(id, by);
  res.json({ ok: true });
}));

// Sprint 2.B: invocación manual del review job. El cron diario hace lo mismo
// a las 9 AM Lima — esto es para dispararlo ad-hoc desde curl o Postman.
adminMiningRouter.post("/admin/mining/run-review", safe(async (req: AuthedRequest, res) => {
  const triggeredBy = req.user?.email ? `manual:${req.user.email}` : "manual";
  const result = await runMiningReview(triggeredBy);
  res.json(result);
}));
