-- 017_stage_alignment.sql
-- Alinear stages al pipeline real del user:
--   contactado / interesado / vendido / entregado / seguimiento / recontacto / revendido / perdido
--
-- Mapping:
--   new, contacted        → contactado
--   interested            → interesado
--   sold, payment_pending → vendido
--   delivered, recibido,
--     completado          → entregado
--   follow_up             → seguimiento
--   en_revision           → recontacto
--   resold                → revendido
--   rechazado             → perdido
--
-- Conserva valor anterior en stage_legacy si está vacío (audit trail).

UPDATE leads SET stage_legacy = stage WHERE stage_legacy IS NULL;

UPDATE leads SET stage = CASE stage
  WHEN 'new'             THEN 'contactado'
  WHEN 'contacted'       THEN 'contactado'
  WHEN 'interested'      THEN 'interesado'
  WHEN 'sold'            THEN 'vendido'
  WHEN 'payment_pending' THEN 'vendido'
  WHEN 'delivered'       THEN 'entregado'
  WHEN 'recibido'        THEN 'entregado'
  WHEN 'completado'      THEN 'entregado'
  WHEN 'follow_up'       THEN 'seguimiento'
  WHEN 'en_revision'     THEN 'recontacto'
  WHEN 'resold'          THEN 'revendido'
  WHEN 'rechazado'       THEN 'perdido'
  ELSE stage  -- ya en formato nuevo
END
WHERE stage IN ('new','contacted','interested','sold','payment_pending','delivered','recibido','completado','follow_up','en_revision','resold','rechazado');

-- Constraint suave: warning para stages fuera del set canónico
-- (no usamos CHECK porque podría romper inserts del bot legacy)
CREATE OR REPLACE FUNCTION assert_valid_stage() RETURNS trigger AS $$
BEGIN
  IF NEW.stage NOT IN ('contactado','interesado','vendido','entregado','seguimiento','recontacto','revendido','perdido') THEN
    RAISE WARNING 'stage % no es canónico (id=%)', NEW.stage, NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_stage_warn ON leads;
CREATE TRIGGER leads_stage_warn
  BEFORE INSERT OR UPDATE OF stage ON leads
  FOR EACH ROW EXECUTE FUNCTION assert_valid_stage();

SELECT stage, count(*) FROM leads GROUP BY stage ORDER BY count DESC;
