/**
 * GPS Tracking module - Foreground Only
 *
 * Tracks agent location while the app is open and visible.
 * Locations are queued in SQLite and synced to backend when online.
 *
 * Features:
 * - Foreground location tracking (30s interval, high accuracy)
 * - Offline-first: saves to SQLite queue, syncs when online
 * - Battery level included when available
 * - Automatic permission handling
 * - WebSocket transport for low-latency delivery (fallback: HTTP batch)
 * - AppState listener: restarts GPS when app returns to foreground
 *
 * Note: Background tracking disabled to comply with Google Play policies.
 * GPS is only captured when the app is in foreground.
 */

import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';

import { queueLocation, startAutoSync, stopAutoSync, forceSyncNow } from '../offline-queue';
import { getAccessToken, getActiveCampaignId, getStoredUser } from '../auth-store';
import { API_BASE } from '../api';
import {
  connect as wsConnect,
  disconnect as wsDisconnect,
  sendLocation as wsSendLocation,
  isConnected as wsIsConnected,
  getState as wsGetState,
  type LocationPayload,
  type WsTransportState,
} from './ws-transport';

// Optional battery API
let Battery: { getBatteryLevelAsync: () => Promise<number> } | null = null;
try {
  Battery = require('expo-battery');
} catch {
  // Battery API not available
}

// ─── Constants ────────────────────────────────────────────────

// Mutable so the server can push config changes via WebSocket (M5)
const FOREGROUND_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High, // Good accuracy without the battery cost of BestForNavigation
  timeInterval: 15_000, // 15 seconds (Android only; iOS ignores this)
  distanceInterval: 5,  // 5 meters — more responsive to movement
};

// ─── Types ────────────────────────────────────────────────────

export type TrackingState = 'stopped' | 'starting' | 'foreground' | 'background' | 'error';

type PermissionChangeCallback = (permissions: { foreground: boolean; background: boolean }) => void;

// ─── State ────────────────────────────────────────────────────

let currentState: TrackingState = 'stopped';
let foregroundSubscription: Location.LocationSubscription | null = null;
let currentAgentId: string | null = null;
let currentAgentName: string | null = null;
let permissionCallbacks: PermissionChangeCallback[] = [];
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ─── AppState Listener ────────────────────────────────────────
// Restarts GPS watch when app returns to foreground (OS kills it on background)

// Pre-cached campaign ID so we don't need an async SecureStore read
// in the critical background path (OS may kill the app mid-promise).
let cachedCampaignId: string | null = null;

/**
 * Send agent status via HTTP POST.
 * Uses JWT Bearer auth (same as all tracking endpoints).
 * Timeout of 5s to not waste the background execution window.
 */
