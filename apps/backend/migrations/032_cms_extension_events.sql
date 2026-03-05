-- 032_cms_extension_events.sql
-- Registra cada mensaje enviado desde la extensión de Chrome por operadora.
-- Permite métricas de "mensajes enviados" por usuario de Goberna.

CREATE TABLE IF NOT EXISTS cms_extension_events (
  id            BIGSERIAL   PRIMARY KEY,
  campaign_id   UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  operator_id   UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  contact_id    UUID        REFERENCES form_submissions(id)   ON DELETE SET NULL,
  phone         TEXT        NOT NULL,          -- teléfono destino (limpio, solo dígitos)
  matched       BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_ext_events_campaign   ON cms_extension_events (campaign_id);
CREATE INDEX IF NOT EXISTS idx_cms_ext_events_operator   ON cms_extension_events (operator_id);
CREATE INDEX IF NOT EXISTS idx_cms_ext_events_created_at ON cms_extension_events (created_at);
