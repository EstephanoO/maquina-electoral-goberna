/**
 * Manual Jest mock for expo-sqlite.
 *
 * Uses better-sqlite3 (synchronous, in-memory) to run real SQL in Jest/Node,
 * so that db.ts tests exercise actual CREATE TABLE / PRAGMA statements
 * without needing a native Expo environment.
 *
 * API surface mirrors the methods used by lib/offline-queue/db.ts:
 *   openDatabaseAsync, execAsync, runAsync, getAllAsync, closeAsync
 */

const Database = require('better-sqlite3');

class MockSQLiteDatabase {
  constructor() {
    // In-memory database — isolated per test via closeDatabase() / new open
    this._db = new Database(':memory:');
  }

  async execAsync(source) {
    this._db.exec(source);
  }

  async runAsync(source, ...params) {
    const flat = Array.isArray(params[0]) ? params[0] : params;
    const stmt = this._db.prepare(source);
    const info = flat.length > 0 ? stmt.run(...flat) : stmt.run();
    return { lastInsertRowId: info.lastInsertRowid, changes: info.changes };
  }

  async getAllAsync(source, ...params) {
    const flat = Array.isArray(params[0]) ? params[0] : params;
    const stmt = this._db.prepare(source);
    return flat.length > 0 ? stmt.all(...flat) : stmt.all();
  }

  async getFirstAsync(source, ...params) {
    const flat = Array.isArray(params[0]) ? params[0] : params;
    const stmt = this._db.prepare(source);
    const row = flat.length > 0 ? stmt.get(...flat) : stmt.get();
    return row ?? null;
  }

  async closeAsync() {
    this._db.close();
  }
}

async function openDatabaseAsync(_name, _options) {
  return new MockSQLiteDatabase();
}

module.exports = { openDatabaseAsync };
