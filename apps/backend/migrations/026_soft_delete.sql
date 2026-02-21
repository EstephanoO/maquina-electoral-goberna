-- 026_soft_delete.sql
-- Soft-delete support: non-admin roles mark records as "pending deletion"
-- instead of hard-deleting. Only admin can confirm permanent deletion.

BEGIN;

-- ── form_submissions: add soft-delete columns ──
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fs_deleted_at
  ON form_submissions (deleted_at) WHERE deleted_at IS NOT NULL;

-- ── legacy forms table: add soft-delete columns ──
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_forms_deleted_at
  ON public.forms (deleted_at) WHERE deleted_at IS NOT NULL;

-- ── form_definitions: expand status CHECK to include 'pending_deletion' ──
-- Drop existing check constraint and recreate with expanded values
ALTER TABLE form_definitions
  DROP CONSTRAINT IF EXISTS form_definitions_status_check;

ALTER TABLE form_definitions
  ADD CONSTRAINT form_definitions_status_check
  CHECK (status IN ('draft', 'active', 'archived', 'pending_deletion'));

-- Add deleted_by to track who requested deletion
ALTER TABLE form_definitions
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMIT;
