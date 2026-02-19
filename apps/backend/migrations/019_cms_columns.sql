-- 019: Add CMS columns for operator workflow
-- cms_status: 'nuevo' (default), 'claimed' (operator took it), 'hablado' (operator spoke to contact)
-- cms_claimed_by: user_id of operator who claimed the contact
-- cms_claimed_at: timestamp of claim
-- cms_operator_notes: JSONB for operator notes (local_votacion, domicilio, comentarios)

ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS cms_status TEXT NOT NULL DEFAULT 'nuevo'
    CHECK (cms_status IN ('nuevo', 'claimed', 'hablado')),
  ADD COLUMN IF NOT EXISTS cms_claimed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cms_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cms_operator_notes JSONB NOT NULL DEFAULT '{}';

-- Index for CMS queries: list nuevo contacts, list hablado by operator
CREATE INDEX IF NOT EXISTS idx_form_submissions_cms_status
  ON form_submissions (campaign_id, cms_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_submissions_cms_operator
  ON form_submissions (cms_claimed_by, cms_status)
  WHERE cms_claimed_by IS NOT NULL;
