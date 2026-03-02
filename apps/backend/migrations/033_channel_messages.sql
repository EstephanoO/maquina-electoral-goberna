-- 033: Channel messages for campaign-wide group chat
-- One implicit channel per campaign. All brigadista_zonal + agente_campo
-- in the campaign participate. No explicit "channel" entity needed —
-- the campaign IS the channel.

CREATE TABLE IF NOT EXISTS channel_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    client_id       TEXT,  -- offline-first dedup (same pattern as chat_messages)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline: all messages in a campaign channel, newest first
CREATE INDEX IF NOT EXISTS idx_channel_messages_campaign_time
    ON channel_messages (campaign_id, created_at DESC);

-- Dedup: mobile sends client_id to avoid double-writes on retry
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_messages_client_id
    ON channel_messages (client_id) WHERE client_id IS NOT NULL;

-- Sender lookup (for admin metrics)
CREATE INDEX IF NOT EXISTS idx_channel_messages_sender
    ON channel_messages (sender_id, created_at DESC);

-- Track which messages each user has read (per campaign channel)
-- Instead of a per-message read flag (expensive for groups), we store
-- the timestamp of the last message the user has seen.
CREATE TABLE IF NOT EXISTS channel_read_cursors (
    campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (campaign_id, user_id)
);
