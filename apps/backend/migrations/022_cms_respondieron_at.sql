-- 022: Add cms_respondieron_at timestamp to track when "respondieron" was marked
-- Enables time-based metrics: claim→hablado, hablado→respondieron

ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS cms_respondieron_at TIMESTAMPTZ;

-- Update existing respondieron rows: backfill with cms_hablado_at as best guess
UPDATE form_submissions
SET cms_respondieron_at = COALESCE(cms_hablado_at, cms_claimed_at, created_at)
WHERE cms_status = 'respondieron' AND cms_respondieron_at IS NULL;
