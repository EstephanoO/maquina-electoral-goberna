import { db } from "../db.js";
import { embed, vecToPg, embedderAvailable } from "../lib/embedder.js";

/**
 * Helpers para embed en background sin bloquear el caller. Si falla, el row
 * queda con embedding=NULL y el backfill cron / endpoint /admin/embed/backfill
 * lo recupera. Triple capa: templates, ai_rules, interactions.
 */

export function embedTemplateInBackground(id: number, body: string): void {
  if (!embedderAvailable() || !body) return;
  const snippet = body.slice(0, 512);
  void embed(snippet, "RETRIEVAL_DOCUMENT").then(r => {
    if (r.ok) return db.setTemplateEmbedding(id, vecToPg(r.vec), snippet);
    console.warn(`[embed/template ${id}] failed: ${r.reason}`);
  }).catch(e => console.warn(`[embed/template ${id}] threw:`, e?.message));
}

export function embedRuleInBackground(id: number, name: string): void {
  if (!embedderAvailable() || !name) return;
  void embed(name, "RETRIEVAL_DOCUMENT").then(r => {
    if (r.ok) return db.setRuleEmbedding(id, vecToPg(r.vec), name);
    console.warn(`[embed/rule ${id}] failed: ${r.reason}`);
  }).catch(e => console.warn(`[embed/rule ${id}] threw:`, e?.message));
}

export function embedInteractionInBackground(interactionId: number, leadId: number, body: string): void {
  if (!embedderAvailable() || !body) return;
  void embed(body.slice(0, 1024), "RETRIEVAL_DOCUMENT").then(r => {
    if (r.ok) return db.setInteractionEmbedding(interactionId, leadId, vecToPg(r.vec));
    console.warn(`[embed/interaction ${interactionId}] failed: ${r.reason}`);
  }).catch(e => console.warn(`[embed/interaction ${interactionId}] threw:`, e?.message));
}
