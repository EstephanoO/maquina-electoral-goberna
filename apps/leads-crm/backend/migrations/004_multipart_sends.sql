ALTER TABLE sends
  ADD COLUMN IF NOT EXISTS body_parts TEXT[];
-- NULL = single-message send (legacy / fallback).
-- Populated = multi-part send (each part is a separate WA message).
