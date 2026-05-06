-- Nexus Leads — initial schema

CREATE TABLE IF NOT EXISTS leads (
  id                  SERIAL PRIMARY KEY,
  name                TEXT        NOT NULL,
  phone               TEXT,
  course              TEXT,
  level               TEXT,
  last_purchase_year  INTEGER,
  stage               TEXT        NOT NULL DEFAULT 'new',
  notes               TEXT,
  tags                TEXT[]      NOT NULL DEFAULT '{}',
  source              TEXT        NOT NULL DEFAULT 'whatsapp',
  assigned_to         TEXT,
  captured_by_phone   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Normalized phone lookup (digits only). Unique so upsert by phone works cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_norm
  ON leads (regexp_replace(phone, '\D', '', 'g'))
  WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS idx_leads_stage       ON leads (stage);
CREATE INDEX IF NOT EXISTS idx_leads_updated_at  ON leads (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_course      ON leads (course);
CREATE INDEX IF NOT EXISTS idx_leads_tags        ON leads USING gin (tags);

CREATE TABLE IF NOT EXISTS interactions (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER     NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL,
  body        TEXT,
  meta        JSONB,
  by_user     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_lead_created
  ON interactions (lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sends (
  id           SERIAL PRIMARY KEY,
  lead_id      INTEGER     NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  body         TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending',
  error        TEXT,
  assigned_to  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sends_status_created
  ON sends (status, created_at);
CREATE INDEX IF NOT EXISTS idx_sends_assigned_to
  ON sends (assigned_to, status);

-- Auto-update updated_at on leads & templates
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_templates_updated_at ON templates;
CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
