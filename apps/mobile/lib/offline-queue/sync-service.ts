/**
 * Sync service - handles background synchronization.
 * 
 * Features:
 * - Network-aware (only syncs when online)
 * - Exponential backoff on failures
 * - Batch operations for efficiency
 * - Non-blocking (doesn't freeze UI)
 * - WebSocket transport preferred for location sync (lower latency)
 * - Graceful fallback to HTTP batch when WS unavailable
 * 
 * Sync strategy:
 * - Locations: WebSocket batch (preferred) or POST /api/agents/locations/batch (fallback)
 * - Forms: POST /api/forms (one by one with JWT auth)
 */

import * as Network from 'expo-network';

import { API_BASE, AGENT_INGEST_TOKEN } from '../api';
import {
  isConnected as wsIsConnected,
  sendLocationBatch as wsSendLocationBatch,
} from '../tracking/ws-transport';
import {
  getAccessToken,
  getActiveCampaignId,
  refreshTokens,
} from '../auth-store';



import {
  getPendingLocations,
  markAsSyncing,
  markAsSynced,
  markAsFailed,
  cleanupSyncedLocations,
  getLocationQueueStats,
  type PendingLocation,
} from './locations';

import {
  getPendingForms,
  markFormsAsSyncing,
  markFormsAsSynced,
  markFormsAsFailed,
  markFormsAsRejected,
  cleanupSyncedForms,
  getFormQueueStats,
  type PendingForm,
} from './forms';

// ─── Types ────────────────────────────────────────────────────

export interface SyncResult {
  locations: {
    synced: number;
    failed: number;
  };
  forms: {
    synced: number;
    failed: number;
  };
  duration_ms: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

// ─── State ────────────────────────────────────────────────────

let syncStatus: SyncStatus = 'idle';
let lastSyncResult: SyncResult | null = null;
let syncTimeoutId: ReturnType<typeof setTimeout> | null = null; // recursive setTimeout, not setInterval
let autoSyncRunning = false;

const SYNC_INTERVAL_MS = 30_000; // 30 seconds base interval
const MAX_BACKOFF_MS = 300_000; // 5 minutes max backoff
let currentBackoff = SYNC_INTERVAL_MS;

// ─── Network Check ────────────────────────────────────────────

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable === true;
  } catch {
    return false;
  }
}

// ─── Location Sync ────────────────────────────────────────────

/**
 * Try to sync locations via WebSocket (lower latency, already-open connection).
 * Returns true if WS was used successfully, false if caller should fallback to HTTP.
 */
