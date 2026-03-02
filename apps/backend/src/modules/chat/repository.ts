/**
 * GOBERNA -- Field Team Chat Repository
 *
 * Database access for chat_messages (1-to-1) and channel_messages (group) tables.
 * Campaign-scoped messaging between brigadista_zonal and agente_campo.
 */

import { pool } from "../../db";

// ── Types ────────────────────────────────────────────────────────

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

// ── Queries ──────────────────────────────────────────────────────

/**
 * Insert a new chat message. Uses ON CONFLICT on client_id for offline-first dedup.
 * Returns the message (either newly created or existing if deduped).
 */
export async function createMessage(
  campaignId: string,
  senderId: string,
  receiverId: string,
  body: string,
  clientId?: string | null,
): Promise<{ message: ChatMessage; deduped: boolean }> {
  if (clientId) {
    // Upsert: if client_id already exists, return existing (dedup)
    const { rows } = await pool.query<ChatMessage>(
      `INSERT INTO chat_messages (campaign_id, sender_id, receiver_id, body, client_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id) WHERE client_id IS NOT NULL
       DO NOTHING
       RETURNING id, campaign_id, sender_id, receiver_id, body, client_id, read, created_at`,
      [campaignId, senderId, receiverId, body, clientId],
    );

    if (rows.length > 0) {
      return { message: rows[0]!, deduped: false };
    }

    // Conflict: message already existed. Fetch it.
    const existing = await pool.query<ChatMessage>(
      `SELECT id, campaign_id, sender_id, receiver_id, body, client_id, read, created_at
       FROM chat_messages WHERE client_id = $1`,
      [clientId],
    );
    return { message: existing.rows[0]!, deduped: true };
  }

  // No client_id -- plain insert
  const { rows } = await pool.query<ChatMessage>(
    `INSERT INTO chat_messages (campaign_id, sender_id, receiver_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, campaign_id, sender_id, receiver_id, body, client_id, read, created_at`,
    [campaignId, senderId, receiverId, body],
  );
  return { message: rows[0]!, deduped: false };
}

/**
 * Get messages between two users in a campaign, paginated (newest first, reversed for display).
 */
export async function getConversation(
  campaignId: string,
  userA: string,
  userB: string,
  limit = 50,
  before?: string,
): Promise<ChatMessage[]> {
  const params: unknown[] = [campaignId, userA, userB, limit];
  let whereClause = `WHERE campaign_id = $1
    AND ((sender_id = $2 AND receiver_id = $3) OR (sender_id = $3 AND receiver_id = $2))`;

  if (before) {
    whereClause += ` AND created_at < $5`;
    params.push(before);
  }

  const { rows } = await pool.query<ChatMessage>(
    `SELECT id, campaign_id, sender_id, receiver_id, body, client_id, read, created_at
     FROM chat_messages
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $4`,
    params,
  );
  return rows.reverse(); // Return in chronological order
}

/**
 * Mark all messages from otherUser to reader as read (within a campaign).
 */
