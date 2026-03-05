-- Migration 032: Campaign Access Codes
-- Un codigo de acceso de 4 caracteres por campana para registro rapido en mobile.
-- Distinto de las invitaciones normales: es persistente, sin limite de usos,
-- y siempre otorga rol agente_campo.

CREATE TABLE IF NOT EXISTS campaign_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  code CHAR(4) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id),    -- solo un codigo activo por campana
  UNIQUE (code)            -- codigos globalmente unicos
);

CREATE INDEX IF NOT EXISTS idx_campaign_access_codes_code ON campaign_access_codes(code);
CREATE INDEX IF NOT EXISTS idx_campaign_access_codes_campaign ON campaign_access_codes(campaign_id);
