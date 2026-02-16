/**
 * GPS Tracking module for Expo.
 *
 * Features:
 * - Foreground location tracking (auto-start on dashboard)
 * - Background location tracking (continues when app is backgrounded)
 * - Offline-first: saves to SQLite, syncs when online
 * - Sequence numbers for deduplication (persisted across restarts)
 * - Uses authenticated user ID as agent_id
 * 
 * Architecture:
 * - GPS captured → SQLite queue → Sync service → Backend
 * - Backend validates and dedupes on its side too (defense in depth)
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { queueLocation, startAutoSync, stopAutoSync } from '../offline-queue';
import { getActiveCampaignId } from '../auth-store';

// expo-battery is optional - may not be available in all environments
let Battery: { getBatteryLevelAsync: () => Promise<number> } | null = null;
try {
  // Dynamic import would be better but we use require for simplicity
  Battery = require('expo-battery');
} catch {
  // Battery API not available
}

// ─── Constants ────────────────────────────────────────────────

const BACKGROUND_LOCATION_TASK = 'GOBERNA_BACKGROUND_LOCATION';

const FOREGROUND_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 30_000, // 30 seconds
  distanceInterval: 10, // meters
};

const BACKGROUND_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced, // Less battery drain
  timeInterval: 60_000, // 1 minute (less frequent in background)
  distanceInterval: 50, // meters
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Goberna Tracking',
    notificationBody: 'Registrando ubicacion para la campana',
    notificationColor: '#1e40af',
  },
  // Android specific
  deferredUpdatesInterval: 60_000,
  deferredUpdatesDistance: 50,
};

// ─── State ────────────────────────────────────────────────────

export type TrackingState = 'stopped' | 'starting' | 'foreground' | 'background' | 'error';

let currentState: TrackingState = 'stopped';
let foregroundSubscription: Location.LocationSubscription | null = null;
let currentAgentId: string | null = null;

// ─── Background Task Definition ───────────────────────────────

// Define the background task (must be outside component lifecycle)
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundLocation] Task error:', error);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  
  for (const location of locations) {
    await processLocation(location);
  }
});

// ─── Location Processing ──────────────────────────────────────

async function processLocation(location: Location.LocationObject): Promise<void> {
  if (!currentAgentId) {
    // Try to get from persisted state for background mode
    // In background, we use the agent_id that was set when tracking started
    return;
  }

  const campaignId = await getActiveCampaignId();
  let batteryLevel: number | null = null;

  try {
    if (Battery) {
      batteryLevel = await Battery.getBatteryLevelAsync();
    }
  } catch {
    // Battery API may not be available
  }

  await queueLocation({
    agent_id: currentAgentId,
    campaign_id: campaignId ?? undefined,
    ts: new Date(location.timestamp).toISOString(),
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy ?? undefined,
    speed: location.coords.speed != null && location.coords.speed >= 0 
      ? location.coords.speed 
      : undefined,
    heading: location.coords.heading != null && 
             location.coords.heading >= 0 && 
             location.coords.heading < 360
      ? location.coords.heading
      : undefined,
    battery: batteryLevel != null ? Math.round(batteryLevel * 100) : undefined,
  });
}

// ─── Permission Helpers ───────────────────────────────────────

export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function requestBackgroundPermission(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === 'granted';
}

export async function checkPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  
  return {
    foreground: foreground.status === 'granted',
    background: background.status === 'granted',
  };
}

// ─── Foreground Tracking ──────────────────────────────────────

export async function startForegroundTracking(
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  if (currentState === 'foreground' && currentAgentId === agentId) {
    return { success: true };
  }

  // Stop any existing tracking
  await stopTracking();

  currentState = 'starting';
  currentAgentId = agentId;

  try {
    const hasForeground = await requestForegroundPermission();
    if (!hasForeground) {
      currentState = 'error';
      return { success: false, error: 'Permiso de ubicacion denegado' };
    }

    // Start watching position
    foregroundSubscription = await Location.watchPositionAsync(
      FOREGROUND_OPTIONS,
      async (location) => {
        await processLocation(location);
      }
    );

    // Start auto-sync service
    startAutoSync();

    currentState = 'foreground';
    return { success: true };
  } catch (err) {
    currentState = 'error';
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Background Tracking ──────────────────────────────────────

export async function startBackgroundTracking(
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  if (currentState === 'background' && currentAgentId === agentId) {
    return { success: true };
  }

  currentAgentId = agentId;

  try {
    // Request both permissions
    const hasForeground = await requestForegroundPermission();
    if (!hasForeground) {
      return { success: false, error: 'Permiso de ubicacion en primer plano denegado' };
    }

    const hasBackground = await requestBackgroundPermission();
    if (!hasBackground) {
      // Fall back to foreground only
      return startForegroundTracking(agentId);
    }

    // Check if task is already running
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) {
      currentState = 'background';
      return { success: true };
    }

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, BACKGROUND_OPTIONS);

    // Start auto-sync service
    startAutoSync();

    currentState = 'background';
    return { success: true };
  } catch (err) {
    currentState = 'error';
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Stop Tracking ────────────────────────────────────────────

export async function stopTracking(): Promise<void> {
  // Stop foreground subscription
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }

  // Stop background task
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch {
    // Task may not be registered
  }

  // Stop auto-sync
  stopAutoSync();

  currentAgentId = null;
  currentState = 'stopped';
}

// ─── Single Location ──────────────────────────────────────────

export async function sendSingleLocation(
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const hasPermission = await requestForegroundPermission();
    if (!hasPermission) {
      return { success: false, error: 'Permiso de ubicacion denegado' };
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
  try {
    const permissions = await checkPermissions();
    return permissions.background;
  } catch {
    return false;
  }
}

// ─── Legacy exports for backwards compatibility ───────────────

export const startTracking = startForegroundTracking;
