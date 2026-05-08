-- 060_users_password_hash_nullable.sql
--
-- Drop NOT NULL en users.password_hash para habilitar OTP-only via Firebase
-- Phone Auth. Pedido del mobile agent (checkpoint engram #455, 2026-05-07).
--
-- Contexto:
-- - Antes: register exigía email + password; password_hash NOT NULL.
-- - Ahora: el flow canónico de auth en mobile es número → SMS Firebase →
--   ID token → backend valida y emite JWT propio. Sin password.
-- - users creados por OTP (mobile) o por /api/onboarding/provisioned
--   (server-to-server desde nexus-control) NO tienen password.
-- - Login con password sigue funcionando para users que sí lo tienen
--   (legacy + admins) — bcrypt.compare contra NULL falla limpio.
--
-- Migración 059 ya agregó users.firebase_uid; este es el step
-- complementario para que el row sea válido sin password_hash.

ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- No backfill: rows existentes ya tienen password_hash poblado.
-- Nuevos rows OTP-only / onboarding insertan password_hash = NULL.
