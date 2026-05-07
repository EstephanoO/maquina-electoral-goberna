-- 040_pgvector_foundation.sql
-- Activa pgvector y agrega columnas para búsqueda semántica.
--
-- Pre-requisito de imagen: la db tiene que correr con pgvector/pgvector:pg16
-- (el cambio se aplica en docker-compose.prod.yml). Si seguís en postgres:16
-- sin pgvector, este CREATE EXTENSION va a fallar.
--
-- Modelo de embeddings: Gemini text-embedding-004 (768 dims).
-- Distancia: cosine. ivfflat para sets chicos (templates ~67, rules ~80);
-- hnsw para interactions que crece sin techo (~400/día).

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Templates: embed el body para semantic picker ──
ALTER TABLE templates ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE templates ADD COLUMN IF NOT EXISTS embedding_text text;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- ivfflat necesita ANALYZE post-backfill para elegir lists; con 67 rows lists=10 está bien.
-- Cambiar a hnsw si templates supera ~10k.
CREATE INDEX IF NOT EXISTS idx_templates_embedding
  ON templates USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- ── ai_rules: embed el "canonical example" del rule para semantic intent fallback ──
ALTER TABLE ai_rules ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE ai_rules ADD COLUMN IF NOT EXISTS embedding_text text;
ALTER TABLE ai_rules ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ai_rules_embedding
  ON ai_rules USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- ── Interactions: tabla aparte para no inflar la fila base con vector(768) NULL en cada row ──
-- Solo se embeben message_in con body > 12 chars (mismo gate del classifier).
CREATE TABLE IF NOT EXISTS interaction_embeddings (
  interaction_id bigint PRIMARY KEY REFERENCES interactions(id) ON DELETE CASCADE,
  lead_id bigint NOT NULL,
  embedding vector(768) NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interaction_embeddings_lead
  ON interaction_embeddings (lead_id, ts DESC);

-- HNSW para retrieval rápido. m=16/ef_construction=64 son defaults razonables.
CREATE INDEX IF NOT EXISTS idx_interaction_embeddings_hnsw
  ON interaction_embeddings USING hnsw (embedding vector_cosine_ops);

-- Stats post-migration
SELECT
  (SELECT count(*) FROM templates)        AS total_templates,
  (SELECT count(*) FROM ai_rules)         AS total_rules,
  (SELECT count(*) FROM interactions WHERE kind = 'message_in') AS total_inbound;
