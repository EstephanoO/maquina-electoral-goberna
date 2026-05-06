-- Crear ai_rules para los 6 productos seedeados que tienen classifier_pattern
-- pero ningún ai_rule_id (porque seed se hizo antes de la columna ai_rules.source).

WITH new_rules AS (
  INSERT INTO ai_rules (name, pattern, tag, weight, enabled, source)
  SELECT
    'product:' || nombre,
    classifier_pattern,
    classifier_tag,
    1.0,
    TRUE,
    'product'
  FROM escuela_products p
  WHERE p.classifier_pattern IS NOT NULL
    AND p.classifier_tag IS NOT NULL
    AND p.ai_rule_id IS NULL
    AND p.enabled = TRUE
  ON CONFLICT DO NOTHING
  RETURNING id, name
)
UPDATE escuela_products p
SET ai_rule_id = nr.id, updated_at = now()
FROM new_rules nr
WHERE nr.name = 'product:' || p.nombre;

SELECT
  count(*) AS productos,
  count(*) FILTER (WHERE ai_rule_id IS NOT NULL) AS con_rule
FROM escuela_products WHERE featured = TRUE;
