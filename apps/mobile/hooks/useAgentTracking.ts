/**
 * Hook that manages GPS tracking with offline queue support.
 * 
 * Features:
 * - Auto-starts foreground tracking on mount
 * - Can upgrade to background tracking if permissions granted
 * - Shows sync status and queue stats
 * - Stops tracking on unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react';

import { useAgent } from '@/lib/app-context';
import {
  startForegroundTracking,
  startBackgroundTracking,
  stopTracking,
  getTrackingState,
  isBackgroundTrackingAvailable,
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
  canUseBackground: boolean;
}

export function useAgentTracking() {
  const agent = useAgent();
  const mountedRef = useRef(true);
  
  const [state, setState] = useState<TrackingHookState>({
    trackingState: getTrackingState(),
    trackingError: null,
    syncStatus: getSyncStatus(),
    pendingLocations: 0,
    pendingForms: 0,
    canUseBackground: false,
  });

  // Update stats periodically
  const updateStats = useCallback(async () => {
    if (!mountedRef.current) return;
    
    try {
      const stats = await getQueueStats();
      const canBackground = await isBackgroundTrackingAvailable();
      
      if (!mountedRef.current) return;
      
      setState((prev) => ({
        ...prev,
        syncStatus: getSyncStatus(),
        pendingLocations: stats.locations.pending + stats.locations.failed,
        pendingForms: stats.forms.pending + stats.forms.failed,
        canUseBackground: canBackground,
      }));
    } catch {
      // Ignore errors in stats update
    }
  }, []);

  // Start tracking
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      // Start foreground tracking by default
      const result = await startForegroundTracking(agent.id);
      
      if (!mountedRef.current) return;

      setState((prev) => ({
        ...prev,
        trackingState: getTrackingState(),
        trackingError: result.success ? null : (result.error ?? 'Error desconocido'),
      }));

      // Initial stats update
      await updateStats();
    })();

    // Update stats every 10 seconds
    const statsInterval = setInterval(updateStats, 10_000);

    return () => {
      mountedRef.current = false;
      clearInterval(statsInterval);
      void stopTracking();
    };
  }, [agent.id, updateStats]);

  // Enable background tracking
  const enableBackgroundTracking = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    const result = await startBackgroundTracking(agent.id);
    
    if (mountedRef.current) {
      setState((prev) => ({
        ...prev,
        trackingState: getTrackingState(),
        trackingError: result.success ? null : (result.error ?? 'Error desconocido'),
      }));
    }
    
    return result;
  }, [agent.id]);

  // Force sync now
  const syncNow = useCallback(async () => {
    await forceSyncNow();
    await updateStats();
  }, [updateStats]);

  return {
    ...state,
    enableBackgroundTracking,
    syncNow,
    refreshStats: updateStats,
  };
}
