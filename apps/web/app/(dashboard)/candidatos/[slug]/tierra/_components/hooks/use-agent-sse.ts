/* ========== SSE Hook — Live Agent Locations ========== */

import { useEffect, useRef } from "react";
import type { AgentLocation } from "@/lib/hooks";

/**
 * Subscribe to the agent tracking SSE stream.
 * Calls `onUpdate` with incoming location batches — the caller merges into state.
 * Reconnects with exponential backoff (max 30s).
 */
export function useAgentSSE(campaignId: string | null, onUpdate: (agents: AgentLocation[]) => void) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    if (!campaignId) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function connect() {
      es = new EventSource(`/api/agents/stream`);

      es.addEventListener("snapshot", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.agents) cbRef.current(data.agents);
          attempt = 0;
        } catch { /* ignore */ }
      });

      es.addEventListener("location.batch", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.agents) cbRef.current(data.agents);
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        es?.close();
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [campaignId]);
}
