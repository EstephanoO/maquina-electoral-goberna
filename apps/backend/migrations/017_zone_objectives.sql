-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 017: Zone Objectives System
-- 
-- Implements cascading objectives: Region → Brigadista → Agentes
-- Each region (department) has a target number of forms/data to collect.
-- Brigadistas inherit their region's objective.
-- Agents under a brigadista share that objective proportionally.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Zone Objectives Table ──────────────────────────────────────────────────
-- Stores the target for each region (department) per campaign
CREATE TABLE IF NOT EXISTS zone_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  region TEXT NOT NULL, -- Department name (e.g., "LIMA", "AREQUIPA")
  target_forms INTEGER NOT NULL DEFAULT 0, -- Target number of forms to collect
  description TEXT, -- Optional description/notes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- One objective per region per campaign
  UNIQUE (campaign_id, region)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_zone_objectives_campaign ON zone_objectives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_zone_objectives_region ON zone_objectives(region);

-- ─── User Objectives Override (optional per-user adjustments) ───────────────
-- Allows overriding the inherited objective for specific users
CREATE TABLE IF NOT EXISTS user_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_forms INTEGER, -- NULL means inherit from region/supervisor
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One override per user per campaign
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_objectives_campaign ON user_objectives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_user_objectives_user ON user_objectives(user_id);

-- ─── View: User Effective Objectives ────────────────────────────────────────
-- Calculates the effective objective for each user based on:
-- 1. User override (if exists)
-- 2. Region objective divided by agents in that region
CREATE OR REPLACE VIEW user_effective_objectives AS
SELECT 
  uc.user_id,
  uc.campaign_id,
  uc.role,
  u.full_name,
  u.region,
  -- The effective target: user override OR calculated from region
  COALESCE(
    uo.target_forms,
    CASE 
      -- Brigadista gets full region objective
      WHEN uc.role = 'brigadista_zonal' THEN zo.target_forms
      -- Agente gets region objective divided by number of agents in region
      WHEN uc.role = 'agente_campo' THEN 
        CASE 
          WHEN agent_counts.agent_count > 0 
          THEN CEIL(zo.target_forms::numeric / agent_counts.agent_count)
          ELSE zo.target_forms
        END
      -- Other roles don't have objectives
      ELSE NULL
    END
  ) AS target_forms,
  zo.target_forms AS region_total,
  COALESCE(agent_counts.agent_count, 0) AS agents_in_region,
  uo.target_forms IS NOT NULL AS has_override
FROM user_campaigns uc
JOIN users u ON u.id = uc.user_id
LEFT JOIN zone_objectives zo ON zo.campaign_id = uc.campaign_id AND zo.region = u.region
LEFT JOIN user_objectives uo ON uo.campaign_id = uc.campaign_id AND uo.user_id = uc.user_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS agent_count
  FROM user_campaigns uc2
  JOIN users u2 ON u2.id = uc2.user_id
  WHERE uc2.campaign_id = uc.campaign_id
    AND uc2.role = 'agente_campo'
    AND uc2.status = 'active'
    AND u2.region = u.region
) agent_counts ON TRUE
WHERE uc.status = 'active';

-- ─── Comments ───────────────────────────────────────────────────────────────
COMMENT ON TABLE zone_objectives IS 'Target forms per region (department) per campaign';
COMMENT ON TABLE user_objectives IS 'Optional per-user objective overrides';
COMMENT ON VIEW user_effective_objectives IS 'Calculated effective objective per user with cascade logic';
