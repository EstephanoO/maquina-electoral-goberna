-- 032_operator_attribution.sql
-- Separate "who acted" (operator = human) from "who claimed" (last claimer).
-- Also track which WhatsApp number was used for each action explicitly,
-- and create cms_device_sessions to correlate operators ↔ phone hardware over time.
--
-- Problem this solves:
--   - cms_claimed_by only tracks the LAST person to claim, not who actually spoke
--   - cms_operator_notes.wa_number is an implicit side-channel (not queryable)
--   - No way to compute per-operator metrics when one number is shared by 4 operators
--
-- Zero-downtime: all new columns are nullable or have defaults.

-- 1. Explicit WA number used when the contact was marked hablado/respondieron
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS cms_wa_number TEXT;

-- 2. The user who actually performed the hablado/respondieron action
--    (distinct from cms_claimed_by which is the last claimer)
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS cms_operator_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index: operator productivity queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_operator_id
  ON form_submissions (campaign_id, cms_operator_id, cms_status)
  WHERE cms_operator_id IS NOT NULL;

-- Index: per-device (wa_number) metrics
CREATE INDEX IF NOT EXISTS idx_form_submissions_wa_number
  ON form_submissions (campaign_id, cms_wa_number, cms_status)
  WHERE cms_wa_number IS NOT NULL;

-- 3. Device session tracking: who used which phone number and when.
--    The extension sends a heartbeat every ~5 min to keep the session alive.
--    This lets us answer: "Celular 3 was used by operators A and B in this shift."
CREATE TABLE IF NOT EXISTS cms_device_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  wa_number       TEXT        NOT NULL,           -- e.g. '51906218514'
  operator_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,                    -- NULL = session still active
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_device_sessions_campaign
  ON cms_device_sessions (campaign_id, wa_number, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cms_device_sessions_operator
  ON cms_device_sessions (operator_id, started_at DESC);

-- Partial index for active sessions (ended_at IS NULL is the hot path)
CREATE INDEX IF NOT EXISTS idx_cms_device_sessions_active
  ON cms_device_sessions (campaign_id, wa_number)
  WHERE ended_at IS NULL;
