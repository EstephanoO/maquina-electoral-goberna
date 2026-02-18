-- Migration: 016_regional_registration.sql
-- Purpose: Add phone and region fields for regional registration flow
-- Created: 2026-02-18

-- ============================================================================
-- 1. ADD PHONE AND REGION TO USERS
-- ============================================================================
-- phone: required for new registrations (nullable for existing users)
-- region: department code (e.g., "LIMA", "AREQUIPA") for filtering

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS region VARCHAR(50);

-- Index for querying by region
CREATE INDEX IF NOT EXISTS idx_users_region ON users(region);

COMMENT ON COLUMN users.phone IS 'Phone number for contact';
COMMENT ON COLUMN users.region IS 'Department/region code (e.g., LIMA, AREQUIPA)';

-- ============================================================================
-- 2. ADD REGION TO ACCESS_REQUESTS
-- ============================================================================
-- Denormalize region into access_requests for efficient filtering
-- Brigadistas zonales filter by this field

ALTER TABLE access_requests
ADD COLUMN IF NOT EXISTS region VARCHAR(50);

-- Index for filtering access requests by region
CREATE INDEX IF NOT EXISTS idx_access_requests_region ON access_requests(region);

COMMENT ON COLUMN access_requests.region IS 'Region from user at request time, for filtering';

-- ============================================================================
-- 3. ADD REGION TO USER_CAMPAIGNS
-- ============================================================================
-- Brigadistas zonales are assigned to specific regions within a campaign

ALTER TABLE user_campaigns
ADD COLUMN IF NOT EXISTS region VARCHAR(50);

-- Index for filtering by region within campaigns
CREATE INDEX IF NOT EXISTS idx_user_campaigns_region ON user_campaigns(region);

COMMENT ON COLUMN user_campaigns.region IS 'Region assignment for brigadistas zonales';
