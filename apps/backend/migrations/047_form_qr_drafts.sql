-- 046_form_qr_drafts.sql
-- Drafts del flujo "registrar al escanear el QR final del form".
-- El brigadista llena el form, se crea un draft con token; el ciudadano
-- escanea, GET /q/:token persiste a form_submissions y redirige a wa.me.

CREATE TABLE IF NOT EXISTS form_qr_drafts (
  token              TEXT        PRIMARY KEY,
  campaign_id        UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  brigadista_id      UUID        NOT NULL REFERENCES users(id),
  form_definition_id UUID,
  client_id          TEXT        NOT NULL,
  payload            JSONB       NOT NULL,        -- { data, lat, lng, client_id, form_definition_id }
  scanned_at         TIMESTAMPTZ,                 -- momento del scan
  consumed_at        TIMESTAMPTZ,                 -- form_submissions ya insertada (idempotencia)
  user_agent         TEXT,                        -- del scanner
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
);

CREATE INDEX IF NOT EXISTS idx_form_qr_drafts_expires
  ON form_qr_drafts(expires_at);

CREATE INDEX IF NOT EXISTS idx_form_qr_drafts_brigadista
  ON form_qr_drafts(brigadista_id, created_at DESC);
