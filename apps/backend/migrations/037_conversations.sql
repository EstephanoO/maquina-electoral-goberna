-- ═══════════════════════════════════════════════════════════════════════
-- 037: Conversations table — tracks per-contact WhatsApp conversations
-- with ownership, classification, and message history.
--
-- Design principles:
--   1. JID as primary identifier (phone resolves <2% of the time)
--   2. One conversation per (campaign, own_number, jid) — deduped
--   3. First operator to message owns the conversation
--   4. Classification is per-conversation, not per-message
--   5. Messages stored as JSONB array (append-only, capped at 50)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversations (
  id              BIGSERIAL PRIMARY KEY,
  campaign_id     UUID        NOT NULL,
  own_number      TEXT        NOT NULL,         -- WA phone that initiated (e.g. 51901938157)
  jid             TEXT        NOT NULL,         -- Remote party JID (e.g. 5199999@s.whatsapp.net or @lid)
  phone           TEXT,                         -- Resolved phone number (nullable, often null for @lid)
  contact_name    TEXT,                         -- Best-known contact name

  -- Ownership: first operator to send a message
  owner_id        UUID,                         -- FK → users.id (operator who owns this conversation)
  owner_name      TEXT,                         -- Denormalized for fast reads

  -- Message log (JSONB array, max 50 entries)
  -- Each entry: { "d": "out"|"in", "t": "message text", "ts": epoch_ms, "op": operator_id? }
  messages        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  message_count   INT         NOT NULL DEFAULT 0,
  inbound_count   INT         NOT NULL DEFAULT 0,  -- messages from the contact

  -- Classification (set once, only overrideable manually)
  vote_class      TEXT,                         -- duro, blando, flotante, or null
  status          TEXT,                         -- respondido, invalido, or null
  category        TEXT,                         -- classification category
  confidence      REAL,                         -- 0.0 - 1.0
  reason          TEXT,                         -- human-readable reason
  classified_at   TIMESTAMPTZ,
  classified_by   TEXT        NOT NULL DEFAULT 'pending',  -- 'auto', 'manual', 'pending'

  -- Link to form_validations (if phone resolved and matched)
  validation_id   UUID,                         -- FK → form_validations.id

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One conversation per (campaign, phone line, remote JID)
  CONSTRAINT uq_conversation UNIQUE (campaign_id, own_number, jid)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_conv_campaign        ON conversations (campaign_id);
CREATE INDEX IF NOT EXISTS idx_conv_campaign_owner   ON conversations (campaign_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_conv_campaign_phone   ON conversations (campaign_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_campaign_status  ON conversations (campaign_id, classified_by);
CREATE INDEX IF NOT EXISTS idx_conv_updated          ON conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_validation       ON conversations (validation_id) WHERE validation_id IS NOT NULL;

-- Also add unique index on form_validations.telefono per campaign to prevent future dupes
-- (won't fail if dupes exist — it's a partial index on non-empty telefono)
-- We'll clean existing dupes separately.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fv_campaign_telefono_unique
  ON form_validations (campaign_id, telefono)
  WHERE telefono IS NOT NULL AND telefono != '' AND telefono != '987654321';
