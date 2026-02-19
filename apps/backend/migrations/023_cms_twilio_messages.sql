-- 023: CMS Twilio WhatsApp messages
-- Stores outbound/inbound WhatsApp messages tied to CMS contacts.
-- Aislado del flujo CMS existente: no modifica tablas anteriores.

CREATE TABLE IF NOT EXISTS cms_twilio_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID        NOT NULL,  -- form_submissions.id
  campaign_id  UUID        NOT NULL,
  direction    TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body         TEXT        NOT NULL,
  twilio_sid   TEXT        UNIQUE,    -- SM... SID de Twilio
  status       TEXT        NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','sent','delivered','read','failed','undelivered','received')),
  sent_by      UUID,                  -- users.id del operador; NULL si inbound
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_twilio_messages_contact
  ON cms_twilio_messages (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cms_twilio_messages_campaign
  ON cms_twilio_messages (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cms_twilio_messages_sid
  ON cms_twilio_messages (twilio_sid)
  WHERE twilio_sid IS NOT NULL;