function sendStatusHttp(agentId: string, status: 'background' | 'foreground'): void {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  getAccessToken()
    .then((token) => {
      if (!token) return; // No JWT, best-effort skip
      return fetch(`${API_BASE}/agents/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          agent_name: currentAgentName ?? undefined,
          status,
          campaign_id: cachedCampaignId ?? undefined,
        }),
        signal: controller.signal,
      });
    })
    .catch(() => { /* best-effort */ })
    .finally(() => clearTimeout(timeoutId));
}

// Track previous AppState to avoid false positives.
// iOS fires 'inactive' for Control Center / notifications — that's not a real background.
let previousAppState: AppStateStatus = AppState.currentState;

function handleAppStateChange(nextAppState: AppStateStatus): void {
  const prev = previousAppState;
  previousAppState = nextAppState;

  // ── RETURNING TO FOREGROUND ──
  // Lightweight resume: only restart GPS subscription + WS.
  // Do NOT call startForegroundTracking (which does a full stop→start cycle
  // and kills the WS before it can connect on rapid transitions).
  if (nextAppState === 'active' && currentAgentId) {
    if (prev === 'background') {
      console.log('[Tracking] Resuming from background (lightweight)');
      sendStatusHttp(currentAgentId, 'foreground');
    }

    // Restart GPS subscription — OS may have killed it while in background.
    if (foregroundSubscription) {
      foregroundSubscription.remove();
      foregroundSubscription = null;
    }
    Location.watchPositionAsync(FOREGROUND_OPTIONS, async (location) => {
      await processLocation(location);
    }).then((sub) => {
      foregroundSubscription = sub;
      console.log('[Tracking] GPS subscription resumed');
    }).catch((err) => {
      console.warn('[Tracking] Failed to resume GPS:', err);
    });

    // Reconnect WS if it was closed (background disconnect or network loss).
    // wsConnect() is a no-op if already connected/connecting.
    wsConnect();

    // Restart auto-sync in case the OS killed the timer.
    startAutoSync();

    currentState = 'foreground';
  }

  // ── GOING TO BACKGROUND ──
  // Only close WS so the backend immediately marks the agent as offline.
  // Don't touch GPS, sync, or appState listener — the OS handles cleanup,
  // and touching them causes race conditions on rapid transitions.
  if (nextAppState === 'background' && currentAgentId) {
    console.log('[Tracking] App going to background, closing WS');
    sendStatusHttp(currentAgentId, 'background');
    wsDisconnect();
  }
}

// ─── Location Processing ──────────────────────────────────────

// ─── Battery Cache ────────────────────────────────────────────────
// Battery level changes slowly — cache for 60s to avoid per-location async calls.
let cachedBatteryLevel: number | null = null;
let batteryLevelCachedAtMs = 0;
const BATTERY_CACHE_TTL_MS = 60_000;

async function getCachedBatteryLevel(): Promise<number | null> {
  if (!Battery) return null;
  const now = Date.now();
  if (cachedBatteryLevel != null && now - batteryLevelCachedAtMs < BATTERY_CACHE_TTL_MS) {
    return cachedBatteryLevel;
  }
  try {
    cachedBatteryLevel = await Battery.getBatteryLevelAsync();
    batteryLevelCachedAtMs = now;
  } catch {
    // Battery API may fail silently
  }
  return cachedBatteryLevel;
}

async function processLocation(location: Location.LocationObject): Promise<void> {
  if (!currentAgentId) {
    console.log('[Tracking] No agent ID set, skipping location');
    return;
  }

  // Use pre-cached campaign ID (set at tracking start, avoids SecureStore read per location)
  const campaignId = cachedCampaignId;
  const batteryLevel = await getCachedBatteryLevel();

  const payload: LocationPayload & { agent_id: string } = {
    agent_id: currentAgentId,
    agent_name: currentAgentName ?? undefined,
    campaign_id: campaignId ?? undefined,
    ts: new Date(location.timestamp).toISOString(),
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy ?? undefined,
    speed:
      location.coords.speed != null && location.coords.speed >= 0
        ? location.coords.speed
        : undefined,
    heading:
      location.coords.heading != null &&
      location.coords.heading >= 0 &&
      location.coords.heading < 360
        ? location.coords.heading
        : undefined,
    battery: batteryLevel != null ? Math.round(batteryLevel * 100) : undefined,
    seq: 0, // Will be set by queueLocation with actual seq
  };

  // Always queue to SQLite (offline-first guarantee)
  const queuedSeq = await queueLocation(payload);

  // Also send via WebSocket for real-time delivery (best-effort, fire-and-forget)
  // The SQLite queue + sync-service is the durable path; WS is the fast path.
  if (wsIsConnected() && queuedSeq != null) {
    wsSendLocation({ ...payload, seq: queuedSeq });
  }

  console.log(
    `[Tracking] Location queued (seq=${queuedSeq ?? '?'}): ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)} [ws=${wsIsConnected() ? 'on' : 'off'}]`
  );
}

// ─── Permission Helpers ───────────────────────────────────────

export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  const granted = status === 'granted';
  notifyPermissionChange();
  return granted;
}

export async function requestBackgroundPermission(): Promise<boolean> {
  // Background permission disabled for Google Play compliance
  return false;
}

export async function checkPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const foreground = await Location.getForegroundPermissionsAsync();
  return {
    foreground: foreground.status === 'granted',
    background: false, // Always false - background disabled
  };
}

// ─── Permission Monitoring ────────────────────────────────────

function notifyPermissionChange() {
  checkPermissions().then((perms) => {
    for (const cb of permissionCallbacks) {
      cb(perms);
    }
  });
}

export function onPermissionChange(callback: PermissionChangeCallback): () => void {
  permissionCallbacks.push(callback);
  return () => {
    permissionCallbacks = permissionCallbacks.filter((cb) => cb !== callback);
  };
}

// ─── Foreground Tracking ──────────────────────────────────────

export async function startForegroundTracking(
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  // Already tracking this agent
  if (currentState === 'foreground' && currentAgentId === agentId) {
    console.log('[Tracking] Already tracking agent:', agentId);
    return { success: true };
  }

  // Stop any existing tracking first
  await stopTracking();

  currentState = 'starting';
  currentAgentId = agentId;

  // Fetch agent name from stored user profile (best-effort, non-blocking)
  try {
    const user = await getStoredUser();
    currentAgentName = user?.full_name ?? null;
  } catch {
    currentAgentName = null;
  }

  // Pre-cache campaign ID for sendStatusHttp — avoids async SecureStore reads
  // during the critical background transition window (iOS gives ~5s)
  try {
    cachedCampaignId = await getActiveCampaignId();
  } catch {
    cachedCampaignId = null;
  }

  try {
    const hasForeground = await requestForegroundPermission();
    if (!hasForeground) {
      currentState = 'error';
      return { success: false, error: 'Permiso de ubicación denegado' };
    }

    // Get initial location immediately
    try {
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await processLocation(initialLocation);
    } catch (err) {
      console.warn('[Tracking] Failed to get initial location:', err);
      // Continue anyway - subscription will get locations
    }

    // Start watching position
    foregroundSubscription = await Location.watchPositionAsync(
      FOREGROUND_OPTIONS,
      async (location) => {
        await processLocation(location);
      }
    );

    // Start auto-sync service (syncs queued locations to backend via HTTP batch)
    startAutoSync();

    // Connect WebSocket for real-time delivery (non-blocking, best-effort)
    // Wire server config callback to dynamically update GPS watcher options
    wsConnect({
      onConfig: (config) => {
        console.log('[Tracking] Server config received:', config);
        // Apply server-pushed GPS configuration changes.
        // If interval or distance changed, restart the watcher with new options.
        let changed = false;
        if (config.interval_ms != null && config.interval_ms !== FOREGROUND_OPTIONS.timeInterval) {
          FOREGROUND_OPTIONS.timeInterval = config.interval_ms;
          changed = true;
        }
        if (config.distance_m != null && config.distance_m !== FOREGROUND_OPTIONS.distanceInterval) {
          FOREGROUND_OPTIONS.distanceInterval = config.distance_m;
          changed = true;
        }
        // Restart GPS watcher with new config if it changed and we're actively tracking
        if (changed && foregroundSubscription && currentAgentId) {
          foregroundSubscription.remove();
          foregroundSubscription = null;
          Location.watchPositionAsync(FOREGROUND_OPTIONS, async (location) => {
            await processLocation(location);
          }).then((sub) => {
            foregroundSubscription = sub;
            console.log('[Tracking] GPS watcher restarted with server config');
          }).catch((err) => {
            console.warn('[Tracking] Failed to restart GPS with server config:', err);
          });
        }
      },
    });

    // Listen for app state changes (foreground/background)
    if (!appStateSubscription) {
      appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    }

    currentState = 'foreground';
    console.log('[Tracking] Foreground tracking started for agent:', agentId);
    return { success: true };
  } catch (err) {
    currentState = 'error';
    currentAgentId = null;
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[Tracking] Failed to start:', message);
    return { success: false, error: message };
  }
}

// ─── Background Tracking (disabled) ───────────────────────────

export async function startBackgroundTracking(
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  // Background tracking disabled - fall back to foreground
  console.log('[Tracking] Background tracking disabled, using foreground only');
  return startForegroundTracking(agentId);
}

// ─── Stop Tracking ────────────────────────────────────────────

export async function stopTracking(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }

  // Disconnect WebSocket
  wsDisconnect();

  // Remove AppState listener
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  // Trigger one last sync to flush any pending locations, then stop the interval.
  // forceSyncNow is best-effort — if offline, items stay in SQLite for next session.
  forceSyncNow().catch(() => { /* best-effort */ });
  stopAutoSync();

  currentAgentId = null;
  currentAgentName = null;
  cachedCampaignId = null;
  currentState = 'stopped';
  console.log('[Tracking] Tracking stopped');
}

// ─── Single Location (manual trigger) ─────────────────────────

export async function sendSingleLocation(
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const hasPermission = await requestForegroundPermission();
    if (!hasPermission) {
      return { success: false, error: 'Permiso de ubicación denegado' };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const prevAgentId = currentAgentId;
    const prevAgentName = currentAgentName;
    currentAgentId = agentId;

    // Ensure agent name is set for the location payload
    if (!currentAgentName) {
      try {
        const user = await getStoredUser();
        currentAgentName = user?.full_name ?? null;
      } catch { /* best-effort */ }
    }

    await processLocation(location);

    currentAgentId = prevAgentId;
    currentAgentName = prevAgentName;
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Status Getters ───────────────────────────────────────────

export function getTrackingState(): TrackingState {
  return currentState;
}

export function getCurrentAgentId(): string | null {
  return currentAgentId;
}

export async function isBackgroundTrackingAvailable(): Promise<boolean> {
  // Background tracking disabled for Google Play compliance
  return false;
}

// ─── Resume tracking if was active ────────────────────────────

export async function resumeTrackingIfNeeded(): Promise<{
  resumed: boolean;
  state: TrackingState;
  agentId: string | null;
}> {
  // If we have an agent ID but tracking stopped (e.g., after app resume),
  // restart tracking automatically
  if (currentAgentId && currentState === 'stopped') {
    const result = await startForegroundTracking(currentAgentId);
    return {
      resumed: result.success,
      state: currentState,
      agentId: currentAgentId,
    };
  }

  return {
    resumed: false,
    state: currentState,
    agentId: currentAgentId,
  };
}

// ─── WebSocket Transport Status ───────────────────────────────

export function getWsTransportState(): WsTransportState {
  return wsGetState();
}

export function isWsConnected(): boolean {
  return wsIsConnected();
}

// ─── Legacy exports for backwards compatibility ───────────────

export const startTracking = startForegroundTracking;
