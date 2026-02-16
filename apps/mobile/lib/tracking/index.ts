/**
 * GPS Tracking module for Expo.
 *
 * Sends location updates to backend via POST /api/agents/location
 * Uses x-agent-token header (static token, NOT JWT).
 *
 * Features:
 * - Foreground location tracking (auto-start on dashboard)
 * - Sequence numbers for deduplication
 * - Uses authenticated user ID as agent_id
 * - Includes ISO timestamp for backend contract compliance
 */

import * as Location from 'expo-location';

import { sendLocation, AGENT_INGEST_TOKEN } from '../api';
import { getActiveCampaignId } from '../auth-store';

const TRACKING_INTERVAL_MS = 30_000; // 30 seconds
const LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: TRACKING_INTERVAL_MS,
  distanceInterval: 10, // meters
};

// ─── State ────────────────────────────────────────────────────

export type TrackingState = 'stopped' | 'starting' | 'tracking' | 'error';

let currentState: TrackingState = 'stopped';
let sequenceNumber = 0;
let activeSubscription: Location.LocationSubscription | null = null;
let currentAgentId: string | null = null;

// ─── Location Sending ─────────────────────────────────────────

async function sendLocationUpdate(location: Location.LocationObject): Promise<boolean> {
  if (!currentAgentId) return false;

  const campaignId = await getActiveCampaignId();

  const payload = {
    agent_id: currentAgentId,
    ts: new Date(location.timestamp).toISOString(),
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    seq: sequenceNumber++,
    ...(location.coords.accuracy != null ? { accuracy: location.coords.accuracy } : {}),
    ...(location.coords.speed != null && location.coords.speed >= 0
      ? { speed: location.coords.speed }
      : {}),
    ...(location.coords.heading != null &&
    location.coords.heading >= 0 &&
    location.coords.heading < 360
      ? { heading: location.coords.heading }
      : {}),
    ...(campaignId ? { campaign_id: campaignId } : {}),
  };

  try {
    const result = await sendLocation(payload);
    return result.ok;
  } catch {
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────

export function getTrackingState(): TrackingState {
  return currentState;
}

/**
 * Start foreground GPS tracking.
 * @param agentId - The authenticated user's ID (from AppConfig.agent.id)
 */
export async function startTracking(agentId: string): Promise<{ success: boolean; error?: string }> {
  if (currentState === 'tracking' && currentAgentId === agentId) {
    return { success: true };
  }

  // If tracking with a different agent, stop first
  if (currentState === 'tracking') {
    await stopTracking();
  }

  currentState = 'starting';
  currentAgentId = agentId;

  try {
    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      currentState = 'error';
      return { success: false, error: 'Permiso de ubicacion denegado' };
    }

    // Start watching position
    activeSubscription = await Location.watchPositionAsync(
      LOCATION_OPTIONS,
      async (location) => {
        await sendLocationUpdate(location);
      },
    );

    currentState = 'tracking';
    return { success: true };
  } catch (err) {
    currentState = 'error';
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

export async function stopTracking(): Promise<void> {
  if (activeSubscription) {
    activeSubscription.remove();
    activeSubscription = null;
  }
  currentAgentId = null;
  currentState = 'stopped';
}

export async function sendSingleLocation(agentId: string): Promise<{ success: boolean; error?: string }> {
  const prevAgentId = currentAgentId;
  currentAgentId = agentId;

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      currentAgentId = prevAgentId;
      return { success: false, error: 'Permiso de ubicacion denegado' };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const success = await sendLocationUpdate(location);
    currentAgentId = prevAgentId;
    return { success };
  } catch (err) {
    currentAgentId = prevAgentId;
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return { success: false, error: message };
  }
}

// ─── Helper to get agent token for other uses ─────────────────

export function getAgentToken(): string {
  return AGENT_INGEST_TOKEN;
}
