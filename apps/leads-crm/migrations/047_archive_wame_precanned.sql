-- 047_archive_wame_precanned.sql
--
-- Archiva learned_replies cuya query_text es un mensaje pre-canned del link
-- wa.me (texto pre-cargado en el URL `https://wa.me/...?text=`). Estos queries
-- son sintéticos — dominan el embedding space porque se repiten idénticos
-- (ej. "¡Hola! Deseo inscribirme al Diploma Técnico de Gestión Parlamentaria
-- Bicameral." aparece 24× en p4) y un lead nuevo que escribe natural ("hola
-- info de parlamentaria") matchea mal contra este texto formal.
--
-- El filtro a partir de ahora vive en getInboundOutboundPairs (db.ts) — esta
-- migration solo limpia lo que ya entró antes del fix. status='archived' para
-- preservar audit trail (no DELETE).

WITH archived AS (
  UPDATE learned_replies
     SET status = 'archived'
   WHERE status = 'active'
     AND query_text ~* '^[¡¿]?\s*hola[!.,]?\s*(deseo\s+inscribirme|quiero\s+m[aá]s\s+informaci[oó]n|me\s+interesa\s+(el|la|este)\s+(diploma|curso|programa))'
   RETURNING id, query_text
)
SELECT count(*) AS archived_count, count(DISTINCT query_text) AS unique_queries_archived
FROM archived;
