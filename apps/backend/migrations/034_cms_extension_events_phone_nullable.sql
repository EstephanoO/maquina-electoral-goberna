-- Migration 034: Allow NULL phone in cms_extension_events
--
-- Context: WA Web does not expose the phone number for saved contacts (only the
-- display name). Previously the backend stored the string "unknown" as a
-- placeholder, which polluted COUNT(DISTINCT phone) — unique_contacts was
-- overcounted whenever multiple unresolved events shared the same "unknown"
-- string key.
--
-- Fix: make phone nullable so unresolved events store NULL instead of "unknown".
-- The SQL queries in the repository already use COUNT(DISTINCT phone) which
-- correctly ignores NULLs, so no query changes are needed.
--
-- Safe: ALTER COLUMN DROP NOT NULL acquires only a brief ACCESS EXCLUSIVE lock
-- to update the catalog; it does NOT rewrite the table.

ALTER TABLE cms_extension_events
  ALTER COLUMN phone DROP NOT NULL;

-- Backfill existing "unknown" strings → NULL so historic data is also clean
UPDATE cms_extension_events
   SET phone = NULL
 WHERE phone = 'unknown';
