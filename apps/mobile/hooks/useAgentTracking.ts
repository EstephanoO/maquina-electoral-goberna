/**
 * Hook that manages GPS tracking with offline queue support.
 *
 * Apple 5.1.1 compliance:
 * - useEffect only CHECKS existing permission (getForegroundPermissionsAsync)
 * - The system dialog is NEVER triggered automatically on mount
 * - requestPermission() is exposed for the UI to call from a button tap
 * - Only after the user grants permission does startForegroundTracking run
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import { useAgent } from '@/lib/app-context';
import {
  startForegroundTracking,
  stopTracking,
  getTrackingState,
  checkForegroundPermission,
  requestForegroundPermission,
  type TrackingState,
} from '@/lib/tracking';
import {
  getSyncStatus,
  getQueueStats,
  forceSyncNow,
  type SyncStatus,
} from '@/lib/offline-queue';

export interface TrackingHookState {
  trackingState: TrackingState;
  trackingError: string | null;
  syncStatus: SyncStatus;
  pendingLocations: number;
  pendingForms: number;
  /** True when the user hasn't granted location permission yet */
  needsPermission: boolean;
}

export function useAgentTracking() {
  const agent = useAgent();
  const mountedRef = useRef(true);
  const agentIdRef = useRef(agent.id);

  // Keep agent ID ref updated without causing re-renders
  agentIdRef.current = agent.id;

  const [trackingState, setTrackingState] = useState<TrackingState>(getTrackingState);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus);
  const [pendingLocations, setPendingLocations] = useState(0);
  const [pendingForms, setPendingForms] = useState(0);
  const [needsPermission, setNeedsPermission] = useState(false);

  // Update stats - stable reference using ref
  const updateStats = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const stats = await getQueueStats();
      if (!mountedRef.current) return;

      const newSyncStatus = getSyncStatus();
      const newPendingLoc = stats.locations.pending + stats.locations.failed;
      const newPendingForms = stats.forms.pending + stats.forms.failed;

      // Only update state if values changed
      setSyncStatus((prev) => (prev !== newSyncStatus ? newSyncStatus : prev));
      setPendingLocations((prev) => (prev !== newPendingLoc ? newPendingLoc : prev));
      setPendingForms((prev) => (prev !== newPendingForms ? newPendingForms : prev));
    } catch {
      // Ignore errors in stats update
    }
  }, []);

  const startWithPermission = useCallback(async (agentId: string) => {
    try {
      const result = await startForegroundTracking(agentId);
      if (!mountedRef.current) return;

      const newState = getTrackingState();
      setTrackingState((prev) => (prev !== newState ? newState : prev));

      if (!result.success && result.error === 'location_permission_denied') {
        // startForegroundTracking does a check-only; if denied, surface it to UI
        setNeedsPermission(true);
        setTrackingError(null);
      } else {
        setNeedsPermission(false);
        setTrackingError(result.success ? null : (result.error ?? 'Error desconocido'));
      }
    } catch (err) {
      console.warn('[useAgentTracking] Failed to start tracking:', err);
      if (!mountedRef.current) return;
      setTrackingState('error');
      setTrackingError('GPS no disponible');
    }
  }, []);

  // On mount: CHECK permission only — never request.
  // Apple 5.1.1: the system dialog must come from a direct user action.
  useEffect(() => {
    mountedRef.current = true;
    let statsInterval: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      const hasPermission = await checkForegroundPermission();

      if (!mountedRef.current) return;

      if (!hasPermission) {
        // Permission not yet granted — surface the button to the UI.
        // Do NOT call requestForegroundPermissionsAsync() here.
        setNeedsPermission(true);
      } else {
        // Already granted — start tracking immediately.
        await startWithPermission(agentIdRef.current);
      }

      // Initial stats update
      await updateStats();

      // Update stats every 10 seconds
      statsInterval = setInterval(() => {
        updateStats();
      }, 10_000);
    };

    init();

    return () => {
      mountedRef.current = false;
      if (statsInterval) clearInterval(statsInterval);
      stopTracking().catch(() => {});
    };
  }, []); // Empty deps - only run on mount/unmount

  // Re-init tracking if agent ID changes (rare - campaign switch)
  useEffect(() => {
    if (!mountedRef.current) return;

    const currentState = getTrackingState();
    if (currentState === 'stopped' || currentState === 'error') return;

    // Agent changed while tracking — restart with new ID
    const reinit = async () => {
      await stopTracking();
      await startWithPermission(agent.id);
    };

    reinit();
  }, [agent.id, startWithPermission]);

  /**
   * Call this ONLY from a button onPress handler.
   * This is the only place in the app that triggers the iOS/Android system
   * permission dialog. Apple 5.1.1 requires it to come from a user tap.
   */
  const requestPermission = useCallback(async () => {
    const granted = await requestForegroundPermission();
    if (!mountedRef.current) return;

    if (granted) {
      setNeedsPermission(false);
      await startWithPermission(agentIdRef.current);
    }
    // If denied, needsPermission stays true — the UI can show a settings deeplink
  }, [startWithPermission]);

  // Force sync now
  const syncNow = useCallback(async () => {
    await forceSyncNow();
    await updateStats();
  }, [updateStats]);

  // Memoize return object to prevent unnecessary re-renders in consumers
  const state = useMemo(
    () => ({
      trackingState,
      trackingError,
      syncStatus,
      pendingLocations,
      pendingForms,
      needsPermission,
      canUseBackground: false, // Background disabled
    }),
    [trackingState, trackingError, syncStatus, pendingLocations, pendingForms, needsPermission]
  );

  return {
    ...state,
    enableBackgroundTracking: useCallback(async () => ({ success: false, error: 'Background deshabilitado' }), []),
    syncNow,
    refreshStats: updateStats,
    requestPermission,
  };
}
