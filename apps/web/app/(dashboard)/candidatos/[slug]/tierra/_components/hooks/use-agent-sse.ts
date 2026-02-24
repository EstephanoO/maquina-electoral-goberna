/* ========== SSE Hook — Live Agent Locations (fetch-based, cookie auth) ========== */

import { useEffect, useRef } from "react";
import type { AgentLocation } from "@/lib/hooks";

type AgentOfflinePayload = {
  agent_id: string;
  agent_name?: string;
  ts: string;
};

export type AgentStatusPayload = {
  agent_id: string;
  agent_name?: string;
  status: "background" | "foreground";
  campaign_id?: string | null;
  ts: string;
};

/**
 * Try to refresh the access token using the httpOnly cookie.
 * Returns true on success, false on failure.
 */
async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "same-origin",
    });

    return res.ok;
  } catch {
    return false;
  }
}

/** How long without any SSE data before we consider the connection dead */
const HEARTBEAT_TIMEOUT_MS = 60_000;

/**
 * Subscribe to the agent tracking SSE stream using fetch() + ReadableStream.
 *
 * Auth is handled via httpOnly cookies — the browser sends them automatically.
 * Reconnects with exponential backoff (max 30s).
 *
 * Features:
 * - Auto-refreshes JWT on 401 before reconnecting
 * - Detects stale connections via heartbeat timeout
 */
export function useAgentSSE(
  campaignId: string | null,
  onUpdate: (agents: AgentLocation[]) => void,
  onOffline?: (payload: AgentOfflinePayload) => void,
  onStatusChange?: (payload: AgentStatusPayload) => void,
) {
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  const offlineRef = useRef(onOffline);
  offlineRef.current = onOffline;
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;

  useEffect(() => {
    if (!campaignId) return;

    let abortController: AbortController | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    function resetHeartbeatTimer() {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      if (disposed) return;
      heartbeatTimer = setTimeout(() => {
        // No data received for HEARTBEAT_TIMEOUT_MS — connection is likely dead.
        // Abort and reconnect.
        abortController?.abort();
      }, HEARTBEAT_TIMEOUT_MS);
    }

    function handleSseEvent(event: string, data: string) {
      // Any event (including heartbeat) proves the connection is alive
      resetHeartbeatTimer();

      try {
        const parsed = JSON.parse(data);

        if (event === "snapshot") {
          if (parsed.agents) updateRef.current(parsed.agents);
          attempt = 0; // successful connection
        } else if (event === "location.batch") {
          if (parsed.agents) updateRef.current(parsed.agents);
        } else if (event === "agent.offline") {
          offlineRef.current?.(parsed as AgentOfflinePayload);
        } else if (event === "agent.status") {
          statusRef.current?.(parsed as AgentStatusPayload);
        }
        // heartbeat events reset the timer above but need no further handling
      } catch { /* ignore parse errors */ }
    }

    async function connect() {
      if (disposed) return;

      abortController = new AbortController();
      resetHeartbeatTimer();

      try {
        let res = await fetch("/api/agents/stream", {
          headers: { Accept: "text/event-stream" },
          signal: abortController.signal,
          credentials: "same-origin",
        });

        // If 401, try refreshing the token once before giving up
        if (res.status === 401) {
          const refreshed = await tryRefreshToken();
          if (refreshed && !disposed) {
            // Re-create abort controller since the previous fetch completed
            abortController = new AbortController();
            res = await fetch("/api/agents/stream", {
              headers: { Accept: "text/event-stream" },
              signal: abortController.signal,
              credentials: "same-origin",
            });
          }
        }

        if (!res.ok || !res.body) {
          throw new Error(`SSE stream error: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        let currentData = "";

        async function processChunk(): Promise<void> {
          const { done, value } = await reader.read();
          if (done || disposed) return;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              // New event starting — flush any prior event
              if (currentEvent && currentData) {
                handleSseEvent(currentEvent, currentData);
              }
              currentEvent = line.substring(7).trim();
              currentData = "";
            } else if (line.startsWith("data: ")) {
              currentData += (currentData ? "\n" : "") + line.substring(6);
            } else if (line === "") {
              // Empty line = end of event
              if (currentEvent && currentData) {
                handleSseEvent(currentEvent, currentData);
              }
              currentEvent = "";
              currentData = "";
            }
            // Lines starting with "retry:" or ":" (comments) are ignored
          }

          return processChunk();
        }

        await processChunk();
      } catch (err) {
        // AbortError means we intentionally disconnected (or heartbeat timeout)
        if (err instanceof DOMException && err.name === "AbortError" && disposed) return;
        if (disposed) return;

        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      }
    }

    void connect();

    return () => {
      disposed = true;
      abortController?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
    };
  }, [campaignId]);
}
