-- Country of the lead (derived from contact name tag like "Juan (bolivia)")
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS leads_country_idx ON leads (country);
