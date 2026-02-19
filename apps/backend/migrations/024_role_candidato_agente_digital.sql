-- 024_role_candidato_agente_digital.sql
-- Replace jefe_campana with candidato; add agente_digital role.
--
-- Steps:
--   1. Drop old CHECK constraints on users and user_campaigns
--   2. Re-add constraints with new valid roles (candidato, agente_digital; no jefe_campana)
--   3. Migrate existing jefe_campana rows to candidato

-- ── users ────────────────────────────────────────────────────────────

-- Drop old constraint (name may vary; try both common patterns)
DO $$
BEGIN
  -- Attempt to drop by the common auto-generated name
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%role%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'users'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%role%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'consultor', 'candidato', 'brigadista_zonal', 'agente_campo', 'agente_digital'));

-- ── user_campaigns ────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'user_campaigns'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%role%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE user_campaigns DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'user_campaigns'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%role%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE user_campaigns
  ADD CONSTRAINT user_campaigns_role_check
  CHECK (role IN ('admin', 'consultor', 'candidato', 'brigadista_zonal', 'agente_campo', 'agente_digital'));

-- ── Data migration ────────────────────────────────────────────────────

UPDATE users SET role = 'candidato', updated_at = now()
WHERE role = 'jefe_campana';

UPDATE user_campaigns SET role = 'candidato', assigned_at = now()
WHERE role = 'jefe_campana';
