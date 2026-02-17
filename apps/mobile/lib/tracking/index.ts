/**
 * GPS Tracking module – STUB (location permissions removed)
 *
 * Location permissions have been temporarily removed to pass Google Play review.
 * This module preserves the full public API so the rest of the app compiles and
 * runs without changes, but all tracking operations are no-ops.
 *
 * TODO: Re-enable real tracking once Google Play approves the
 *       prominent disclosure flow and background location permission.
 *       The full implementation is preserved in git history.
 *
 * What still works:
 * - Auto-sync service (pending locations from SQLite still sync)
 * - Queue stats (hook still reads pending/synced counts)
 * - TrackingState API (always reports 'stopped')
 */

import { startAutoSync, stopAutoSync } from '../offline-queue';

// ─── Types (unchanged – consumers depend on these) ────────────

export type TrackingState = 'stopped' | 'starting' | 'foreground' | 'background' | 'error';

// ─── State ────────────────────────────────────────────────────

let currentState: TrackingState = 'stopped';
let currentAgentId: string | null = null;

// ─── Permission Helpers (always return false) ─────────────────

export async function requestForegroundPermission(): Promise<boolean> {
  return false;
}

export async function requestBackgroundPermission(): Promise<boolean> {
  return false;
}

export async function checkPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  return { foreground: false, background: false };
}

// ─── Permission Monitoring (no-op) ────────────────────────────

type PermissionChangeCallback = (permissions: { foreground: boolean; background: boolean }) => void;

export function onPermissionChange(_callback: PermissionChangeCallback): () => void {
  return () => {};
}

// ─── Tracking (no-op stubs) ───────────────────────────────────

export async function startForegroundTracking(
  agentId: string,
): Promise<{ success: boolean; error?: string }> {
  currentAgentId = agentId;
  currentState = 'stopped';
  // Still start sync so any queued locations from before get sent
  startAutoSync();
  console.log('[Tracking] GPS disabled – location permissions removed. Sync service started.');
  return { success: true };
}

export async function startBackgroundTracking(
  agentId: string,
): Promise<{ success: boolean; error?: string }> {
  // Delegate to foreground stub (same behaviour)
  return startForegroundTracking(agentId);
}

export async function stopTracking(): Promise<void> {
  stopAutoSync();
  currentAgentId = null;
  currentState = 'stopped';
}

export async function sendSingleLocation(
  _agentId: string,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'GPS desactivado temporalmente' };
}

// ─── Status Getters ───────────────────────────────────────────

export function getTrackingState(): TrackingState {
  return currentState;
}

export function getCurrentAgentId(): string | null {
  return currentAgentId;
}

export async function isBackgroundTrackingAvailable(): Promise<boolean> {
  return false;
}

// ─── Resume (no-op) ──────────────────────────────────────────

export async function resumeTrackingIfNeeded(): Promise<{
  resumed: boolean;
  state: TrackingState;
  agentId: string | null;
}> {
  return { resumed: false, state: 'stopped', agentId: null };
}

// ─── Legacy exports for backwards compatibility ───────────────

export const startTracking = startForegroundTracking;
