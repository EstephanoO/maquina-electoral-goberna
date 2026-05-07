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
  return rows[0] ?? { id: 0 };
}

export async function searchLearnedReplies(
  vec: string,
  topK = 3,
  minScore = 0.85,
  autoUseOnly = true,
  country: string | null = null,
): Promise<LearnedReplyMatch[]> {
  const rows = autoUseOnly
    ? await sql`
        SELECT id, query_text, response_text, pii_redacted_response, has_pii, hits_count, country,
               1 - (query_embedding <=> ${vec}::vector) AS score
          FROM learned_replies
         WHERE status = 'active' AND has_pii = false AND query_embedding IS NOT NULL
           AND (${country}::text IS NULL OR country = ${country} OR country IS NULL)
         ORDER BY query_embedding <=> ${vec}::vector
         LIMIT ${topK}
      `
    : await sql`
        SELECT id, query_text, response_text, pii_redacted_response, has_pii, hits_count, country,
               1 - (query_embedding <=> ${vec}::vector) AS score
          FROM learned_replies
         WHERE status = 'active' AND query_embedding IS NOT NULL
           AND (${country}::text IS NULL OR country = ${country} OR country IS NULL)
         ORDER BY query_embedding <=> ${vec}::vector
         LIMIT ${topK}
      `;
  return rows.filter((r: any) => r.score >= minScore) as any;
}

export async function incrementLearnedReplyHits(id: number): Promise<void> {
  await sql`
    UPDATE learned_replies
       SET hits_count = hits_count + 1, last_used_at = now()
     WHERE id = ${id}
  `;
}
