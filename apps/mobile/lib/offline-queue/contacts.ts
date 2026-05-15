/**
 * CRUD access layer for the `contacts` table.
 *
 * Canonical type: Contact — mirrors the SQLite schema defined in db.ts and
 * the future cloud sync schema.  All timestamps are Unix milliseconds (INTEGER).
 *
 * Soft-delete pattern: deleted_at is set to a timestamp; hard deletes are
 * never performed from the mobile client.
 */

import { randomUUID } from 'expo-crypto';
import { getDatabase } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContactEstado = 'apoya' | 'duda' | 'no' | 'no_esta';

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  ubigeo: string | null;
  distrito_nombre: string | null;
  lat: number | null;
  lng: number | null;
  estado: ContactEstado;
  note: string | null;
  photo_uri: string | null;
  reminder_at: number | null;
  reminder_notif_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  campaign_id: string | null;
  agent_id: string | null;
  sync_status: 'local' | 'pending' | 'syncing' | 'synced' | 'failed';
  server_id: string | null;
};

export type NewContactInput = {
  name: string;
  phone?: string | null;
  ubigeo?: string | null;
  distrito_nombre?: string | null;
  lat?: number | null;
  lng?: number | null;
  estado?: ContactEstado;
  note?: string | null;
  photo_uri?: string | null;
  reminder_at?: number | null;
  agent_id?: string | null;
};

/** All mutable fields except `id` and `created_at`. */
export type ContactPatch = Partial<Omit<Contact, 'id' | 'created_at'>>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const COLS =
  'id, name, phone, ubigeo, distrito_nombre, lat, lng, estado, note, ' +
  'photo_uri, reminder_at, reminder_notif_id, created_at, updated_at, ' +
  'deleted_at, campaign_id, agent_id, sync_status, server_id';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Insert a new contact with sensible defaults.
 * Returns the fully-typed Contact row (no round-trip SELECT needed since we
 * build the object in memory before INSERT).
 */
export async function createContact(input: NewContactInput): Promise<Contact> {
  const db = await getDatabase();
  const now = Date.now();
  const c: Contact = {
    id: randomUUID(),
    name: input.name,
    phone: input.phone ?? null,
    ubigeo: input.ubigeo ?? null,
    distrito_nombre: input.distrito_nombre ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    estado: input.estado ?? 'duda',
    note: input.note ?? null,
    photo_uri: input.photo_uri ?? null,
    reminder_at: input.reminder_at ?? null,
    reminder_notif_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    campaign_id: null,
    agent_id: input.agent_id ?? null,
    sync_status: 'local',
    server_id: null,
  };
  await db.runAsync(
    `INSERT INTO contacts (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      c.id, c.name, c.phone, c.ubigeo, c.distrito_nombre,
      c.lat, c.lng, c.estado, c.note, c.photo_uri,
      c.reminder_at, c.reminder_notif_id, c.created_at, c.updated_at,
      c.deleted_at, c.campaign_id, c.agent_id, c.sync_status, c.server_id,
    ],
  );
  return c;
}

/** Fetch a single contact by id (including soft-deleted rows). */
export async function getContact(id: string): Promise<Contact | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Contact>(
    `SELECT ${COLS} FROM contacts WHERE id = ?`,
    [id],
  );
  return row ?? null;
}

/**
 * Patch arbitrary fields on a contact.
 * `updated_at` is always refreshed regardless of whether it is included in
 * the patch.  `id` and `created_at` are intentionally excluded from the
 * ContactPatch type so callers cannot accidentally overwrite them.
 */
export async function updateContact(id: string, patch: ContactPatch): Promise<Contact> {
  const db = await getDatabase();
  // Exclude updated_at from the explicit keys — we always set it ourselves.
  const keys = Object.keys(patch).filter((k) => k !== 'updated_at');
  const sets = [...keys.map((k) => `${k} = ?`), 'updated_at = ?'].join(', ');
  const values = [...keys.map((k) => (patch as Record<string, unknown>)[k]), Date.now()];
  await db.runAsync(
    `UPDATE contacts SET ${sets} WHERE id = ?`,
    [...values, id],
  );
  const updated = await getContact(id);
  if (!updated) throw new Error(`contact ${id} not found after update`);
  return updated;
}

/**
 * Soft-delete: sets `deleted_at` to now.  The row is retained for sync
 * reconciliation.  All list functions filter it out via `deleted_at IS NULL`.
 */
export async function softDeleteContact(id: string): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE contacts SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    [now, now, id],
  );
}

/**
 * Return non-deleted contacts, optionally filtered by `estado`.
 * Results are ordered by most-recently-updated first.
 */
export async function listContacts(
  filter?: { estado?: ContactEstado },
): Promise<Contact[]> {
  const db = await getDatabase();
  const where = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filter?.estado) {
    where.push('estado = ?');
    params.push(filter.estado);
  }
  return db.getAllAsync<Contact>(
    `SELECT ${COLS} FROM contacts WHERE ${where.join(' AND ')} ORDER BY updated_at DESC`,
    params,
  );
}

/**
 * Full-text style search over `name` and `phone` (LIKE, case-insensitive via
 * SQLite's default NOCASE behaviour for ASCII).
 */
export async function searchContacts(query: string): Promise<Contact[]> {
  const db = await getDatabase();
  const q = `%${query.trim()}%`;
  return db.getAllAsync<Contact>(
    `SELECT ${COLS} FROM contacts
     WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ?)
     ORDER BY updated_at DESC`,
    [q, q],
  );
}

/**
 * Return all non-deleted contacts that have a `reminder_at` set (past or
 * future), sorted ascending so the most imminent reminder comes first.
 */
export async function listWithReminders(): Promise<Contact[]> {
  const db = await getDatabase();
  return db.getAllAsync<Contact>(
    `SELECT ${COLS} FROM contacts
     WHERE deleted_at IS NULL AND reminder_at IS NOT NULL
     ORDER BY reminder_at ASC`,
  );
}

/**
 * Hard-wipe all contacts rows.  Intended for tests and developer tooling only
 * — never call from production UI code.
 */
export async function wipeAllContacts(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM contacts;');
}
