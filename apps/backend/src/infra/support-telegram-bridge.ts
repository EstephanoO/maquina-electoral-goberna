/**
 * GOBERNA — Support Chat → Telegram Bridge
 *
 * Subscribes to the support event bus and forwards messages
 * directed at admin users to the Telegram group.
 */

import { pool } from "../db";
import { supportEvents } from "./support-events";
import { tgSupportMessage } from "./telegram";

let adminIds: Set<string> | null = null;

async function getAdminIds(): Promise<Set<string>> {
  if (adminIds) return adminIds;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin'`,
  );
  adminIds = new Set(rows.map((r) => r.id));
  // Refresh every 5 minutes
  setTimeout(() => { adminIds = null; }, 5 * 60 * 1000);
  return adminIds;
}

async function getSenderName(userId: string): Promise<string> {
  const { rows } = await pool.query<{ full_name: string }>(
    `SELECT full_name FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.full_name ?? "Usuario desconocido";
}

export function initSupportTelegramBridge() {
  supportEvents.onSupport("message.new", (payload) => {
    // Fire-and-forget async handler
    void (async () => {
      const admins = await getAdminIds();
      // Only notify if the message is sent TO an admin (i.e., a user writing to admin)
      if (!admins.has(payload.receiverId)) return;
      // Don't notify if admin is sending to themselves
      if (admins.has(payload.senderId)) return;

      const name = await getSenderName(payload.senderId);
      tgSupportMessage(name, payload.body);
    })();
  });
}