export async function markRead(
  campaignId: string,
  readerId: string,
  otherUserId: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE chat_messages SET read = TRUE
     WHERE campaign_id = $1 AND receiver_id = $2 AND sender_id = $3 AND read = FALSE`,
    [campaignId, readerId, otherUserId],
  );
  return rowCount ?? 0;
}

/**
 * Get unread message count for a user in a campaign.
 */
export async function getUnreadCount(
  campaignId: string,
  userId: string,
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM chat_messages
     WHERE campaign_id = $1 AND receiver_id = $2 AND read = FALSE`,
    [campaignId, userId],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * List conversation threads for a user in a campaign (most recent first).
 */
export async function listConversations(
  campaignId: string,
  userId: string,
): Promise<ConversationSummary[]> {
  const { rows } = await pool.query<ConversationSummary>(
    `WITH last_msgs AS (
       SELECT DISTINCT ON (other_id) *
       FROM (
         SELECT
           CASE WHEN sender_id = $2 THEN receiver_id ELSE sender_id END AS other_id,
           body AS last_message,
           created_at AS last_message_at,
           sender_id = $2 AS is_me_sender
         FROM chat_messages
         WHERE campaign_id = $1
           AND (sender_id = $2 OR receiver_id = $2)
       ) sub
       ORDER BY other_id, last_message_at DESC
     ),
     unread_counts AS (
       SELECT sender_id AS other_id, COUNT(*)::int AS unread_count
       FROM chat_messages
       WHERE campaign_id = $1 AND receiver_id = $2 AND read = FALSE
       GROUP BY sender_id
     )
     SELECT
       u.id AS user_id,
       u.full_name,
       uc.role,
       lm.last_message,
       lm.last_message_at,
       COALESCE(urc.unread_count, 0)::int AS unread_count,
       lm.is_me_sender
     FROM last_msgs lm
     JOIN users u ON u.id = lm.other_id
     JOIN user_campaigns uc ON uc.user_id = u.id AND uc.campaign_id = $1
     LEFT JOIN unread_counts urc ON urc.other_id = lm.other_id
     ORDER BY lm.last_message_at DESC`,
    [campaignId, userId],
  );
  return rows;
}

/**
 * List team members the user can chat with (same campaign, brigadista_zonal or agente_campo).
 * Excludes the user themselves.
 */
export async function listChatableMembers(
  campaignId: string,
  userId: string,
): Promise<TeamMember[]> {
  const { rows } = await pool.query<TeamMember>(
    `SELECT u.id AS user_id, u.full_name, uc.role
     FROM user_campaigns uc
     JOIN users u ON u.id = uc.user_id
     WHERE uc.campaign_id = $1
       AND uc.status = 'active'
       AND uc.role IN ('brigadista_zonal', 'agente_campo')
       AND u.id != $2
     ORDER BY uc.role DESC, u.full_name ASC`,
    [campaignId, userId],
  );
  return rows;
}

/**
 * Verify that a user belongs to a specific campaign. Returns true if member.
 */
export async function isCampaignMember(
  campaignId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM user_campaigns
       WHERE campaign_id = $1 AND user_id = $2 AND status = 'active'
     ) AS exists`,
    [campaignId, userId],
  );
  return rows[0]?.exists ?? false;
}

// ══════════════════════════════════════════════════════════════
// ── Channel (Group) Messages ─────────────────────────────────
// ══════════════════════════════════════════════════════════════

export type ChannelMessage = {
  id: string;
  campaign_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  body: string;
  client_id: string | null;
  created_at: string;
};

/**
 * Insert a channel message. Uses ON CONFLICT on client_id for offline-first dedup.
 */
export async function createChannelMessage(
  campaignId: string,
  senderId: string,
  body: string,
  clientId?: string | null,
): Promise<{ message: ChannelMessage; deduped: boolean }> {
  if (clientId) {
    const { rows } = await pool.query<ChannelMessage>(
      `INSERT INTO channel_messages (campaign_id, sender_id, body, client_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id) WHERE client_id IS NOT NULL
       DO NOTHING
       RETURNING
         id, campaign_id, sender_id,
         (SELECT full_name FROM users WHERE id = sender_id) AS sender_name,
         (SELECT uc.role FROM user_campaigns uc WHERE uc.user_id = sender_id AND uc.campaign_id = $1 LIMIT 1) AS sender_role,
         body, client_id, created_at`,
      [campaignId, senderId, body, clientId],
    );

    if (rows.length > 0) {
      return { message: rows[0]!, deduped: false };
    }

    // Conflict: already existed
    const existing = await pool.query<ChannelMessage>(
      `SELECT cm.id, cm.campaign_id, cm.sender_id,
              u.full_name AS sender_name,
              uc.role AS sender_role,
              cm.body, cm.client_id, cm.created_at
       FROM channel_messages cm
       JOIN users u ON u.id = cm.sender_id
       LEFT JOIN user_campaigns uc ON uc.user_id = cm.sender_id AND uc.campaign_id = cm.campaign_id
       WHERE cm.client_id = $1`,
      [clientId],
    );
    return { message: existing.rows[0]!, deduped: true };
  }

  // No client_id
  const { rows } = await pool.query<ChannelMessage>(
    `INSERT INTO channel_messages (campaign_id, sender_id, body)
     VALUES ($1, $2, $3)
     RETURNING
       id, campaign_id, sender_id,
       (SELECT full_name FROM users WHERE id = sender_id) AS sender_name,
       (SELECT uc.role FROM user_campaigns uc WHERE uc.user_id = sender_id AND uc.campaign_id = $1 LIMIT 1) AS sender_role,
       body, client_id, created_at`,
    [campaignId, senderId, body],
  );
  return { message: rows[0]!, deduped: false };
}

/**
 * Get channel messages for a campaign, paginated (newest first, reversed for display).
 */
export async function getChannelMessages(
  campaignId: string,
  limit = 50,
  before?: string,
): Promise<ChannelMessage[]> {
  const params: unknown[] = [campaignId, limit];
  let whereClause = `WHERE cm.campaign_id = $1`;

  if (before) {
    whereClause += ` AND cm.created_at < $3`;
    params.push(before);
  }

  const { rows } = await pool.query<ChannelMessage>(
    `SELECT cm.id, cm.campaign_id, cm.sender_id,
            u.full_name AS sender_name,
            COALESCE(uc.role, 'agente_campo') AS sender_role,
            cm.body, cm.client_id, cm.created_at
     FROM channel_messages cm
     JOIN users u ON u.id = cm.sender_id
     LEFT JOIN user_campaigns uc ON uc.user_id = cm.sender_id AND uc.campaign_id = cm.campaign_id
     ${whereClause}
     ORDER BY cm.created_at DESC
     LIMIT $2`,
    params,
  );
  return rows.reverse(); // chronological order
}

/**
 * Get unread channel message count for a user in a campaign.
 * Uses the channel_read_cursors table to determine what's "unread".
 */
export async function getChannelUnreadCount(
  campaignId: string,
  userId: string,
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM channel_messages cm
     WHERE cm.campaign_id = $1
       AND cm.sender_id != $2
       AND cm.created_at > COALESCE(
         (SELECT last_read_at FROM channel_read_cursors
          WHERE campaign_id = $1 AND user_id = $2),
         '1970-01-01'::timestamptz
       )`,
    [campaignId, userId],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Update read cursor for a user in a campaign channel.
 * Upserts into channel_read_cursors.
 */
export async function updateChannelReadCursor(
  campaignId: string,
  userId: string,
): Promise<string> {
  const { rows } = await pool.query<{ last_read_at: string }>(
    `INSERT INTO channel_read_cursors (campaign_id, user_id, last_read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (campaign_id, user_id)
     DO UPDATE SET last_read_at = NOW()
     RETURNING last_read_at`,
    [campaignId, userId],
  );
  return rows[0]!.last_read_at;
}

/**
 * Get channel member count (brigadista_zonal + agente_campo in the campaign).
 */
export async function getChannelMemberCount(
  campaignId: string,
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM user_campaigns
     WHERE campaign_id = $1
       AND status = 'active'
       AND role IN ('brigadista_zonal', 'agente_campo')`,
    [campaignId],
  );
  return Number(rows[0]?.count ?? 0);
}
