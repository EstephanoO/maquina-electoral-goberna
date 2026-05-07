import { sql } from "../sql.js";

/**
 * Intent mining (#3b): cluster greedy de inbounds que NO matchean ninguna
 * regex active. Cada cluster con ≥5 miembros se vuelve un mining candidate
 * con suggested_tag + suggested_pattern para review humano. Operator
 * promueve a ai_rule activa o rechaza.
 *
 * Adicionalmente expone getInboundOutboundPairs — base del mining para
 * learned_replies (#3a). Lo dejamos acá porque comparte la lógica de
 * "qué mensajes son señales aprovechables del histórico".
 */

export async function getUnclassifiedInteractions(limit = 5000): Promise<Array<{
  id: number; lead_id: number; body: string; embedding: string;
}>> {
  const rows = await sql`
    WITH active_patterns AS (
      SELECT pattern FROM ai_rules WHERE enabled = TRUE AND pattern IS NOT NULL
    ),
    already_in_candidate AS (
      SELECT DISTINCT unnest(sample_message_ids) AS id FROM intent_mining_candidates WHERE status = 'pending'
    )
    SELECT i.id, i.lead_id, i.body, ie.embedding::text AS embedding
      FROM interactions i
      JOIN interaction_embeddings ie ON ie.interaction_id = i.id
     WHERE i.kind = 'message_in'
       AND i.body IS NOT NULL
       AND length(i.body) >= 12
       AND i.id NOT IN (SELECT id FROM already_in_candidate)
       AND NOT EXISTS (
         SELECT 1 FROM active_patterns ap WHERE i.body ~* ap.pattern
       )
     ORDER BY i.created_at DESC
     LIMIT ${limit}
  `;
  return rows as any;
}

export async function createMiningCandidate(input: {
  centroid_vec: string;
  sample_message_ids: number[];
  sample_texts: string[];
  match_count: number;
  suggested_tag: string | null;
  suggested_pattern: string | null;
}): Promise<{ id: number }> {
  const rows = await sql`
    INSERT INTO intent_mining_candidates (
      cluster_centroid, sample_message_ids, sample_texts, match_count,
      suggested_tag, suggested_pattern
    ) VALUES (
      ${input.centroid_vec}::vector, ${input.sample_message_ids}, ${input.sample_texts},
      ${input.match_count}, ${input.suggested_tag}, ${input.suggested_pattern}
    ) RETURNING id
  `;
  return rows[0];
}

export async function listMiningCandidates(status: string = "pending"): Promise<Array<{
  id: number; sample_texts: string[]; match_count: number;
  suggested_tag: string | null; suggested_pattern: string | null;
  status: string; created_at: string;
}>> {
  const rows = await sql`
    SELECT id, sample_texts, match_count, suggested_tag, suggested_pattern, status, created_at
      FROM intent_mining_candidates
     WHERE status = ${status}
     ORDER BY match_count DESC, created_at DESC
  `;
  return rows as any;
}

export async function promoteMiningCandidate(
  id: number,
  ruleId: number,
  by: string | null,
): Promise<void> {
  await sql`
    UPDATE intent_mining_candidates
       SET status = 'promoted', promoted_rule_id = ${ruleId},
           reviewed_at = now(), reviewed_by = ${by}
     WHERE id = ${id}
  `;
}

export async function rejectMiningCandidate(id: number, by: string | null): Promise<void> {
  await sql`
    UPDATE intent_mining_candidates
       SET status = 'rejected', reviewed_at = now(), reviewed_by = ${by}
     WHERE id = ${id}
  `;
}

/**
 * Pares (inbound, outbound concatenado <10min) por lead, listos para mining.
 *
 * Concatena hasta 5 outbounds consecutivos del operador dentro de la ventana
 * [inbound, next_inbound, +10min] hasta que sumen 600 chars. El operador
 * típicamente escribe la respuesta en bloques (saludo, detalles, precio,
 * link) y antes guardábamos solo el primero. Ahora capturamos la respuesta
 * completa, con saltos de línea entre bloques.
 *
 * Filtros aplicados:
 *   - WAME_PRECANNED_RE: queries pre-canned del link wa.me. Producen queries
 *     idénticas que dominan el embedding space. Las excluimos del mining set.
 *   - MEDIA_PLACEHOLDER_RE: bodies que SON puro "🖼 [imagen]" o "🎤 [nota de voz]"
 *     — Baileys logueó así cuando el mensaje real era media. Si entran al
 *     mining, el bot termina mandando "🖼 [imagen]" literal al lead.
 */
