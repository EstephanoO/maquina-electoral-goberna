-- 018_stages_revert.sql
-- Reverte la migración 017. La UI espera stages en inglés y los muestra
-- traducidos al español via STAGE_LABELS. Renombrar el DB rompía el render.
--
-- Mapping de vuelta:
--   contactado   → contacted   (consolida también el legacy "new")
--   interesado   → interested
--   vendido      → sold
--   entregado    → delivered
--   seguimiento  → follow_up
--   recontacto   → recontact
--   revendido    → resold
--   perdido      → lost

-- Drop trigger de validación canónica primero (era para los stages en español)
DROP TRIGGER IF EXISTS leads_stage_warn ON leads;

UPDATE leads SET stage = CASE stage
  WHEN 'contactado'  THEN 'contacted'
  WHEN 'interesado'  THEN 'interested'
  WHEN 'vendido'     THEN 'sold'
  WHEN 'entregado'   THEN 'delivered'
  WHEN 'seguimiento' THEN 'follow_up'
  WHEN 'recontacto'  THEN 'recontact'
  WHEN 'revendido'   THEN 'resold'
  WHEN 'perdido'     THEN 'lost'
  WHEN 'new'         THEN 'contacted'   -- consolida "new" → contacted
  ELSE stage
END
WHERE stage IN ('contactado','interesado','vendido','entregado','seguimiento','recontacto','revendido','perdido','new');

-- Cambiar default de 'new' → 'contacted'
ALTER TABLE leads ALTER COLUMN stage SET DEFAULT 'contacted';

-- Ahora sí poner trigger de validación canónica (con stages en inglés)
CREATE OR REPLACE FUNCTION assert_valid_stage() RETURNS trigger AS $$
BEGIN
  IF NEW.stage NOT IN ('contacted','interested','sold','delivered','follow_up','recontact','resold','lost') THEN
    RAISE WARNING 'stage % no es canónico (id=%)', NEW.stage, NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_stage_warn
  BEFORE INSERT OR UPDATE OF stage ON leads
  FOR EACH ROW EXECUTE FUNCTION assert_valid_stage();

SELECT stage, count(*) FROM leads GROUP BY stage ORDER BY count DESC;
