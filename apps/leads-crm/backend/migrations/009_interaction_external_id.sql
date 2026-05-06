-- Link interactions back to their source (e.g. WhatsApp message id) for dedup on re-import.
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS interactions_external_unique
  ON interactions (lead_id, external_id)
  WHERE external_id IS NOT NULL;
