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
 *
 * Note: Background tracking disabled to comply with Google Play policies.
 * GPS is only captured when the app is in foreground.
 */

import * as Location from 'expo-location';

import { queueLocation, startAutoSync, stopAutoSync } from '../offline-queue';
import { getActiveCampaignId } from '../auth-store';

// Optional battery API
let Battery: { getBatteryLevelAsync: () => Promise<number> } | null = null;
try {
  Battery = require('expo-battery');
} catch {
  // Battery API not available
}

// ─── Constants ────────────────────────────────────────────────

const FOREGROUND_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 30_000, // 30 seconds
  distanceInterval: 10, // 10 meters minimum movement
};

// ─── Types ────────────────────────────────────────────────────

export type TrackingState = 'stopped' | 'starting' | 'foreground' | 'background' | 'error';

type PermissionChangeCallback = (permissions: { foreground: boolean; background: boolean }) => void;

// ─── State ────────────────────────────────────────────────────

let currentState: TrackingState = 'stopped';
let foregroundSubscription: Location.LocationSubscription | null = null;
let currentAgentId: string | null = null;
let permissionCallbacks: PermissionChangeCallback[] = [];

// ─── Location Processing ──────────────────────────────────────

async function processLocation(location: Location.LocationObject): Promise<void> {
  if (!currentAgentId) {
    console.log('[Tracking] No agent ID set, skipping location');
    return;
  }

  const campaignId = await getActiveCampaignId();
  let batteryLevel: number | null = null;

  try {
    if (Battery) {
      batteryLevel = await Battery.getBatteryLevelAsync();
    }
  } catch {
    // Battery API may fail silently
  }

  await queueLocation({
    agent_id: currentAgentId,
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
  });

  console.log(
    `[Tracking] Location queued: ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`
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

    // Start auto-sync service (syncs queued locations to backend)
    startAutoSync();

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

  // Note: We keep auto-sync running to flush any pending locations
  // It will be stopped when app terminates or user logs out

  currentAgentId = null;
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
    currentAgentId = agentId;

    await processLocation(location);

    currentAgentId = prevAgentId;
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

// ─── Legacy exports for backwards compatibility ───────────────

export const startTracking = startForegroundTracking;
