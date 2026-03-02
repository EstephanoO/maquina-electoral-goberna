/**
 * Chat types shared between transport, offline queue, and UI.
 * Supports both 1-to-1 direct messages and campaign channel (group).
 */

// ── 1-to-1 Direct Messages ──────────────────────────────────

export type ChatMessage = {
  id: string;
  campaign_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  client_id: string | null;
  read: boolean;
  created_at: string;
};

export type ConversationSummary = {
  user_id: string;
  full_name: string;
  role: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_me_sender: boolean;
};

export type TeamMember = {
  user_id: string;
  full_name: string;
  role: string;
};

// ── Channel (Group) Messages ─────────────────────────────────

export type ChannelMessage = {
  id: string;
  campaign_id: string;
  sender_id: string;
  sender_name: string;
  sender_role?: string;
  body: string;
  client_id: string | null;
  created_at: string;
};

// ── WS Protocol ──────────────────────────────────────────────

// WS protocol messages (client -> server)
export type ChatClientMessage =
  | { type: 'send'; receiverId: string; body: string; clientId?: string }
  | { type: 'read'; otherUserId: string }
  | { type: 'channel.send'; body: string; clientId?: string }
  | { type: 'channel.read' }
  | { type: 'ping' };

// WS protocol messages (server -> client)
export type ChatServerMessage =
  | { type: 'connected'; userId: string; campaignId: string; ts: string }
  | { type: 'message.new'; message: ChatMessage }
  | { type: 'message.deduped'; clientId: string; messageId: string }
  | { type: 'messages.read'; readerId: string; otherUserId: string }
  | { type: 'channel.message.new'; message: ChannelMessage }
  | { type: 'channel.message.deduped'; clientId: string; messageId: string }
  | { type: 'channel.read'; userId: string; lastReadAt: string }
  | { type: 'pong'; ts: string }
  | { type: 'error'; code: string; message: string };
