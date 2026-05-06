-- 037_full_history_enrichment.sql
-- Procesa TODOS los message_in históricos y extrae:
--   • email
--   • DNI peruano (8 dígitos o tras "DNI:")
--   • ocupación (abogado, ingeniero, médico, etc.)
--   • nombre real cuando dice "soy X" / "mi nombre es X"
-- Y actualiza el lead sin pisar valores manuales no-vacíos.

-- ─────────────────────────────────────────────────────────────────────
-- 1. EMAILS desde mensajes
-- ─────────────────────────────────────────────────────────────────────
WITH emails AS (
  SELECT DISTINCT ON (lead_id) lead_id,
    lower(substring(body FROM '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))::text AS email
  FROM interactions
  WHERE kind = 'message_in'
    AND body ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
  ORDER BY lead_id, id ASC
)
UPDATE leads l
   SET email = e.email,
       updated_at = now()
  FROM emails e
 WHERE l.id = e.lead_id
   AND e.email IS NOT NULL
   AND e.email != ''
   AND (l.email IS NULL OR l.email = '');

-- ─────────────────────────────────────────────────────────────────────
-- 2. DNI peruano (busca patrón "DNI: XXXXXXXX" o 8 dígitos en context)
-- ─────────────────────────────────────────────────────────────────────
WITH dnis AS (
  SELECT DISTINCT ON (lead_id) lead_id,
    COALESCE(
      (regexp_match(body, '\b[Dd][Nn][Ii][:\s]*?(\d{7,10})\b'))[1],
      (regexp_match(body, '\b[Cc][eé]dula[:\s]*?(\d{7,10})\b'))[1]
    ) AS dni
  FROM interactions
  WHERE kind = 'message_in'
    AND body ~* '\b(dni|c[ée]dula)[:\s]*?\d{7,10}\b'
  ORDER BY lead_id, id ASC
)
UPDATE leads l
   SET dni = d.dni,
       updated_at = now()
  FROM dnis d
 WHERE l.id = d.lead_id
   AND d.dni IS NOT NULL
   AND length(d.dni) BETWEEN 7 AND 10
   AND (l.dni IS NULL OR l.dni = '');

-- ─────────────────────────────────────────────────────────────────────
-- 3. OCUPACIÓN
-- ─────────────────────────────────────────────────────────────────────
WITH ocupaciones AS (
  SELECT DISTINCT ON (lead_id) lead_id,
    lower(
      COALESCE(
        (regexp_match(body, '\b(abogad[oa]|ingenier[oa]|m[eé]dic[oa]|doctor[a]?|consultor[a]?|estudiante|profesor[a]?|docente|polic[ií]a|militar|psic[oó]log[oa]|soci[oó]log[oa]|polit[oó]log[oa]|periodist[a]|comunic[a-z]+|alcalde|alcaldesa|regidor[a]?|concejal[a]?|diputad[oa]|senador[a]?|ministr[oa]|asesor[a]?|arquitec[a-z]+|contad[oa]|administr[a-z]+)\b', 'i'))[1],
        (regexp_match(body, 'soy\s+([a-zá-úñ]{4,18})', 'i'))[1]
      )
    ) AS ocupacion
  FROM interactions
  WHERE kind = 'message_in'
    AND body ~* '\b(abogad|ingenier|m[eé]dic|doctor|consultor|estudiante|profesor|docente|polic[ií]a|militar|psic[oó]log|soci[oó]log|polit[oó]log|periodist|comunicad|alcalde|regidor|concejal|diputad|senador|ministr|asesor|arquitec|contad|administr)'
  ORDER BY lead_id, id ASC
)
UPDATE leads l
   SET ocupacion = o.ocupacion,
       updated_at = now()
  FROM ocupaciones o
 WHERE l.id = o.lead_id
   AND o.ocupacion IS NOT NULL
   AND length(o.ocupacion) BETWEEN 4 AND 30
   AND (l.ocupacion IS NULL OR l.ocupacion = '');

-- ─────────────────────────────────────────────────────────────────────
-- 4. NOMBRE desde mensajes para leads que tienen name = phone (placeholder)
--    Patterns: "soy Carlos", "mi nombre es Juan Pérez", "habla Marisa"
-- ─────────────────────────────────────────────────────────────────────
WITH names AS (
  SELECT DISTINCT ON (lead_id) lead_id,
    initcap(
      COALESCE(
        (regexp_match(body, 'mi\s+nombre\s+es\s+([a-zá-úñ]+(?:\s+[a-zá-úñ]+){0,3})', 'i'))[1],
        (regexp_match(body, 'me\s+llamo\s+([a-zá-úñ]+(?:\s+[a-zá-úñ]+){0,3})', 'i'))[1],
        (regexp_match(body, 'habla\s+([a-zá-úñ]+(?:\s+[a-zá-úñ]+){0,2})', 'i'))[1],
        (regexp_match(body, '^\s*soy\s+([a-zá-úñ]+(?:\s+[a-zá-úñ]+){0,2})', 'i'))[1]
      )
    ) AS extracted_name
  FROM interactions
  WHERE kind = 'message_in'
    AND body ~* '(mi\s+nombre\s+es|me\s+llamo|^\s*soy\s+|habla\s+)[a-zá-úñ]'
  ORDER BY lead_id, id ASC
)
UPDATE leads l
   SET name = n.extracted_name,
       updated_at = now()
  FROM names n
 WHERE l.id = n.lead_id
   AND n.extracted_name IS NOT NULL
   AND length(n.extracted_name) BETWEEN 3 AND 60
   AND (
     l.name IS NULL
     OR l.name = ''
     OR l.name = 'Sin nombre'
     OR l.name = l.phone
     OR l.name ~ '^\+?\d+$'
   );


-- ─────────────────────────────────────────────────────────────────────
-- 5. NOMBRE desde pushName guardado en interactions.meta (cuando bot
--    Baileys lo capturó al recibir el primer mensaje)
-- ─────────────────────────────────────────────────────────────────────
WITH push_names AS (
  SELECT DISTINCT ON (lead_id) lead_id,
    NULLIF(meta->>'pushName', '') AS pn
  FROM interactions
  WHERE kind = 'message_in'
    AND meta->>'pushName' IS NOT NULL
    AND length(meta->>'pushName') BETWEEN 3 AND 60
  ORDER BY lead_id, id ASC
)
UPDATE leads l
   SET name = pn.pn,
       updated_at = now()
  FROM push_names pn
 WHERE l.id = pn.lead_id
   AND pn.pn IS NOT NULL
   AND (
     l.name IS NULL
     OR l.name = ''
     OR l.name = 'Sin nombre'
     OR l.name = l.phone
     OR l.name ~ '^\+?\d+$'
   );


-- ─────────────────────────────────────────────────────────────────────
-- 6. Stats finales
-- ─────────────────────────────────────────────────────────────────────
SELECT
  count(*) AS total_leads,
  count(*) FILTER (WHERE name IS NOT NULL AND name != '' AND name !~ '^\+?\d+$' AND name != 'Sin nombre') AS con_nombre_real,
  count(*) FILTER (WHERE name ~ '^\+?\d+$' OR name = 'Sin nombre' OR name IS NULL OR name = '') AS sin_nombre_placeholder,
  count(*) FILTER (WHERE country IS NOT NULL AND country != 'Unknown' AND country != '') AS con_pais,
  count(*) FILTER (WHERE email IS NOT NULL AND email != '') AS con_email,
  count(*) FILTER (WHERE dni IS NOT NULL AND dni != '') AS con_dni,
  count(*) FILTER (WHERE ocupacion IS NOT NULL AND ocupacion != '') AS con_ocupacion,
  count(*) FILTER (WHERE array_length(tags, 1) > 0) AS con_tags
FROM leads
WHERE phone IS NOT NULL;
