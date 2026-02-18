-- Migration 011: Organizational Model
-- Adds: role expansion, org_hierarchy, zones, invitations
--
-- NOTE: No BEGIN/COMMIT here — the migration runner wraps each file
-- in its own transaction. Inner BEGIN/COMMIT would break the runner.
--
-- This migration is IDEMPOTENT: safe to run even if a previous failed
-- attempt partially committed some UPDATEs (handles both old and new values).

-- ── 1. Expand role values in users table ──────────────────────────────
-- Old: 'agent', 'supervisor', 'admin'
-- New: 'admin', 'consultor', 'jefe_campana', 'brigadista_zonal', 'agente_campo'
--
-- CRITICAL ORDER: DROP constraint FIRST, then UPDATE data, then ADD new constraint.
-- Previous version tried to UPDATE before DROP — that fails because the old
-- constraint rejects 'agente_campo'/'jefe_campana'.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Migrate existing roles (idempotent: WHERE clause only matches old values)
UPDATE users SET role = 'agente_campo' WHERE role = 'agent';
UPDATE users SET role = 'jefe_campana' WHERE role = 'supervisor';
-- 'admin' stays as 'admin'

-- Add new constraint with expanded role set
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'consultor', 'jefe_campana', 'brigadista_zonal', 'agente_campo'));

-- ── 2. Expand role values in user_campaigns ────────────────────────────
ALTER TABLE user_campaigns DROP CONSTRAINT IF EXISTS user_campaigns_role_check;

-- Migrate data (idempotent)
UPDATE user_campaigns SET role = 'agente_campo' WHERE role = 'agent';
UPDATE user_campaigns SET role = 'jefe_campana' WHERE role = 'supervisor';

-- Add new constraint
ALTER TABLE user_campaigns ADD CONSTRAINT user_campaigns_role_check
  CHECK (role IN ('admin', 'consultor', 'jefe_campana', 'brigadista_zonal', 'agente_campo'));

-- ── 3. Zones table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 500,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zones_campaign ON zones(campaign_id);
CREATE INDEX IF NOT EXISTS idx_zones_assigned ON zones(assigned_to);

-- ── 4. Organizational hierarchy ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'consultor', 'jefe_campana', 'brigadista_zonal', 'agente_campo')),
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_hierarchy_campaign ON org_hierarchy(campaign_id);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_parent ON org_hierarchy(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_user ON org_hierarchy(user_id);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_zone ON org_hierarchy(zone_id);

-- ── 5. Invitations table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('consultor', 'jefe_campana', 'brigadista_zonal', 'agente_campo')),
  parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_campaign ON invitations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