export async function getInboundOutboundPairs(limit = 10000): Promise<Array<{
  inbound_id: number; outbound_id: number; lead_id: number;
  lead_name: string | null; lead_phone: string | null; lead_country: string | null;
  query: string; response: string;
}>> {
  const WAME_PRECANNED_RE =
    "^[¡¿]?\\s*hola[!.,]?\\s*(deseo\\s+inscribirme|quiero\\s+m[aá]s\\s+informaci[oó]n|me\\s+interesa\\s+(el|la|este)\\s+(diploma|curso|programa))";
  const MEDIA_PLACEHOLDER_RE =
    "^[🖼🎤🩵📄]?\\s*(\\[(imagen|image|video|audio|sticker|document)\\]|🎤\\s*\\[nota de voz\\])\\s*$";

  const rows = await sql`
    WITH next_in AS (
      -- Para cada inbound, calcula el timestamp del siguiente inbound
      -- del mismo lead (o futuro lejano si no hay más). Excluye queries
      -- pre-canned del wa.me link (ruido sintético, no query natural).
      SELECT
        i_in.id AS inbound_id,
        i_in.body AS query,
        i_in.lead_id,
        i_in.created_at AS inbound_at,
        COALESCE(
          (SELECT MIN(i2.created_at) FROM interactions i2
            WHERE i2.lead_id = i_in.lead_id
              AND i2.kind = 'message_in'
              AND i2.created_at > i_in.created_at),
          now() + interval '1 year'
        ) AS next_inbound_at
      FROM interactions i_in
      WHERE i_in.kind = 'message_in'
        AND i_in.body IS NOT NULL
        AND length(i_in.body) >= 12
        AND i_in.body !~* ${WAME_PRECANNED_RE}
    ),
    out_block AS (
      -- Toma todos los outbounds entre inbound y next_inbound (cap 10min)
      -- y los concatena en orden cronológico. Limita a 5 mensajes para
      -- no agarrar todo el thread del día.
      SELECT
        ni.inbound_id,
        ni.lead_id,
        ni.query,
        (SELECT MIN(i_out.id) FROM interactions i_out
          WHERE i_out.lead_id = ni.lead_id
            AND i_out.kind = 'message_out'
            AND i_out.created_at > ni.inbound_at
            AND i_out.created_at < LEAST(ni.next_inbound_at, ni.inbound_at + interval '10 minutes')
            AND COALESCE((i_out.meta->>'auto_reply')::boolean, false) = false
            AND i_out.body IS NOT NULL
            AND length(i_out.body) >= 5
            AND i_out.body !~ ${MEDIA_PLACEHOLDER_RE}
        ) AS outbound_id,
        -- Dedup por los primeros 80 chars (template repetido en broadcasts).
        (SELECT string_agg(i_out.body, E'\n\n' ORDER BY i_out.created_at ASC)
         FROM (
           SELECT DISTINCT ON (left(i_out.body, 80)) i_out.body, i_out.created_at
           FROM interactions i_out
           WHERE i_out.lead_id = ni.lead_id
             AND i_out.kind = 'message_out'
             AND i_out.created_at > ni.inbound_at
             AND i_out.created_at < LEAST(ni.next_inbound_at, ni.inbound_at + interval '10 minutes')
             AND COALESCE((i_out.meta->>'auto_reply')::boolean, false) = false
             AND i_out.body IS NOT NULL
             AND length(i_out.body) >= 5
           ORDER BY left(i_out.body, 80), i_out.created_at ASC
           LIMIT 5
         ) i_out
        ) AS response
      FROM next_in ni
    )
    SELECT ob.inbound_id, ob.outbound_id, ob.lead_id, ob.query,
           left(ob.response, 1500) AS response,
           l.name AS lead_name, l.phone AS lead_phone, l.country AS lead_country
      FROM out_block ob
      JOIN leads l ON l.id = ob.lead_id
     WHERE ob.outbound_id IS NOT NULL
       AND ob.response IS NOT NULL
       AND length(ob.response) >= 20
       AND NOT EXISTS (
         SELECT 1 FROM learned_replies lr
          WHERE lr.source_inbound_id = ob.inbound_id
            AND lr.source_outbound_id = ob.outbound_id
       )
     ORDER BY ob.inbound_id
     LIMIT ${limit}
  `;
  return rows as any;
}
