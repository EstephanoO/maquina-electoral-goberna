-- 033_wa_phones.sql
-- Alias configurables para los celulares de WA Web usados por las operadoras.
-- También agrega own_number a cms_extension_events para saber desde qué
-- celular se envió cada mensaje.

-- ── 1. Tabla wa_phones ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_phones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  number      VARCHAR(20) NOT NULL,   -- "51987654321" (sin +, solo dígitos)
  alias       VARCHAR(100) NOT NULL,  -- "Vasquez 1"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, number)
);

CREATE INDEX IF NOT EXISTS idx_wa_phones_campaign ON wa_phones(campaign_id);

-- ── 2. own_number en cms_extension_events ───────────────────────────
ALTER TABLE cms_extension_events
  ADD COLUMN IF NOT EXISTS own_number VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_ext_events_own_number
  ON cms_extension_events(campaign_id, own_number);
