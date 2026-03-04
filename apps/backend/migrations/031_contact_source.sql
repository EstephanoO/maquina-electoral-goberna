-- 031_contact_source.sql
-- Add contact_source to form_submissions to distinguish where a lead came from.
-- 'territorio': captured by field brigadistas via mobile app (default, existing data)
-- 'meta':       imported from Meta/Facebook Lead Ads webhook
-- 'manual':     created manually by an operator (import, CSV, etc.)
--
-- Zero-downtime: ADD COLUMN with DEFAULT is instant in PostgreSQL 11+.

ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS contact_source TEXT NOT NULL DEFAULT 'territorio'
    CHECK (contact_source IN ('territorio', 'meta', 'manual'));

-- Index for filtering/grouping metrics by source per campaign
CREATE INDEX IF NOT EXISTS idx_form_submissions_contact_source
  ON form_submissions (campaign_id, contact_source, cms_status);
