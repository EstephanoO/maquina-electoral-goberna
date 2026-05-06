-- 036_auto_country_trigger_reclassify.sql
-- 1. Trigger: auto-set country desde phone si NULL/empty/Unknown
-- 2. Backfill leads recientes sin país
-- 3. Re-clasificar todo el historial: aplicar ai_rules a cada message_in
--    y mergear los tags resultantes al lead.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Trigger BEFORE INSERT/UPDATE de leads que normaliza country
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_country_from_phone() RETURNS trigger AS $$
BEGIN
  IF NEW.phone IS NOT NULL
     AND (NEW.country IS NULL OR NEW.country = '' OR NEW.country = 'Unknown') THEN
    NEW.country := detect_country_from_phone(NEW.phone);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_auto_country ON leads;
CREATE TRIGGER leads_auto_country
  BEFORE INSERT OR UPDATE OF phone, country ON leads
  FOR EACH ROW EXECUTE FUNCTION auto_country_from_phone();

-- Backfill leads recientes que escaparon
UPDATE leads SET country = detect_country_from_phone(phone)
 WHERE phone IS NOT NULL
   AND (country IS NULL OR country = '' OR country = 'Unknown')
   AND detect_country_from_phone(phone) IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Re-clasificar historial: aplicar ai_rules a cada message_in
--    y mergear tags al lead.
--
-- Por cada message_in:
--   - aplicar regex de cada ai_rule activa
--   - si matchea, agregar tag a leads.tags (sin duplicar)
-- ─────────────────────────────────────────────────────────────────────

WITH applied AS (
  SELECT
    i.lead_id,
    array_agg(DISTINCT r.tag) AS new_tags
  FROM interactions i
  CROSS JOIN ai_rules r
  WHERE i.kind = 'message_in'
    AND i.body IS NOT NULL
    AND r.enabled = TRUE
    AND i.body ~* r.pattern
  GROUP BY i.lead_id
)
UPDATE leads l
   SET tags = ARRAY(
     SELECT DISTINCT t FROM unnest(coalesce(l.tags, ARRAY[]::text[]) || a.new_tags) AS t
   ),
       updated_at = now()
  FROM applied a
 WHERE l.id = a.lead_id;

SELECT
  count(*) FILTER (WHERE country = 'Unknown' OR country IS NULL OR country = '') AS sin_pais,
  count(*) FILTER (WHERE array_length(tags, 1) > 0) AS con_tags,
  ROUND(AVG(array_length(tags, 1))::numeric, 1) AS avg_tags_per_lead
FROM leads
WHERE phone IS NOT NULL;
