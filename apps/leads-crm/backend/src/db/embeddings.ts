import { sql } from "../sql.js";

/**
 * Operaciones de embeddings y semantic search. Tres entidades embebibles:
 *
 *   - templates (uses_count, body)        — el bot busca por similitud al
 *                                           body del inbound cuando el cascade
 *                                           rule-based no matcheó.
 *   - ai_rules  (name, tag)               — semantic intent fallback cuando
 *                                           regex no matcheó.
 *   - interactions (body)                 — lead memory RAG: histórico
 *                                           relevante al query actual cuando
 *                                           el bot va por Gemini fallback.
 *
 * pgvector usa cosine distance: 0 = idéntico, 2 = opuesto. El score que
 * devolvemos es `1 - distance` (cosine sim, 0..1).
 */

// ─── Templates ───────────────────────────────────────────────────────

export async function setTemplateEmbedding(
  id: number,
  vec: string,
  embeddingText: string,
): Promise<void> {
  await sql`
    UPDATE templates
       SET embedding = ${vec}::vector,
           embedding_text = ${embeddingText},
           embedded_at = now()
     WHERE id = ${id}
  `;
}

export async function getTemplatesNeedingEmbed(): Promise<Array<{
  id: number; body: string; embedding_text: string | null;
}>> {
  // embedding_text guarda el snippet exacto que se embebió. Si body cambió, el
  // snippet difiere y se flagea para re-embed en el próximo backfill.
  const rows = await sql`
    SELECT id, body, embedding_text
      FROM templates
     WHERE embedding IS NULL
        OR embedding_text IS DISTINCT FROM substring(body, 1, 512)
  `;
  return rows as any;
}

export async function searchTemplatesSemantic(
  vec: string,
  topK = 3,
  minScore = 0.72,
): Promise<Array<{
  id: number; name: string; body: string;
  image_url: string | null; uses_count: number; category: string | null;
  score: number;
}>> {
  const rows = await sql`
    SELECT id, name, body, image_url, uses_count, category,
           1 - (embedding <=> ${vec}::vector) AS score
      FROM templates
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> ${vec}::vector
     LIMIT ${topK}
  `;
  return rows.filter((r: any) => r.score >= minScore) as any;
}

// ─── AI Rules ────────────────────────────────────────────────────────

export async function setRuleEmbedding(
  id: number,
  vec: string,
  embeddingText: string,
): Promise<void> {
  await sql`
    UPDATE ai_rules
       SET embedding = ${vec}::vector,
           embedding_text = ${embeddingText},
           embedded_at = now()
     WHERE id = ${id}
  `;
}

export async function getRulesNeedingEmbed(): Promise<Array<{
  id: number; name: string; tag: string; embedding_text: string | null;
}>> {
  const rows = await sql`
    SELECT id, name, tag, embedding_text
      FROM ai_rules
     WHERE enabled = TRUE
       AND (embedding IS NULL OR embedding_text IS DISTINCT FROM name)
  `;
  return rows as any;
}

export async function searchRulesSemantic(
  vec: string,
  topK = 5,
  minScore = 0.78,
): Promise<Array<{
  id: number; name: string; tag: string; weight: number; score: number;
}>> {
  const rows = await sql`
    SELECT id, name, tag, weight,
           1 - (embedding <=> ${vec}::vector) AS score
      FROM ai_rules
     WHERE embedding IS NOT NULL
       AND enabled = TRUE
     ORDER BY embedding <=> ${vec}::vector
     LIMIT ${topK}
  `;
  return rows.filter((r: any) => r.score >= minScore) as any;
}

// ─── Interactions (lead memory RAG) ──────────────────────────────────

export async function setInteractionEmbedding(
  interactionId: number,
  leadId: number,
  vec: string,
): Promise<void> {
  await sql`
    INSERT INTO interaction_embeddings (interaction_id, lead_id, embedding)
    VALUES (${interactionId}, ${leadId}, ${vec}::vector)
    ON CONFLICT (interaction_id) DO UPDATE
      SET embedding = EXCLUDED.embedding
  `;
}

export async function searchInteractionsSemantic(
  leadId: number,
  vec: string,
  topK = 3,
  minScore = 0.70,
): Promise<Array<{
  interaction_id: number; body: string; ts: string; kind: string; score: number;
}>> {
  const rows = await sql`
    SELECT ie.interaction_id, i.body, ie.ts, i.kind,
           1 - (ie.embedding <=> ${vec}::vector) AS score
      FROM interaction_embeddings ie
      JOIN interactions i ON i.id = ie.interaction_id
     WHERE ie.lead_id = ${leadId}
     ORDER BY ie.embedding <=> ${vec}::vector
     LIMIT ${topK}
  `;
  return rows.filter((r: any) => r.score >= minScore) as any;
}
