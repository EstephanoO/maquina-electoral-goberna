/**
 * Offline Queue - Main entry point
 * 
 * This module provides offline-first data persistence for:
 * - GPS locations (tracked continuously)
 * - Form submissions (user-triggered)
 * 
 * Data is stored in SQLite and synced to backend when online.
 * 
 * Usage:
 * 
 * ```typescript
 * import { 
 *   queueLocation, 
 *   queueForm, 
 *   startAutoSync,
 *   getQueueStats 
 * } from '@/lib/offline-queue';
 * 
 * // Queue a location (non-blocking)
 * await queueLocation({
 *   agent_id: 'user-123',
 *   ts: new Date().toISOString(),
 *   lat: -12.0464,
 *   lng: -77.0428,
 * });
 * 
 * // Queue a form (non-blocking)
 * await queueForm({
 *   client_id: 'uuid-v4',
 *   campaign_id: 'campaign-123',
 *   form_definition_id: 'form-def-456',
 *   data: { nombre: 'Juan', telefono: '999888777' },
 * });
 * 
 * // Start auto-sync (call once on app start)
 * startAutoSync();
 * ```
 */

// Database
export { getDatabase, closeDatabase } from './db';

// Locations
export {
  queueLocation,
  getPendingLocations,
  getLocationQueueStats,
  getNextSeq,
  type LocationPayload,
  type PendingLocation,
} from './locations';

// Forms
export {
  queueForm,
  getPendingForms,
  getFormQueueStats,
  getFormByClientId,
  getAllLocalForms,
  getLocalFormsByCampaign,
  type FormPayload,
  type PendingForm,
} from './forms';

// Sync service
export {
  runSync,
  startAutoSync,
  stopAutoSync,
  isAutoSyncRunning,
  getSyncStatus,
  getLastSyncResult,
  getQueueStats,
  forceSyncNow,
  type SyncResult,
  type SyncStatus,
} from './sync-service';
