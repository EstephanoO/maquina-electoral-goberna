import { sql } from "../sql.js";

/**
 * Repository de learned_replies — pares (mensaje del lead, respuesta manual
 * de Kathy) extraídos del histórico. Cuando un lead nuevo escribe algo similar
 * a query_text, el bot puede reusar response_text.
 *
 * - has_pii=true → bloqueada para auto-uso (la respuesta menciona el nombre
 *   o teléfono del lead original; sería raro decir "Hola María" a un lead
 *   llamado Juan). Queda como sugerencia para operador.
 * - country filter → si viene set, solo trae respuestas del mismo país O
 *   sin país (NULL). Evita que un lead PE reciba pricing en MXN.
 */

export type LearnedReplyMatch = {
  id: number;
  query_text: string;
  response_text: string;
  pii_redacted_response: string | null;
  has_pii: boolean;
  hits_count: number;
  score: number;
  country: string | null;
};

export async function createLearnedReply(input: {
  query_text: string;
  query_embedding_vec: string;
  response_text: string;
  response_embedding_vec: string;
  source_inbound_id: number;
  source_outbound_id: number;
  source_lead_id: number;
  has_pii: boolean;
  pii_redacted_response: string | null;
  country: string | null;
}): Promise<{ id: number }> {
  const rows = await sql`
    INSERT INTO learned_replies (
      query_text, query_embedding, response_text, response_embedding,
      source_inbound_id, source_outbound_id, source_lead_id,
      has_pii, pii_redacted_response, country
    ) VALUES (
      ${input.query_text}, ${input.query_embedding_vec}::vector,
      ${input.response_text}, ${input.response_embedding_vec}::vector,
      ${input.source_inbound_id}, ${input.source_outbound_id}, ${input.source_lead_id},
      ${input.has_pii}, ${input.pii_redacted_response}, ${input.country}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return (rows[0] as { id: number } | undefined) ?? { id: 0 };
}

/**
 * Hybrid retrieval: cosine vector + ts_rank FTS, mergeados con RRF (k=60).
 *
 * Sprint 2.D (2026-05-07): cosine HNSW solo pierde con queries muy literales
 * tipo "DNI", "wsp", "5 cuotas". FTS captura keywords exactas. RRF combina
 * los rankings sin necesidad de normalizar las escalas (cosine 0..1 vs
 * ts_rank no acotado).
 *
 * Comportamiento:
 *   - Si `query` está presente y la migration 015 fue aplicada (FTS index existe),
 *     hace hybrid. Cada documento que aparece en TOP-K de al menos uno de los
 *     dos rankings entra al pool. Score final = sum(1 / (k + rank)).
 *   - Si `query` es null/empty o el FTS falla, cae al puro vector cosine.
 *   - El filtro `minScore` se aplica al COSINE score (no al RRF) — mantiene
 *     la semántica conservadora: nunca devolvemos algo con cosine bajo aunque
 *     FTS lo rankee alto. Tradeoff explícito de precisión.
 */
const RRF_K = 60;

export async function searchLearnedReplies(
  vec: string,
  topK = 3,
  minScore = 0.85,
  autoUseOnly = true,
  country: string | null = null,
  query: string | null = null,
): Promise<LearnedReplyMatch[]> {
  const piiClause = autoUseOnly ? "AND has_pii = false" : "";
  // Pool > topK para que el RRF tenga material — top 20 candidatos cosine es
  // suficiente para queries reales. Si topK fuera grande podríamos escalar,
  // pero topK típico = 3.
  const POOL = Math.max(topK * 6, 20);

  // ── Vector ranking (HNSW cosine) — siempre corre. ───────────────────
  const vecRows = autoUseOnly
    ? await sql<any[]>`
        SELECT id, query_text, response_text, pii_redacted_response, has_pii, hits_count, country,
               1 - (query_embedding <=> ${vec}::vector) AS cosine_score
          FROM learned_replies
         WHERE status = 'active' AND has_pii = false AND query_embedding IS NOT NULL
           AND (${country}::text IS NULL OR country = ${country} OR country IS NULL)
         ORDER BY query_embedding <=> ${vec}::vector
         LIMIT ${POOL}
      `
    : await sql<any[]>`
        SELECT id, query_text, response_text, pii_redacted_response, has_pii, hits_count, country,
               1 - (query_embedding <=> ${vec}::vector) AS cosine_score
          FROM learned_replies
         WHERE status = 'active' AND query_embedding IS NOT NULL
           AND (${country}::text IS NULL OR country = ${country} OR country IS NULL)
         ORDER BY query_embedding <=> ${vec}::vector
         LIMIT ${POOL}
      `;

  // ── FTS ranking (GIN ts_rank_cd) — solo si tenemos query texto. ─────
  let ftsRows: any[] = [];
  if (query && query.trim().length >= 3) {
    try {
      const q = query.trim().slice(0, 200);
      ftsRows = autoUseOnly
        ? await sql<any[]>`
            SELECT id,
                   ts_rank_cd(to_tsvector('spanish', query_text),
                              plainto_tsquery('spanish', ${q})) AS fts_score
              FROM learned_replies
             WHERE status = 'active' AND has_pii = false
               AND to_tsvector('spanish', query_text) @@ plainto_tsquery('spanish', ${q})
               AND (${country}::text IS NULL OR country = ${country} OR country IS NULL)
             ORDER BY fts_score DESC
             LIMIT ${POOL}
          `
        : await sql<any[]>`
            SELECT id,
                   ts_rank_cd(to_tsvector('spanish', query_text),
                              plainto_tsquery('spanish', ${q})) AS fts_score
              FROM learned_replies
             WHERE status = 'active'
               AND to_tsvector('spanish', query_text) @@ plainto_tsquery('spanish', ${q})
               AND (${country}::text IS NULL OR country = ${country} OR country IS NULL)
             ORDER BY fts_score DESC
             LIMIT ${POOL}
          `;
    } catch (e: any) {
      // Si la migration 015 no se aplicó, plainto_tsquery puede ser caro
      // (no usa el index). Fallar silenciosamente al modo puro vector.
      console.warn(`[learned-replies] FTS query failed, falling back to vector: ${e?.message}`);
      ftsRows = [];
    }
  }

  // ── RRF merge ───────────────────────────────────────────────────────
  type Entry = { row: any; cosineRank: number; ftsRank: number; rrfScore: number };
  const byId = new Map<number, Entry>();
  vecRows.forEach((r, i) => {
    byId.set(r.id, { row: r, cosineRank: i + 1, ftsRank: POOL + 1, rrfScore: 0 });
  });
  ftsRows.forEach((r, i) => {
    const existing = byId.get(r.id);
    if (existing) existing.ftsRank = i + 1;
    // Si un FTS hit no está en el pool vector, NO lo agregamos: para que entre
    // al output debe pasar el filtro `cosine >= minScore`, y sin cosine_score
    // en mano no podemos evaluarlo. Esto es decisión conservadora.
  });

  for (const e of byId.values()) {
    e.rrfScore = 1 / (RRF_K + e.cosineRank) + 1 / (RRF_K + e.ftsRank);
  }

  // Filtro por cosine score (precision-first), luego ordeno por RRF, top-K.
  const filtered = [...byId.values()]
    .filter(e => e.row.cosine_score >= minScore)
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);

  return filtered.map(e => ({
    id: e.row.id,
    query_text: e.row.query_text,
    response_text: e.row.response_text,
    pii_redacted_response: e.row.pii_redacted_response,
    has_pii: e.row.has_pii,
    hits_count: e.row.hits_count,
    country: e.row.country,
    score: e.row.cosine_score,
  }));
}

export async function incrementLearnedReplyHits(id: number): Promise<void> {
  await sql`
    UPDATE learned_replies
       SET hits_count = hits_count + 1, last_used_at = now()
     WHERE id = ${id}
  `;
}
