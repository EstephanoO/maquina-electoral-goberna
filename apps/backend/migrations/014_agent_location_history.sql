-- Migration 014: Agent Location History
-- Adds: agent_location_history for GPS track retention (7-day rolling)
-- NOTE: No BEGIN/COMMIT — the migration runner wraps each file in its own transaction.

-- ── 1. Create agent_location_history table ────────────────────────────
CREATE TABLE IF NOT EXISTS agent_location_history (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  meet_id UUID REFERENCES meets(id) ON DELETE SET NULL,
  ts TIMESTAMPTZ NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  battery DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_history_agent_ts ON agent_location_history(agent_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_agent_history_campaign ON agent_location_history(campaign_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_agent_history_created ON agent_location_history(created_at);
