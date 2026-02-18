-- Migration: 015_campaign_analytics.sql
-- Purpose: Store Google Analytics 4 data per campaign
-- Created: 2026-02-18

-- ============================================================================
-- CAMPAIGN ANALYTICS TABLE
-- ============================================================================
-- Stores parsed GA4 data (overview, pages, sources, cities, daily users)
-- One row per campaign (upsert on new upload)

CREATE TABLE IF NOT EXISTS campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- GA4 data as JSONB (structured: overview, pages, sources, cities, dailyUsers)
  data JSONB NOT NULL DEFAULT '{}',
  
  -- Date range of the analytics data
  date_start VARCHAR(20),
  date_end VARCHAR(20),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One analytics record per campaign (latest upload replaces previous)
  CONSTRAINT campaign_analytics_campaign_unique UNIQUE (campaign_id)
);

-- Index for quick lookup by campaign
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign 
  ON campaign_analytics(campaign_id);

-- Comment
COMMENT ON TABLE campaign_analytics IS 'Stores Google Analytics 4 data uploaded per campaign';
COMMENT ON COLUMN campaign_analytics.data IS 'JSONB with overview, pages, sources, cities, dailyUsers';
