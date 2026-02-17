-- 007_meets.sql
-- Meets (actividades de campo): system for managing field activities
-- that agents can join with GPS tracking

CREATE TABLE IF NOT EXISTS meets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location_name VARCHAR(255),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('pending_location','scheduled','active','completed','cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meet_participants (
  meet_id UUID NOT NULL REFERENCES meets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (meet_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meets_campaign_status ON meets(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_meets_starts_at ON meets(starts_at);
CREATE INDEX IF NOT EXISTS idx_meet_participants_user ON meet_participants(user_id);
