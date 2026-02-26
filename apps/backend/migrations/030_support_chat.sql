-- 030_support_chat.sql
-- Support chat: internal messaging between candidato+ users and admin

CREATE TABLE IF NOT EXISTS support_messages (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  read          BOOLEAN DEFAULT FALSE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fetching conversation between two users
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
  ON support_messages (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);

-- Index for unread count per receiver
CREATE INDEX IF NOT EXISTS idx_support_messages_unread
  ON support_messages (receiver_id, read) WHERE read = FALSE;

-- Index for listing conversations (admin view)
CREATE INDEX IF NOT EXISTS idx_support_messages_created
  ON support_messages (created_at DESC);
