-- 018_password_reset_required.sql
-- Add password_reset_required field to users table
-- When true, the user must set a new password on next login

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT false;

-- Index for quick lookup of users needing reset
CREATE INDEX IF NOT EXISTS idx_users_password_reset ON users (password_reset_required) WHERE password_reset_required = true;

COMMENT ON COLUMN users.password_reset_required IS 'When true, user must set new password on next login. Set by admin via web dashboard.';
