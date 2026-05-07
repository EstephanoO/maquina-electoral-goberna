import { Router } from "express";
import { db } from "../db.js";
import { safe } from "../middleware/safe.js";
import { embed, vecToPg, embedderAvailable } from "../lib/embedder.js";
import { detectPIIInResponse } from "../services/pii.js";

/**
 * Admin tools que llenan/regeneran embeddings y mineing data:
 *   POST /admin/embed/backfill            — re-genera embeddings faltantes
 *   POST /admin/learned-replies/backfill  — pipeline de mining histórico
 */
export const adminEmbedRouter = Router();

// Re-genera embeddings que falten (templates + rules). Idempotente: skipea
// los que ya tienen embedding y embedding_text coincide.
adminEmbedRouter.post("/admin/embed/backfill", safe(async (req, res) => {
  if (!embedderAvailable()) return res.status(503).json({ error: "no_embedder" });

  const templates = await db.getTemplatesNeedingEmbed();
  const rules = await db.getRulesNeedingEmbed();

  let tOk = 0, tFail = 0;
  for (const t of templates) {
    const snippet = (t.body ?? "").slice(0, 512);
    if (!snippet) continue;
    const r = await embed(snippet, "RETRIEVAL_DOCUMENT");
    if (r.ok) { await db.setTemplateEmbedding(t.id, vecToPg(r.vec), snippet); tOk++; }
    else { tFail++; }
  }
  let rOk = 0, rFail = 0;
  for (const ru of rules) {
    if (!ru.name) continue;
    const r = await embed(ru.name, "RETRIEVAL_DOCUMENT");
    if (r.ok) { await db.setRuleEmbedding(ru.id, vecToPg(r.vec), ru.name); rOk++; }
    else { rFail++; }
  }
  res.json({
    templates: { needed: templates.length, ok: tOk, failed: tFail },
    rules: { needed: rules.length, ok: rOk, failed: rFail },
  });
}));

// Pipeline de mining sobre el histórico:
//   1. Trae pares (inbound, outbound concatenado <10min)
//   2. Detecta PII en cada respuesta vs el lead original
//   3. Embebe query y response (parallel batches)
//   4. Inserta en learned_replies
adminEmbedRouter.post("/admin/learned-replies/backfill", safe(async (req, res) => {
  if (!embedderAvailable()) return res.status(503).json({ error: "no_embedder" });

  const limit = Math.min(Number((req.query as any)?.limit) || 5000, 20000);
  const pairs = await db.getInboundOutboundPairs(limit);

  let ok = 0, fail = 0, withPII = 0;
  const PARALLEL = 4;
  for (let i = 0; i < pairs.length; i += PARALLEL) {
    const slice = pairs.slice(i, i + PARALLEL);
    await Promise.all(slice.map(async (p) => {
      try {
        if (!p.query || p.query.length < 12 || !p.response || p.response.length < 10) return;
        // Skip respuestas demasiado largas (probablemente listas, links pegados)
        if (p.response.length > 1500) return;

        const piiCheck = detectPIIInResponse(p.response, { name: p.lead_name, phone: p.lead_phone });
        if (piiCheck.hasPII) withPII++;

        const [qe, re] = await Promise.all([
          embed(p.query.slice(0, 1024), "RETRIEVAL_DOCUMENT"),
          embed(p.response.slice(0, 1024), "RETRIEVAL_DOCUMENT"),
        ]);
        if (!qe.ok || !re.ok) { fail++; return; }

        await db.createLearnedReply({
          query_text: p.query.slice(0, 2000),
          query_embedding_vec: vecToPg(qe.vec),
          response_text: p.response.slice(0, 2000),
          response_embedding_vec: vecToPg(re.vec),
          source_inbound_id: p.inbound_id,
          source_outbound_id: p.outbound_id,
          source_lead_id: p.lead_id,
          has_pii: piiCheck.hasPII,
          pii_redacted_response: piiCheck.redacted,
          country: p.lead_country,
        });
        ok++;
      } catch (e: any) {
        fail++;
        console.warn(`[learned-replies/backfill] err id=${p.inbound_id}: ${e?.message}`);
      }
    }));
  }
  res.json({ pairs_total: pairs.length, ok, fail, with_pii: withPII });
}));
