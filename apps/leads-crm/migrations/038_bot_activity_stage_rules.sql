-- 038_bot_activity_stage_rules.sql
-- 1. Vistas de actividad del bot para dashboard
-- 2. Reglas de auto-progression de stage:
--    - payment_proof / sales_ready → stage = 'sold'
--    - flyer enviado + lead respondió + sin compra → stage = 'interested'
--    - 30+ días sin actividad → stage = 'follow_up'
--    - 90+ días sin respuesta + nunca compró → stage = 'lost'

-- ─────────────────────────────────────────────────────────────────────
-- 1. Bot activity dashboard views
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_bot_activity_today AS
SELECT
  count(*) FILTER (WHERE kind = 'message_in')                                AS msgs_in,
  count(*) FILTER (WHERE kind = 'message_out' AND (meta->>'auto_reply')::bool IS TRUE) AS auto_replies,
  count(*) FILTER (WHERE kind = 'message_out' AND ((meta->>'auto_reply')::bool IS NULL OR (meta->>'auto_reply')::bool = false)) AS msgs_manual,
  count(DISTINCT lead_id) FILTER (WHERE kind = 'message_in')                  AS unique_leads_in,
  count(*) FILTER (WHERE kind = 'message_out' AND (meta->>'holding')::bool IS TRUE) AS holdings_sent,
  count(*) FILTER (WHERE kind = 'message_out' AND (meta->>'agenda_proposed')::bool IS TRUE) AS agenda_proposed,
  count(*) FILTER (WHERE kind = 'message_out' AND (meta->>'agenda_confirmed')::bool IS TRUE) AS agenda_confirmed,
  (SELECT count(*) FROM leads WHERE needs_human_attention AND attention_at::date = current_date) AS attention_today,
  current_date AS day
FROM interactions
WHERE created_at::date = current_date;

-- Daily breakdown (last 14 days)
CREATE OR REPLACE VIEW v_bot_activity_daily AS
SELECT
  created_at::date AS day,
  count(*) FILTER (WHERE kind = 'message_in')                                 AS msgs_in,
  count(*) FILTER (WHERE kind = 'message_out' AND (meta->>'auto_reply')::bool IS TRUE)  AS auto_replies,
  count(*) FILTER (WHERE kind = 'message_out' AND ((meta->>'auto_reply')::bool IS NULL OR (meta->>'auto_reply')::bool = false)) AS msgs_manual,
  count(DISTINCT lead_id) FILTER (WHERE kind = 'message_in')                  AS unique_leads
FROM interactions
WHERE created_at >= current_date - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Top template usage stats
CREATE OR REPLACE VIEW v_template_stats AS
SELECT
  t.id, t.name, t.category,
  count(i.id) FILTER (WHERE i.created_at >= current_date - interval '30 days') AS sent_30d,
  count(i.id) FILTER (WHERE i.created_at >= current_date - interval '7 days')  AS sent_7d,
  t.uses_count AS lifetime_uses
FROM templates t
LEFT JOIN interactions i
  ON (i.meta->>'template_id')::int = t.id
 AND i.kind = 'message_out'
GROUP BY t.id
ORDER BY sent_30d DESC NULLS LAST, lifetime_uses DESC;

-- Hot leads pendientes
CREATE OR REPLACE VIEW v_hot_leads AS
SELECT
  l.id, l.name, l.phone, l.country, l.stage, l.buyer_tier, l.total_usd_spent,
  l.attention_reason, l.attention_at,
  EXTRACT(EPOCH FROM (now() - l.attention_at))::int AS waiting_seconds
FROM leads l
WHERE l.needs_human_attention = TRUE
ORDER BY l.attention_at DESC NULLS LAST
LIMIT 50;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Auto-stage progression: function + trigger
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_progress_stage_on_payment() RETURNS trigger AS $$
BEGIN
  -- Cuando se inserta un message_in que tiene patrón de pago realizado,
  -- avanzar el stage del lead a 'sold' (si estaba en interested/contacted).
  IF NEW.kind = 'message_in' AND NEW.body IS NOT NULL THEN
    IF NEW.body ~* '(comprobante|ya\s*hice\s*el\s*(pago|yape)|deposit[eé]|transfer[ií]|adjunto.*pago|listo\s*el\s*pago)' THEN
      UPDATE leads
         SET stage = 'sold',
             updated_at = now()
       WHERE id = NEW.lead_id
         AND stage IN ('contacted', 'interested', 'follow_up', 'recontact');

      -- Log el auto-progression como interaction stage_change
      INSERT INTO interactions (lead_id, kind, body, meta, created_at)
      SELECT NEW.lead_id, 'stage_change',
             'Auto-progression: detected payment proof in message',
             jsonb_build_object('to_stage', 'sold', 'auto', true, 'reason', 'payment_proof_detected'),
             now()
       WHERE EXISTS (SELECT 1 FROM leads WHERE id = NEW.lead_id AND stage = 'sold');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_progress_payment ON interactions;
CREATE TRIGGER auto_progress_payment
  AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION auto_progress_stage_on_payment();


-- ─────────────────────────────────────────────────────────────────────
-- 3. Stale lead recovery: leads sin actividad → mueve a follow_up
-- ─────────────────────────────────────────────────────────────────────
-- Esto se ejecuta como una función que el operador puede correr o un cron.

CREATE OR REPLACE FUNCTION mark_stale_leads_followup() RETURNS int AS $$
DECLARE
  affected int;
BEGIN
  -- Leads en stage interested/contacted con > 30 días sin respuesta IN
  -- se mueven a follow_up para recontacto.
  WITH stale AS (
    UPDATE leads l
       SET stage = 'follow_up', updated_at = now()
     WHERE stage IN ('interested', 'contacted')
       AND id IN (
         SELECT lead_id FROM (
           SELECT lead_id, max(created_at) AS last_in
             FROM interactions
            WHERE kind = 'message_in'
            GROUP BY lead_id
         ) t
         WHERE t.last_in < now() - interval '30 days'
       )
     RETURNING id
  )
  SELECT count(*) INTO affected FROM stale;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Stats post-migration
-- ─────────────────────────────────────────────────────────────────────
SELECT * FROM v_bot_activity_today;
