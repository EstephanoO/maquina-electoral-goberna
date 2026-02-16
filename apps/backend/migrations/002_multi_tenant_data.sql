-- 002_multi_tenant_data.sql
-- Purpose: Add campaign_id to forms and agent_locations_live tables
-- to support multi-tenant data isolation per campaign.
-- campaign_id is nullable intentionally — existing rows predate campaigns,
-- and the Expo app will start sending campaign_id going forward.
-- The existing PK on agent_locations_live (agent_id) is left intact;
-- composite PK enforcement will happen in a future migration after data backfill.

-- 1) forms: add campaign_id with FK to campaigns
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);

CREATE INDEX IF NOT EXISTS idx_forms_campaign_id
  ON public.forms (campaign_id);

CREATE INDEX IF NOT EXISTS idx_forms_campaign_created
  ON public.forms (campaign_id, created_at DESC);

-- 2) agent_locations_live: add campaign_id with FK to campaigns
ALTER TABLE public.agent_locations_live
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);

CREATE INDEX IF NOT EXISTS idx_agent_locations_live_campaign
  ON public.agent_locations_live (campaign_id);
