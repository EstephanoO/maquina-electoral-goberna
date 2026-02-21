-- 020: Expand CMS statuses to support full operator workflow
-- New statuses: 'respondieron' (contact replied), 'archivado' (archived/dismissed)

-- Drop old constraint (could be named either way depending on how it was created)
ALTER TABLE form_submissions DROP CONSTRAINT IF EXISTS form_submissions_cms_status_check;
ALTER TABLE form_submissions DROP CONSTRAINT IF EXISTS chk_cms_status;
ALTER TABLE form_submissions ADD CONSTRAINT chk_cms_status
  CHECK (cms_status IN ('nuevo', 'claimed', 'hablado', 'respondieron', 'archivado'));

-- Add encuestador derived column for faster queries (denormalized from data JSONB)
-- This avoids repeated COALESCE(data->>'encuestador', '') in every query
