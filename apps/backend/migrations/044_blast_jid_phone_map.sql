-- 044_blast_jid_phone_map.sql
-- Bridge table: maps WhatsApp JID → canonical phone number for blast conversations.
--
-- Problem solved:
--   - blast sends a message → gets a JID (msgModel.id) but conversations table
--     stores phone separately
--   - reply arrives with JID but no phone → 78% of conversations have phone=NULL
--
-- Solution:
--   1. Extension calls POST /api/blast/report-conversation after each successful send
--      → stores (jid, phone, own_number) in this map
--   2. Extension calls POST /api/blast/resolve-phone on incoming reply
--      → looks up phone by JID → backfills conversations + voter_profiles
--
-- Invariant: (campaign_id, own_number, jid) is unique.
-- Phone is the canonical identifier (9-digit, no country code).

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Map table
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_jid_phone_map (
  id           bigint  PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  campaign_id  uuid    NOT NULL REFERENCES campaigns(id),
  own_number   text    NOT NULL,
  jid          text    NOT NULL,
  phone        text    NOT NULL,          -- canonical 9-digit phone (no country code)
  contact_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, own_number, jid)
);

CREATE INDEX IF NOT EXISTS idx_bjpm_phone
  ON blast_jid_phone_map(campaign_id, phone);

CREATE INDEX IF NOT EXISTS idx_bjpm_jid
  ON blast_jid_phone_map(jid);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Extend conversations with source column
--    Tag conversations that originated from a blast send.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS source  text NOT NULL DEFAULT 'manual';
