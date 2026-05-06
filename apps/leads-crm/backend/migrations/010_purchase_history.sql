-- Purchase history from CRM CSV import
ALTER TABLE leads ADD COLUMN IF NOT EXISTS total_usd_spent NUMERIC(12,2) DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS n_purchases INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_purchase_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS buyer_tier TEXT; -- vip, repeat, single, prospect

CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_buyer_tier_idx ON leads (buyer_tier);
