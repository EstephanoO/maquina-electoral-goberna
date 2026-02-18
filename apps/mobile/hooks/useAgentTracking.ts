/**
 * Hook that manages GPS tracking with offline queue support.
 *
 * Features:
 * - Auto-starts foreground tracking on mount
 * - Shows sync status and queue stats
 * - Stops tracking on unmount
 * - Optimized to avoid unnecessary re-renders
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import { useAgent } from '@/lib/app-context';
import {
  startForegroundTracking,
  stopTracking,
  getTrackingState,
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

  // Start tracking - runs once on mount
  useEffect(() => {
    mountedRef.current = true;
    let statsInterval: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      try {
        const result = await startForegroundTracking(agentIdRef.current);
        if (!mountedRef.current) return;

        const newState = getTrackingState();
        setTrackingState((prev) => (prev !== newState ? newState : prev));
        setTrackingError(result.success ? null : (result.error ?? 'Error desconocido'));
      } catch (err) {
        console.warn('[useAgentTracking] Failed to start tracking:', err);
        if (!mountedRef.current) return;
        setTrackingState('error');
        setTrackingError('GPS no disponible');
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

    // Skip first render
    const currentState = getTrackingState();
    if (currentState === 'stopped' || currentState === 'error') return;

    // Agent changed while tracking - restart with new ID
    const reinit = async () => {
      await stopTracking();
      const result = await startForegroundTracking(agent.id);
      if (!mountedRef.current) return;

      const newState = getTrackingState();
      setTrackingState((prev) => (prev !== newState ? newState : prev));
      setTrackingError(result.success ? null : (result.error ?? 'Error desconocido'));
    };

    reinit();
  }, [agent.id]);

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
      canUseBackground: false, // Background disabled
    }),
    [trackingState, trackingError, syncStatus, pendingLocations, pendingForms]
  );

  return {
    ...state,
    enableBackgroundTracking: useCallback(async () => ({ success: false, error: 'Background deshabilitado' }), []),
    syncNow,
    refreshStats: updateStats,
  };
}
