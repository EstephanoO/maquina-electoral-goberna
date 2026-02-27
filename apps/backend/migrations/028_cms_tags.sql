-- 028_cms_tags.sql
-- Add cms_tags text[] column to form_submissions for per-contact tagging.
-- Uses a GIN index for efficient array containment queries (?tag= filter).

ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS cms_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_form_submissions_cms_tags
  ON form_submissions USING GIN (cms_tags);
