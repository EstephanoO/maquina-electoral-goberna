-- 041_learned_replies_intent_mining.sql
-- Capa de aprendizaje continuo del bot:
--
--   1. learned_replies — pares (mensaje del lead, respuesta manual de Kathy)
--      extraídos del historial. Cuando un lead nuevo escribe algo similar a
--      query_text, el bot puede reutilizar la respuesta probada que Kathy
--      ya dió antes — mucho más rico que un template canned.
--
--      PII flag: si la respuesta contiene el nombre/teléfono del lead
--      original, no se reusa automáticamente (sería raro decir "Hola María"
--      a un lead llamado Juan). Se ofrece como sugerencia al operador.
--
--   2. intent_mining_candidates — clusters de mensajes inbound que no
--      matchearon ninguna regla. Cada cluster sugiere una nueva ai_rule
--      potencial. Admin revisa y promueve a regla activa.
--
-- Ambas tablas usan vector(768) — mismo schema que migration 040.

CREATE TABLE IF NOT EXISTS learned_replies (
  id bigserial PRIMARY KEY,
  query_text text NOT NULL,                            -- mensaje original del lead
  query_embedding vector(768),                         -- embed RETRIEVAL_DOCUMENT
  response_text text NOT NULL,                         -- respuesta exacta de Kathy
  response_embedding vector(768),                      -- embed para análisis (cluster, etc.)
  source_inbound_id bigint REFERENCES interactions(id) ON DELETE SET NULL,
  source_outbound_id bigint REFERENCES interactions(id) ON DELETE SET NULL,
  source_lead_id bigint,
  has_pii boolean NOT NULL DEFAULT false,              -- contiene nombre/tel del lead → no auto-usar
  pii_redacted_response text,                          -- versión con {{nombre}} en lugar de "María"
  hits_count integer NOT NULL DEFAULT 0,               -- cuántas veces se reutilizó
  last_used_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'flagged')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- HNSW para búsqueda semántica rápida sobre query_embedding (lo que matchea
-- el bot cuando llega un mensaje nuevo).
CREATE INDEX IF NOT EXISTS idx_learned_replies_query_hnsw
  ON learned_replies USING hnsw (query_embedding vector_cosine_ops);

-- Filtrado típico: status=active y has_pii=false (auto-usables).
CREATE INDEX IF NOT EXISTS idx_learned_replies_active_no_pii
  ON learned_replies (status, has_pii) WHERE status = 'active';


CREATE TABLE IF NOT EXISTS intent_mining_candidates (
  id bigserial PRIMARY KEY,
  cluster_centroid vector(768),                        -- promedio de los embeddings del cluster
  sample_message_ids bigint[] NOT NULL,                -- top-N interaction.id del cluster
  sample_texts text[] NOT NULL,                        -- los textos para review humano
  match_count integer NOT NULL,                        -- size del cluster
  suggested_tag text,                                  -- ej. "intent:trabajo" — admin lo edita antes de promover
  suggested_pattern text,                              -- regex sugerida (auto-extraída de palabras comunes)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'promoted', 'rejected')),
  promoted_rule_id integer REFERENCES ai_rules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE INDEX IF NOT EXISTS idx_intent_mining_status
  ON intent_mining_candidates (status, created_at DESC);

-- Stats post-migration
SELECT
  (SELECT count(*) FROM interaction_embeddings) AS interactions_embedded,
  (SELECT count(*) FROM templates WHERE embedding IS NOT NULL) AS templates_embedded,
  (SELECT count(*) FROM ai_rules WHERE embedding IS NOT NULL AND enabled) AS rules_embedded;
