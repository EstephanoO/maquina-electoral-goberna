/**
 * Offline queue for GPS locations.
 * 
 * Flow:
 * 1. GPS captured → save to SQLite immediately
 * 2. Sync service picks up pending → POST to backend
 * 3. On success → mark as synced
 * 4. On failure → increment attempts, retry with backoff
 */

import { getDatabase } from './db';

export interface PendingLocation {
  id: number;
  agent_id: string;
  campaign_id: string | null;
  ts: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  seq: number;
  created_at: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  sync_attempts: number;
  last_error: string | null;
}

export interface LocationPayload {
  agent_id: string;
  campaign_id?: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
}

/**
 * Get the next sequence number (persisted across app restarts)
 */
export async function getNextSeq(): Promise<number> {
  const db = await getDatabase();
  
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = 'location_seq'"
  );
  
  const currentSeq = row ? parseInt(row.value, 10) : 0;
  const nextSeq = currentSeq + 1;
  
  await db.runAsync(
    "UPDATE sync_meta SET value = ?, updated_at = datetime('now') WHERE key = 'location_seq'",
    [nextSeq.toString()]
  );
  
  return nextSeq;
}

/**
 * Queue a location for sync. Returns immediately (non-blocking).
 */
export async function queueLocation(payload: LocationPayload): Promise<number> {
  const db = await getDatabase();
  const seq = await getNextSeq();
  
  const result = await db.runAsync(
    `INSERT INTO pending_locations 
     (agent_id, campaign_id, ts, lat, lng, accuracy, speed, heading, battery, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.agent_id,
      payload.campaign_id ?? null,
      payload.ts,
      payload.lat,
      payload.lng,
      payload.accuracy ?? null,
      payload.speed ?? null,
      payload.heading ?? null,
      payload.battery ?? null,
      seq,
    ]
  );
  
  return result.lastInsertRowId;
}

/**
 * Get pending locations for sync (oldest first, limit for batch)
 */
export async function getPendingLocations(limit = 50): Promise<PendingLocation[]> {
  const db = await getDatabase();
  
  const rows = await db.getAllAsync<PendingLocation>(
    `SELECT * FROM pending_locations 
     WHERE sync_status IN ('pending', 'failed') 
     AND sync_attempts < 5
     ORDER BY created_at ASC 
     LIMIT ?`,
    [limit]
  );
  
  return rows;
}

/**
 * Mark locations as syncing (lock for current batch)
 */
export async function markAsSyncing(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  
  await db.runAsync(
    `UPDATE pending_locations 
     SET sync_status = 'syncing' 
     WHERE id IN (${placeholders})`,
    ids
  );
}

/**
 * Mark locations as successfully synced
 */
export async function markAsSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  
  await db.runAsync(
    `UPDATE pending_locations 
     SET sync_status = 'synced' 
     WHERE id IN (${placeholders})`,
    ids
  );
}

/**
 * Mark locations as failed (will retry later)
 */
export async function markAsFailed(ids: number[], error: string): Promise<void> {
  if (ids.length === 0) return;
  
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  
  await db.runAsync(
    `UPDATE pending_locations 
     SET sync_status = 'failed', 
         sync_attempts = sync_attempts + 1,
         last_error = ?
     WHERE id IN (${placeholders})`,
    [error, ...ids]
  );
}

/**
 * Clean up old synced locations (keep last 24h for debugging)
 */
export async function cleanupSyncedLocations(): Promise<number> {
  const db = await getDatabase();
  
  const result = await db.runAsync(
    `DELETE FROM pending_locations 
     WHERE sync_status = 'synced' 
     AND created_at < datetime('now', '-1 day')`
  );
  
  return result.changes;
}

/**
 * Get queue stats for debugging
 */
export async function getLocationQueueStats(): Promise<{
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  total: number;
}> {
  const db = await getDatabase();
  
  const rows = await db.getAllAsync<{ sync_status: string; count: number }>(
    `SELECT sync_status, COUNT(*) as count 
     FROM pending_locations 
     GROUP BY sync_status`
  );
  
  const stats = {
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    total: 0,
  };
  
  for (const row of rows) {
    const status = row.sync_status as keyof typeof stats;
    if (status in stats) {
      stats[status] = row.count;
    }
    stats.total += row.count;
  }
  
  return stats;
}
