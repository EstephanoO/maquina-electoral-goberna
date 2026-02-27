-- 032: Chat messages for field team communication
-- brigadista_zonal <-> agente_campo within the same campaign.
-- 1-to-1 text messages, offline-first, campaign-scoped.

CREATE TABLE IF NOT EXISTS chat_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    client_id       TEXT,  -- unique ID from mobile for dedup (offline-first)
    read            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversation lookup: all messages between two users in a campaign, newest first
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages (campaign_id, LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);

-- Unread count per receiver (partial index for performance)
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
    ON chat_messages (receiver_id, campaign_id) WHERE read = FALSE;

-- Dedup: mobile sends client_id to avoid double-writes on retry
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_id
    ON chat_messages (client_id) WHERE client_id IS NOT NULL;

-- Sender timeline (for listing recent conversations)
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
    ON chat_messages (sender_id, created_at DESC);

-- Receiver timeline
CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver
    ON chat_messages (receiver_id, created_at DESC);