async function trySyncLocationsViaWs(
  ids: number[],
  locations: Array<Record<string, unknown>>,
): Promise<boolean> {
  if (!wsIsConnected()) return false;

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      // WS ack didn't arrive in 10s — fall back to HTTP
      resolve(false);
    }, 10_000);

    const sent = wsSendLocationBatch(
      locations as Parameters<typeof wsSendLocationBatch>[0],
      async (accepted, deduped, failed) => {
        clearTimeout(timeout);
        // WS acknowledged — mark all as synced regardless of dedup/fail counts
        // (the backend already persisted or deduped them)
        await markAsSynced(ids);
        console.log(
          `[SyncService] WS batch sync: ${accepted} accepted, ${deduped} deduped, ${failed} failed`,
        );
        resolve(true);
      },
    );

    if (!sent) {
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

async function syncLocations(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingLocations(100); // Batch up to 100
  if (pending.length === 0) {
    return { synced: 0, failed: 0 };
  }

  const ids = pending.map((l) => l.id);
  await markAsSyncing(ids);

  // Build batch payload
  const locations = pending.map((location) => ({
    agent_id: location.agent_id,
    ts: location.ts,
    lat: location.lat,
    lng: location.lng,
    seq: location.seq,
    ...(location.agent_name ? { agent_name: location.agent_name } : {}),
    ...(location.accuracy != null ? { accuracy: location.accuracy } : {}),
    ...(location.speed != null ? { speed: location.speed } : {}),
    ...(location.heading != null ? { heading: location.heading } : {}),
    ...(location.battery != null ? { battery: location.battery } : {}),
    ...(location.campaign_id ? { campaign_id: location.campaign_id } : {}),
  }));

  // Try WebSocket first (lower latency)
  const wsOk = await trySyncLocationsViaWs(ids, locations);
  if (wsOk) {
    return { synced: pending.length, failed: 0 };
  }

  // Fallback to HTTP batch
  try {
    const response = await fetch(`${API_BASE}/agents/locations/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': AGENT_INGEST_TOKEN,
      },
      body: JSON.stringify({ locations }),
    });

    if (response.ok) {
      // Batch accepted - mark all as synced
      const result = await response.json() as { accepted: number; deduped: number; failed: number };
      await markAsSynced(ids);
      console.log(`[SyncService] HTTP batch sync: ${result.accepted} accepted, ${result.deduped} deduped, ${result.failed} failed`);
      return { synced: pending.length, failed: 0 };
    } else if (response.status === 401) {
      // Token invalid - mark as failed, don't retry
      await markAsFailed(ids, 'Invalid token (401)');
      return { synced: 0, failed: pending.length };
    } else {
      // Server error - will retry later
      const errorText = await response.text().catch(() => 'Unknown error');
      await markAsFailed(ids, `HTTP ${response.status}: ${errorText}`);
      return { synced: 0, failed: pending.length };
    }
  } catch (err) {
    // Network error - will retry later
    const message = err instanceof Error ? err.message : 'Network error';
    await markAsFailed(ids, message);
    return { synced: 0, failed: pending.length };
  }
}

// ─── Token Refresh (for sync service) ─────────────────────────
// Delegates to shared auth-store implementation (deduplication + timeout included).
//
// Returns the new access token string on 'ok', or null when refresh cannot
// succeed right now. On 'expired' the session is genuinely dead; on
// 'transient' (5xx/network/timeout) the session is preserved and the
// caller should just defer the sync to the next cycle.

async function tryRefreshToken(): Promise<string | null> {
  const result = await refreshTokens(API_BASE);
  if (result === 'ok') return getAccessToken();
  // 'expired' → session dead, caller marks forms as failed
  // 'transient' → network blip, caller will retry next cycle (session intact)
  return null;
}

// ─── Form Sync ────────────────────────────────────────────────

async function syncForms(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingForms(20);
  if (pending.length === 0) {
    return { synced: 0, failed: 0 };
  }

  const ids = pending.map((f) => f.id);
  await markFormsAsSyncing(ids);

  const token = await getAccessToken();
  if (!token) {
    // No auth, mark all as failed
    await markFormsAsFailed(ids, 'No auth token');
    return { synced: 0, failed: pending.length };
  }

  const campaignId = await getActiveCampaignId();

  let currentToken = token;
  let synced = 0;
  let failed = 0;

  // Sync one by one for now (batch endpoint may not exist yet)
  for (const form of pending) {
    try {
      const payload = JSON.parse(form.payload);
      
      // Add required fields
      const fullPayload = {
        ...payload,
        client_id: form.client_id,
        form_definition_id: form.form_definition_id,
        campaign_id: form.campaign_id,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
      };

      if (campaignId) {
        headers['x-campaign-id'] = campaignId;
      }

      let response = await fetch(`${API_BASE}/forms`, {
        method: 'POST',
        headers,
        body: JSON.stringify(fullPayload),
      });

      // Token expired → try refresh once and retry this form
      if (response.status === 401) {
        console.log('[SyncService] Got 401 on form sync, attempting token refresh...');
        const newToken = await tryRefreshToken();
        if (newToken) {
          currentToken = newToken;
          headers['Authorization'] = `Bearer ${currentToken}`;
          response = await fetch(`${API_BASE}/forms`, {
            method: 'POST',
            headers,
            body: JSON.stringify(fullPayload),
          });
          console.log(`[SyncService] Retry after refresh: ${response.status}`);
        } else {
          console.log('[SyncService] Token refresh failed, marking forms as failed');
          await markFormsAsFailed([form.id], 'Auth token expired and refresh failed');
          failed++;
          continue;
        }
      }

      if (response.ok || response.status === 202) {
        await markFormsAsSynced([form.id]);
        synced++;
      } else if (response.status === 409) {
        // 409 = duplicate phone or already exists
        // Parse the response to get the rejection reason for the agent
        let reason = 'Numero de telefono ya registrado en esta campana';
        try {
          const body = await response.json() as { code?: string; message?: string; duplicated_phones?: string[] };
          if (body.code === 'DUPLICATE_PHONE') {
            const phones = body.duplicated_phones?.join(', ') ?? '';
            reason = phones
              ? `Telefono duplicado: ${phones}`
              : (body.message ?? reason);
          }
        } catch {
          // Fallback to default reason
        }
        await markFormsAsRejected([form.id], reason);
        failed++;
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        await markFormsAsFailed([form.id], `HTTP ${response.status}: ${errorText}`);
        failed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      await markFormsAsFailed([form.id], message);
      failed++;
    }
  }

  return { synced, failed };
}

// ─── Main Sync Function ───────────────────────────────────────

export async function runSync(): Promise<SyncResult | null> {
  if (syncStatus === 'syncing') {
    return null; // Already syncing
  }

  const online = await isOnline();
  if (!online) {
    syncStatus = 'offline';
    return null;
  }

  syncStatus = 'syncing';
  const startTime = Date.now();

  try {
    const [locationResult, formResult] = await Promise.all([
      syncLocations(),
      syncForms(),
    ]);

    // Cleanup old synced records
    await cleanupSyncedLocations();
    await cleanupSyncedForms();

    const result: SyncResult = {
      locations: locationResult,
      forms: formResult,
      duration_ms: Date.now() - startTime,
    };

    lastSyncResult = result;
    syncStatus = 'idle';

    // Reset backoff on success
    if (locationResult.synced > 0 || formResult.synced > 0) {
      currentBackoff = SYNC_INTERVAL_MS;
    }

    return result;
  } catch (err) {
    syncStatus = 'error';
    
    // Exponential backoff on error
    currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF_MS);
    
    console.error('[SyncService] Error:', err);
    return null;
  }
}

// ─── Auto-sync Control ────────────────────────────────────────
// Uses recursive setTimeout instead of setInterval so the backoff
// value is actually respected between sync attempts.

function scheduleNextSync(): void {
  if (!autoSyncRunning) return;
  syncTimeoutId = setTimeout(async () => {
    await runSync();
    scheduleNextSync(); // Reschedule after completion using current backoff
  }, currentBackoff);
}

export function startAutoSync(): void {
  if (autoSyncRunning) return;
  autoSyncRunning = true;

  // Run immediately, then schedule
  runSync().then(() => {
    scheduleNextSync();
  });
}

export function stopAutoSync(): void {
  autoSyncRunning = false;
  if (syncTimeoutId) {
    clearTimeout(syncTimeoutId);
    syncTimeoutId = null;
  }
}

export function isAutoSyncRunning(): boolean {
  return autoSyncRunning;
}

// ─── Status Getters ───────────────────────────────────────────

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

export function getLastSyncResult(): SyncResult | null {
  return lastSyncResult;
}

export async function getQueueStats(): Promise<{
  locations: Awaited<ReturnType<typeof getLocationQueueStats>>;
  forms: Awaited<ReturnType<typeof getFormQueueStats>>;
}> {
  const [locations, forms] = await Promise.all([
    getLocationQueueStats(),
    getFormQueueStats(),
  ]);
  
  return { locations, forms };
}

// ─── Manual Trigger ───────────────────────────────────────────

export async function forceSyncNow(): Promise<SyncResult | null> {
  currentBackoff = SYNC_INTERVAL_MS; // Reset backoff
  return runSync();
}
