-- 026_feedback_loop.sql
-- Aprendizaje continuo: cuando el operador edita los tags de un lead después
-- del auto-reply, o responde manualmente sobreescribiendo la respuesta del bot,
-- se loguea como ai_feedback y aparece en /training para promover a regla.
--
-- También: trigger que loguea cuando un message_out tiene meta.auto_reply=true
-- y luego el operador manda OTRO message_out al mismo lead dentro de 1h →
-- evidencia de que el auto-reply no fue suficiente y el operador reforzó.

CREATE OR REPLACE FUNCTION log_auto_reply_followup() RETURNS trigger AS $$
DECLARE
  recent_auto RECORD;
BEGIN
  -- Solo evaluar message_out manuales (no los del bot)
  IF NEW.kind <> 'message_out' THEN RETURN NEW; END IF;
  IF (NEW.meta->>'auto_reply')::bool IS TRUE THEN RETURN NEW; END IF;

  -- Buscar auto-reply previo al mismo lead en la última hora
  SELECT * INTO recent_auto
    FROM interactions
   WHERE lead_id = NEW.lead_id
     AND kind = 'message_out'
     AND (meta->>'auto_reply')::bool IS TRUE
     AND created_at > now() - INTERVAL '1 hour'
     AND id < NEW.id
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO ai_feedback (interaction_id, suggested_tag, correct_tag, status, source)
    VALUES (
      recent_auto.id,
      'auto_reply:' || COALESCE(recent_auto.meta->>'template_name', 'unknown'),
      'manual_followup',
      'pending',
      'auto_reply_followup_trigger'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_auto_reply_followup_trigger ON interactions;
CREATE TRIGGER log_auto_reply_followup_trigger
  AFTER INSERT ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION log_auto_reply_followup();

-- Add source column to ai_feedback if missing
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS source TEXT;

-- Stats: auto-reply efectividad
CREATE OR REPLACE VIEW v_auto_reply_stats AS
SELECT
  i.meta->>'template_name' AS template,
  count(*) AS sent,
  count(DISTINCT f.id) AS overridden_by_operator,
  ROUND(
    100.0 * (count(*) - count(DISTINCT f.id))::numeric / NULLIF(count(*), 0),
    1
  ) AS effectiveness_pct
FROM interactions i
LEFT JOIN ai_feedback f ON f.interaction_id = i.id AND f.source = 'auto_reply_followup_trigger'
WHERE i.kind = 'message_out' AND (i.meta->>'auto_reply')::bool IS TRUE
GROUP BY i.meta->>'template_name'
ORDER BY count(*) DESC;
