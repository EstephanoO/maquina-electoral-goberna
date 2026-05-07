-- Sprint 2.D (2026-05-07): hybrid retrieval para learned_replies.
--
-- Cosine similarity (HNSW) sola pierde con queries literales como "DNI",
-- "wsp", "5 cuotas" — embeddings borronean keywords exactas. BM25-ish con
-- ts_rank_cd captura esos casos. Hybrid (RRF, k=60) combina ambos.
--
-- Index: GIN sobre to_tsvector('spanish', query_text). Diccionario español
-- maneja stems + stopwords. Fallback safe: si la columna no existe (DB
-- local fresh), no-op via DO $$ ... IF EXISTS $$.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='learned_replies' AND column_name='query_text'
  ) THEN
    -- GIN index para FTS — cubre la mayoría de operaciones @@ + ts_rank_cd.
    CREATE INDEX IF NOT EXISTS idx_learned_replies_query_fts
      ON learned_replies USING gin (to_tsvector('spanish', query_text))
      WHERE status = 'active' AND has_pii = false;
  END IF;
END
$$;
