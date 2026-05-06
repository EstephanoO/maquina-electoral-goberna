-- 028_human_attention.sql
-- "Atención humana": cuando el bot recibe un mensaje pero no encuentra
-- template/regla que aplique, NO responde y marca el lead para que el
-- operador lo atienda. Visible inmediatamente en el CRM.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS needs_human_attention BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attention_reason      TEXT,
  ADD COLUMN IF NOT EXISTS attention_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attention_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attention_resolved_by TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_needs_attention
  ON leads(needs_human_attention, attention_at DESC) WHERE needs_human_attention = TRUE;

-- Cuando se pone needs_human_attention=TRUE, copiar timestamp si attention_at es NULL.
CREATE OR REPLACE FUNCTION mark_attention_timestamp() RETURNS trigger AS $$
BEGIN
  IF NEW.needs_human_attention = TRUE AND OLD.needs_human_attention = FALSE THEN
    NEW.attention_at := COALESCE(NEW.attention_at, now());
    NEW.attention_resolved_at := NULL;
    NEW.attention_resolved_by := NULL;
  ELSIF NEW.needs_human_attention = FALSE AND OLD.needs_human_attention = TRUE THEN
    NEW.attention_resolved_at := COALESCE(NEW.attention_resolved_at, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_attention_ts ON leads;
CREATE TRIGGER leads_attention_ts
  BEFORE UPDATE OF needs_human_attention ON leads
  FOR EACH ROW EXECUTE FUNCTION mark_attention_timestamp();

-- Vista: queue de atención humana, ordenada por urgencia (más reciente primero)
CREATE OR REPLACE VIEW v_attention_queue AS
SELECT
  l.id, l.name, l.phone, l.country, l.stage, l.tags,
  l.attention_reason, l.attention_at,
  EXTRACT(EPOCH FROM (now() - l.attention_at))::int AS waiting_seconds,
  (SELECT body FROM interactions
    WHERE lead_id = l.id AND kind = 'message_in'
    ORDER BY id DESC LIMIT 1) AS last_inbound_msg
FROM leads l
WHERE l.needs_human_attention = TRUE
ORDER BY l.attention_at DESC;

-- Stats actuales
SELECT
  count(*) AS pendientes
FROM leads WHERE needs_human_attention = TRUE;
