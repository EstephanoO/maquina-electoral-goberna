-- 046_learned_replies_country.sql
--
-- Country filter para learned_replies: Kathy maneja leads PE y MX en p4 y
-- las respuestas tienen precios y bancos distintos ($150 USD vs S/500 vs
-- $MXN, BCP/Interbank vs BBVA México). Sin filter, semantic search trae
-- respuestas en MXN para leads PE → bot manda info errónea.
--
-- Estrategia:
--   1. Columna `country` denormalizada en learned_replies (no JOIN en hot path).
--   2. Backfill desde leads via source_lead_id; fallback a prefix del phone.
--   3. Match query toma country del lead actual y filtra (NULL = sin filter).
--   4. Índice compuesto que matcha el patrón de query (active+no_pii+country).

ALTER TABLE learned_replies
  ADD COLUMN IF NOT EXISTS country text;

-- Backfill desde leads.country (la fuente canónica).
UPDATE learned_replies lr
   SET country = l.country
  FROM leads l
 WHERE lr.source_lead_id = l.id
   AND lr.country IS NULL
   AND l.country IS NOT NULL;

-- Fallback: si el lead no tiene country, derivar del prefix del phone.
-- Cubre Perú (+51) y México (+52/+521) que son los volúmenes principales.
UPDATE learned_replies lr
   SET country = CASE
     WHEN regexp_replace(l.phone, '\D', '', 'g') LIKE '521%' THEN 'México'
     WHEN regexp_replace(l.phone, '\D', '', 'g') LIKE '52%'  THEN 'México'
     WHEN regexp_replace(l.phone, '\D', '', 'g') LIKE '51%'  THEN 'Perú'
     ELSE NULL
   END
  FROM leads l
 WHERE lr.source_lead_id = l.id
   AND lr.country IS NULL
   AND l.phone IS NOT NULL;

-- Índice principal del hot path: status='active', has_pii=false, filtra por country.
-- HNSW vector index ya cubre el ORDER BY embedding; este es para el WHERE.
CREATE INDEX IF NOT EXISTS idx_learned_replies_active_country
  ON learned_replies (status, has_pii, country)
  WHERE status = 'active';

-- Stats post-migration
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE country IS NOT NULL) AS with_country,
  count(*) FILTER (WHERE country = 'Perú') AS pe,
  count(*) FILTER (WHERE country = 'México') AS mx,
  count(*) FILTER (WHERE country IS NULL) AS unknown
FROM learned_replies;
