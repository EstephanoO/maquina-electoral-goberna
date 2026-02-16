/**
 * Hook that auto-starts GPS tracking when the component mounts.
 * Uses the authenticated user's ID as agent_id.
 * Stops tracking on unmount.
 */

import { useEffect, useRef, useState } from 'react';

import { useAgent } from '@/lib/app-context';
import {
  startTracking,
  stopTracking,
  getTrackingState,
  type TrackingState,
} from '@/lib/tracking';

export function useAgentTracking() {
  const agent = useAgent();
  const [state, setState] = useState<TrackingState>(getTrackingState());
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      const result = await startTracking(agent.id);
      if (!mountedRef.current) return;

      setState(getTrackingState());
      if (!result.success) {
        setError(result.error ?? 'Error desconocido');
      }
    })();

    return () => {
      mountedRef.current = false;
      void stopTracking();
    };
  }, [agent.id]);

  return { trackingState: state, trackingError: error };
}
