import { sql } from "../sql.js";

/**
 * Settings KV store: singleton table key/value (jsonb). Usado para active_sessions,
 * country_prefixes, sender_phones y otros valores globales sin schema fijo.
 */

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return rows[0] ? (rows[0].value as T) : null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${sql.json(value as any)}, now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now()
  `;
}
