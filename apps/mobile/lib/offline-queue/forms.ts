/**
 * Offline queue for form submissions.
 * 
 * Flow:
 * 1. User submits form → save to SQLite immediately
 * 2. Sync service picks up pending → POST /api/forms/batch
 * 3. On success → mark as synced
 * 4. On failure → increment attempts, retry with backoff
 * 
 * client_id ensures idempotency (deduped server-side)
 */

import { getDatabase } from './db';

export interface PendingForm {
  id: number;
  client_id: string;
  campaign_id: string;
  form_definition_id: string;
  payload: string; // JSON stringified
  created_at: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  sync_attempts: number;
  last_error: string | null;
}

export interface FormPayload {
  client_id: string;
  campaign_id: string;
  form_definition_id: string;
  data: Record<string, unknown>;
  // Add GPS coordinates
  lat?: number;
  lng?: number;
  accuracy?: number;
}

/**
 * Queue a form submission. Returns immediately (non-blocking).
 * Uses client_id for deduplication.
 */
export async function queueForm(payload: FormPayload): Promise<number> {
  const db = await getDatabase();
  
  // Check if already exists (idempotency)
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM pending_forms WHERE client_id = ?',
    [payload.client_id]
  );
  
  if (existing) {
    return existing.id;
  }
  
  const result = await db.runAsync(
    `INSERT INTO pending_forms 
     (client_id, campaign_id, form_definition_id, payload)
     VALUES (?, ?, ?, ?)`,
    [
      payload.client_id,
      payload.campaign_id,
      payload.form_definition_id,
      JSON.stringify(payload.data),
    ]
  );
  
  return result.lastInsertRowId;
}

/**
 * Get pending forms for sync (oldest first, limit for batch)
 */
export async function getPendingForms(limit = 20): Promise<PendingForm[]> {
  const db = await getDatabase();
  
  const rows = await db.getAllAsync<PendingForm>(
    `SELECT * FROM pending_forms 
     WHERE sync_status IN ('pending', 'failed') 
     AND sync_attempts < 5
     ORDER BY created_at ASC 
     LIMIT ?`,
    [limit]
  );
  
  return rows;
}

/**
 * Mark forms as syncing (lock for current batch)
 */
export async function markFormsAsSyncing(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  
  await db.runAsync(
    `UPDATE pending_forms 
     SET sync_status = 'syncing' 
     WHERE id IN (${placeholders})`,
    ids
  );
}

/**
 * Mark forms as successfully synced
 */
export async function markFormsAsSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  
  await db.runAsync(
    `UPDATE pending_forms 
     SET sync_status = 'synced' 
     WHERE id IN (${placeholders})`,
    ids
  );
}

/**
 * Mark forms as failed (will retry later)
 */
export async function markFormsAsFailed(ids: number[], error: string): Promise<void> {
  if (ids.length === 0) return;
  
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  
  await db.runAsync(
    `UPDATE pending_forms 
     SET sync_status = 'failed', 
         sync_attempts = sync_attempts + 1,
         last_error = ?
     WHERE id IN (${placeholders})`,
    [error, ...ids]
  );
}

/**
 * Clean up old synced forms (keep last 7 days for auditing)
 */
export async function cleanupSyncedForms(): Promise<number> {
  const db = await getDatabase();
  
  const result = await db.runAsync(
    `DELETE FROM pending_forms 
     WHERE sync_status = 'synced' 
     AND created_at < datetime('now', '-7 day')`
  );
  
  return result.changes;
}

/**
 * Get queue stats for debugging
 */
export async function getFormQueueStats(): Promise<{
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  total: number;
}> {
  const db = await getDatabase();
  
  const rows = await db.getAllAsync<{ sync_status: string; count: number }>(
    `SELECT sync_status, COUNT(*) as count 
     FROM pending_forms 
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

/**
 * Get a specific form by client_id
 */
export async function getFormByClientId(clientId: string): Promise<PendingForm | null> {
  const db = await getDatabase();
  
  const row = await db.getFirstAsync<PendingForm>(
    'SELECT * FROM pending_forms WHERE client_id = ?',
    [clientId]
  );
  
  return row ?? null;
}

/**
 * Get all local forms (for display in dashboard)
 * Returns most recent first, includes both pending and synced
 */
export async function getAllLocalForms(limit = 50): Promise<PendingForm[]> {
  const db = await getDatabase();
  
  const rows = await db.getAllAsync<PendingForm>(
    `SELECT * FROM pending_forms 
     ORDER BY created_at DESC 
     LIMIT ?`,
    [limit]
  );
  
  return rows;
}

/**
 * Get local forms for a specific campaign
 */
export async function getLocalFormsByCampaign(campaignId: string, limit = 50): Promise<PendingForm[]> {
  const db = await getDatabase();
  
  const rows = await db.getAllAsync<PendingForm>(
    `SELECT * FROM pending_forms 
     WHERE campaign_id = ?
     ORDER BY created_at DESC 
     LIMIT ?`,
    [campaignId, limit]
  );
  
  return rows;
}
