-- 003_candidates_and_access_requests.sql
-- Enrich campaigns table with candidate-specific fields.
-- Create access_requests table for user onboarding flow.
-- Add permissions tracking to user_campaigns.

-- 1) Add candidate fields to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS cargo TEXT,
  ADD COLUMN IF NOT EXISTS numero INTEGER,
  ADD COLUMN IF NOT EXISTS partido TEXT,
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- 2) Add permission flags to user_campaigns (tierra = campo, digital = web/redes)
ALTER TABLE public.user_campaigns
  ADD COLUMN IF NOT EXISTS perm_tierra BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_digital BOOLEAN NOT NULL DEFAULT false;

-- 3) Create access_requests table
-- When a new user registers and selects a candidate, a request is created.
-- An admin must approve it before the user gets access.
CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON public.access_requests (status);
CREATE INDEX IF NOT EXISTS idx_access_requests_user ON public.access_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_campaign ON public.access_requests (campaign_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_requests_user_campaign_pending
  ON public.access_requests (user_id, campaign_id) WHERE status = 'pending';
