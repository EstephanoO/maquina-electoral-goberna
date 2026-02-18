-- Migration 012: Enhanced Meets
-- Adds: operational fields to meets, meet_groups, meet_group_members
-- NOTE: No BEGIN/COMMIT — the migration runner wraps each file in its own transaction.

-- ── 1. Enhance meets table ────────────────────────────────────────────
ALTER TABLE meets ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE SET NULL;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS meet_type TEXT NOT NULL DEFAULT 'recoleccion'
  CHECK (meet_type IN ('recoleccion', 'reunion', 'capacitacion'));
ALTER TABLE meets ADD COLUMN IF NOT EXISTS directions_text TEXT;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS directions_url TEXT;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS collection_center_lat DOUBLE PRECISION;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS collection_center_lng DOUBLE PRECISION;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS collection_radius_meters INTEGER;
ALTER TABLE meets ADD COLUMN IF NOT EXISTS target_forms INTEGER;

CREATE INDEX IF NOT EXISTS idx_meets_leader ON meets(leader_id);
CREATE INDEX IF NOT EXISTS idx_meets_zone ON meets(zone_id);
CREATE INDEX IF NOT EXISTS idx_meets_type ON meets(campaign_id, meet_type);

-- ── 2. Meet groups table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meet_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meet_id UUID NOT NULL REFERENCES meets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  leader_id UUID REFERENCES users(id) ON DELETE SET NULL,
  collection_center_lat DOUBLE PRECISION,
  collection_center_lng DOUBLE PRECISION,
  collection_radius_meters INTEGER,
  target_forms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meet_groups_meet ON meet_groups(meet_id);
CREATE INDEX IF NOT EXISTS idx_meet_groups_leader ON meet_groups(leader_id);

-- ── 3. Meet group members table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS meet_group_members (
  meet_group_id UUID NOT NULL REFERENCES meet_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (meet_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meet_group_members_user ON meet_group_members(user_id);
