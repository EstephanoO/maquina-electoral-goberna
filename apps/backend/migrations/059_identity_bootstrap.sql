-- 059: Identity bootstrap — Firebase UID linkage + magic links
--
-- Soporta dos flujos de login del candidato/equipo (Fase 1 del plan
-- Meta Máquina Electoral, ver PLAN_ONBOARDING_META_MAQUINA.md):
--
-- 1. Firebase Phone Auth (mobile): el app obtiene un idToken con el OTP
--    SMS, lo manda al backend, el backend lo valida y o linkea el firebase_uid
--    al user existente o auto-crea el user matchando contra una postulación
--    pendiente por phone_e164.
--
-- 2. Magic link (web/whatsapp): nexus o admin pide un token, lo manda al
--    candidato por WhatsApp, el browser lo consume y emite JWT cookie.
--    Single-use, expiry 24h.

-- ── users.firebase_uid ───────────────────────────────────────────
-- NULL hasta que el usuario haga su primer Firebase Phone Auth.
-- UNIQUE (cuando NOT NULL) para evitar duplicados de cuenta.
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_unique
  ON users (firebase_uid)
  WHERE firebase_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_phone_lookup
  ON users (phone)
  WHERE phone IS NOT NULL;

-- ── magic_links ──────────────────────────────────────────────────
-- Token de un solo uso para login pasivo (sin password).
-- user_id puede ser NULL si el token fue emitido para un phone que aún
-- no tiene user (auto-create en consume si hay candidatos.postulacion match).
CREATE TABLE IF NOT EXISTS magic_links (
  token        TEXT PRIMARY KEY,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  phone_e164   TEXT,
  purpose      TEXT NOT NULL DEFAULT 'login'
                    CHECK (purpose IN ('login', 'team_invite', 'password_reset')),
  redirect_url TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  consumed_ip  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT magic_links_user_or_phone CHECK (user_id IS NOT NULL OR phone_e164 IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_magic_links_phone_active
  ON magic_links (phone_e164)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_magic_links_user_active
  ON magic_links (user_id)
  WHERE consumed_at IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_magic_links_expires_pruning
  ON magic_links (expires_at)
  WHERE consumed_at IS NULL;
