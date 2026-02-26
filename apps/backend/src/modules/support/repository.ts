/**
 * GOBERNA — Support Chat Repository
 *
 * Database access for support_messages table.
 */

import { pool } from "../../db";

export type SupportMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  read: boolean;
  created_at: string;
};

export type ConversationSummary = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
};

/**
 * Insert a new support message.
 */
export async function createMessage(
  senderId: string,
  receiverId: string,
  body: string,
): Promise<SupportMessage> {
  const { rows } = await pool.query<SupportMessage>(
    `INSERT INTO support_messages (sender_id, receiver_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id, receiver_id, body, read, created_at`,
    [senderId, receiverId, body],
  );
  return rows[0]!;
}

/**
 * Get messages between two users, paginated (newest first, reversed for display).
 */
export async function getConversation(
  userA: string,
  userB: string,
  limit = 50,
  before?: string,
): Promise<SupportMessage[]> {
  const params: unknown[] = [userA, userB, limit];
  let whereClause = `WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)`;

  if (before) {
    whereClause += ` AND created_at < $4`;
    params.push(before);
  }

  const { rows } = await pool.query<SupportMessage>(
    `SELECT id, sender_id, receiver_id, body, read, created_at
     FROM support_messages
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $3`,
    params,
  );
  return rows.reverse(); // Return in chronological order
}

/**
 * Mark all messages from otherUser to reader as read.
 */
export async function markRead(readerId: string, otherUserId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE support_messages SET read = TRUE
     WHERE receiver_id = $1 AND sender_id = $2 AND read = FALSE`,
    [readerId, otherUserId],
  );
  return rowCount ?? 0;
}

/**
 * Get unread message count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM support_messages
     WHERE receiver_id = $1 AND read = FALSE`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Admin: list all conversation threads (grouped by user).
 */
export async function listConversations(adminId: string): Promise<ConversationSummary[]> {
  const { rows } = await pool.query<ConversationSummary>(
    `WITH last_msgs AS (
       SELECT DISTINCT ON (other_id) *
       FROM (
         SELECT
           CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_id,
           body AS last_message,
           created_at AS last_message_at,
           CASE WHEN receiver_id = $1 AND read = FALSE THEN 1 ELSE 0 END AS is_unread
         FROM support_messages
         WHERE sender_id = $1 OR receiver_id = $1
       ) sub
       ORDER BY other_id, last_message_at DESC
     ),
     unread_counts AS (
       SELECT sender_id AS other_id, COUNT(*)::int AS unread_count
       FROM support_messages
       WHERE receiver_id = $1 AND read = FALSE
       GROUP BY sender_id
     )
     SELECT
       u.id AS user_id,
       u.full_name,
       u.email,
       u.role,
       lm.last_message,
       lm.last_message_at,
       COALESCE(uc.unread_count, 0)::int AS unread_count
     FROM last_msgs lm
     JOIN users u ON u.id = lm.other_id
     LEFT JOIN unread_counts uc ON uc.other_id = lm.other_id
     ORDER BY lm.last_message_at DESC`,
    [adminId],
  );
  return rows;
}

/**
 * Get all admin user IDs.
 */
export async function getAdminIds(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin'`,
  );
  return rows.map((r) => r.id);
}
