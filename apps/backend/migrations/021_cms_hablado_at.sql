-- 021: Add cms_hablado_at timestamp to track when a contact was marked as "hablado"
-- This allows the CMS UI to show context-appropriate timestamps:
--   - Before hablado: show created_at (when the contact was added)
--   - After hablado: show cms_hablado_at (when the operator talked to them)

ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS cms_hablado_at TIMESTAMPTZ;

-- Index for efficient queries on hablado contacts ordered by when they were talked to
CREATE INDEX IF NOT EXISTS idx_form_submissions_cms_hablado
  ON form_submissions (campaign_id, cms_hablado_at DESC)
  WHERE cms_status IN ('hablado', 'respondieron');
