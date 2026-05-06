CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          TEXT        NOT NULL UNIQUE,
  name           TEXT        NOT NULL,
  password_hash  TEXT        NOT NULL,
  phone          TEXT,
  role           TEXT        NOT NULL DEFAULT 'operator' CHECK (role IN ('operator','admin')),
  disabled       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
