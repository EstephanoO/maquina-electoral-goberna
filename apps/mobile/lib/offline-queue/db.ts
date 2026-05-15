/**
 * SQLite database initialization for offline queue.
 * 
 * Tables:
 * - pending_locations: GPS points waiting to sync
 * - pending_forms: Form submissions waiting to sync
 * - sync_meta: Metadata like last sync time, sequence numbers
 * - geo_distritos: Distrito/ubigeo lookup cache (~1900 rows)
 * - geo_recientes: Recently used distritos
 * - contacts: Canvassing notebook (canonical schema, Fase 1)
 */

import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  // Return existing instance
  if (db) return db;
  
  // Dedupe concurrent init calls
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    const database = await SQLite.openDatabaseAsync('goberna_offline.db');
    await initTables(database);
    db = database;
    return database;
  })();
  
  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
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
  
  // Migration: add agent_name column (safe on existing DBs — IF NOT EXISTS is implicit with ADD COLUMN)
  try {
    await database.execAsync(`ALTER TABLE pending_locations ADD COLUMN agent_name TEXT;`);
  } catch {
    // Column already exists — expected on subsequent launches
  }

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
  
  // Migration: add reject_reason column for forms rejected by server (e.g. duplicate phone)
  try {
    await database.execAsync(`ALTER TABLE pending_forms ADD COLUMN reject_reason TEXT;`);
  } catch {
    // Column already exists — expected on subsequent launches
  }

  // Migration: add ghost_count to track how many times a form was detected as ghost
  try {
    await database.execAsync(`ALTER TABLE pending_forms ADD COLUMN ghost_count INTEGER NOT NULL DEFAULT 0;`);
  } catch {
    // Column already exists — expected on subsequent launches
  }

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
  
  // Initialize sequence number if not exists (INSERT OR IGNORE for idempotency)
  await database.runAsync(
    "INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('location_seq', '0')"
  );
  
  // Geo distritos cache table (preloaded from backend, ~1900 rows)
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS geo_distritos (
      ubigeo TEXT PRIMARY KEY,
      distrito TEXT NOT NULL,
      provincia TEXT NOT NULL,
      departamento TEXT NOT NULL,
      coddep TEXT NOT NULL,
      codprov_full TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  
  // Index for fast search (distrito name is the primary search target)
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_geo_distritos_distrito
    ON geo_distritos(distrito COLLATE NOCASE);
  `);
  
  // Index for provincia name search
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_geo_distritos_provincia
    ON geo_distritos(provincia COLLATE NOCASE);
  `);
  
  // Recently used distritos (for "recientes" + "last used" features)
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS geo_recientes (
      ubigeo TEXT PRIMARY KEY,
      distrito TEXT NOT NULL,
      provincia TEXT NOT NULL,
      departamento TEXT NOT NULL,
      coddep TEXT NOT NULL,
      codprov_full TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT (datetime('now')),
      use_count INTEGER NOT NULL DEFAULT 1
    );
  `);
  
  // Index for recientes ordered by last use
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_geo_recientes_used_at
    ON geo_recientes(used_at DESC);
  `);

  // Contacts — canvassing notebook (canonical shape, mirrors future cloud schema)
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS contacts (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      phone             TEXT,
      ubigeo            TEXT,
      distrito_nombre   TEXT,
      lat               REAL,
      lng               REAL,
      estado            TEXT NOT NULL DEFAULT 'duda',
      note              TEXT,
      photo_uri         TEXT,
      reminder_at       INTEGER,
      reminder_notif_id TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      deleted_at        INTEGER,
      campaign_id       TEXT,
      agent_id          TEXT,
      sync_status       TEXT NOT NULL DEFAULT 'local',
      server_id         TEXT
    );
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_contacts_estado ON contacts(estado) WHERE deleted_at IS NULL;`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at) WHERE deleted_at IS NULL;`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_contacts_ubigeo ON contacts(ubigeo) WHERE deleted_at IS NULL;`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_contacts_sync ON contacts(sync_status);`);
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
