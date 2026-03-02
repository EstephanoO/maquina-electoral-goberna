/**
 * Chat offline queue — SQLite persistence for outgoing messages.
 *
 * Messages are queued locally when sent, then delivered via WS (or HTTP fallback).
 * The client_id (UUID) is the dedup key — if the server already has the message,
 * it returns a deduped ack instead of creating a duplicate.
 */

import { getDatabase } from '../offline-queue/db';

/** Simple UUID v4 — no native crypto dependency needed for message dedup keys */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Types ────────────────────────────────────────────────────

export type PendingChatMessage = {
  id: number;
  client_id: string;
  campaign_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  sync_attempts: number;
  last_error: string | null;
};

// ── Schema ───────────────────────────────────────────────────

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  const db = await getDatabase();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL UNIQUE,
      campaign_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_chat_msg_sync_status
    ON pending_chat_messages(sync_status, created_at);
  `);

  tableReady = true;
}

// ── Queue operations ─────────────────────────────────────────

/**
 * Queue a message for delivery. Returns the client_id for tracking.
 */
export async function queueChatMessage(
  campaignId: string,
  receiverId: string,
  body: string,
): Promise<{ clientId: string }> {
  await ensureTable();
  const db = await getDatabase();
  const clientId = generateUUID();

  await db.runAsync(
    `INSERT INTO pending_chat_messages (client_id, campaign_id, receiver_id, body)
     VALUES (?, ?, ?, ?)`,
    [clientId, campaignId, receiverId, body],
  );

  return { clientId };
}

/**
 * Get pending messages to send (pending or failed with < 5 attempts).
 */
export async function getPendingMessages(limit = 20): Promise<PendingChatMessage[]> {
  await ensureTable();
  const db = await getDatabase();

  const rows = await db.getAllAsync<PendingChatMessage>(
    `SELECT * FROM pending_chat_messages
     WHERE sync_status IN ('pending', 'failed') AND sync_attempts < 5
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows;
}

/**
 * Mark messages as currently syncing (lock for current batch).
 */
export async function markAsSyncing(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE pending_chat_messages SET sync_status = 'syncing' WHERE id IN (${placeholders})`,
    ids,
  );
}

/**
 * Mark messages as successfully synced.
 */
export async function markAsSynced(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return;
  const db = await getDatabase();
  const placeholders = clientIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE pending_chat_messages SET sync_status = 'synced' WHERE client_id IN (${placeholders})`,
    clientIds,
  );
}

/**
 * Mark messages as failed (increment attempts).
 */
export async function markAsFailed(ids: number[], error: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE pending_chat_messages
     SET sync_status = 'failed', sync_attempts = sync_attempts + 1, last_error = ?
     WHERE id IN (${placeholders})`,
    [error, ...ids],
  );
}

/**
 * Clean up synced messages older than 24h.
 */
export async function cleanupSyncedMessages(): Promise<void> {
  await ensureTable();
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM pending_chat_messages
     WHERE sync_status = 'synced' AND created_at < datetime('now', '-24 hours')`,
  );
}

/**
 * Get count of pending (unsent) messages.
 */
export async function getPendingCount(): Promise<number> {
  await ensureTable();
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM pending_chat_messages WHERE sync_status IN ('pending', 'failed')`,
  );
  return row?.count ?? 0;
}
