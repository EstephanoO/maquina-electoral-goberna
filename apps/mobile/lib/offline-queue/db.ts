/**
 * SQLite database initialization for offline queue.
 * 
 * Tables:
 * - pending_locations: GPS points waiting to sync
 * - pending_forms: Form submissions waiting to sync
 * - sync_meta: Metadata like last sync time, sequence numbers
 */

import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  
  db = await SQLite.openDatabaseAsync('goberna_offline.db');
  await initTables(db);
  return db;
}

async function initTables(database: SQLite.SQLiteDatabase): Promise<void> {
  // Enable WAL mode for better concurrent access
  await database.execAsync('PRAGMA journal_mode = WAL;');
  
  // Pending locations table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      campaign_id TEXT,
      ts TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL,
      speed REAL,
      heading REAL,
      battery REAL,
      seq INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
  `);
  
  // Index for efficient sync queries
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_locations_sync_status 
    ON pending_locations(sync_status, created_at);
  `);
  
  // Pending forms table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL UNIQUE,
      campaign_id TEXT NOT NULL,
      form_definition_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
  `);
  
  // Index for efficient sync queries
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_forms_sync_status 
    ON pending_forms(sync_status, created_at);
  `);
  
  // Sync metadata table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  
  // Initialize sequence number if not exists
  const seqRow = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = 'location_seq'"
  );
  if (!seqRow) {
    await database.runAsync(
      "INSERT INTO sync_meta (key, value) VALUES ('location_seq', '0')"
    );
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
