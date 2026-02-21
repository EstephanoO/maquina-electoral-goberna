/* ========== SSE Hook — Live Agent Locations (fetch-based for Bearer auth) ========== */

import { useEffect, useRef } from "react";
import type { AgentLocation } from "@/lib/hooks";
import { STORAGE_KEYS } from "@/lib/constants";

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
 * Subscribe to the agent tracking SSE stream using fetch() + ReadableStream.
 *
 * We cannot use native EventSource because it doesn't support custom headers,
 * and the /api/agents/stream endpoint requires a Bearer JWT token.
 *
 * Calls `onUpdate` with incoming location batches — the caller merges into state.
 * Calls `onOffline` when an agent goes offline — the caller removes from state.
 * Reconnects with exponential backoff (max 30s).
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
    let attempt = 0;
    let disposed = false;

    function handleSseEvent(event: string, data: string) {
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
        // heartbeat events are silently ignored
      } catch { /* ignore parse errors */ }
    }

    function connect() {
      if (disposed) return;

      const token = typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEYS.accessToken)
        : null;
      if (!token) {
        // No token yet — retry shortly
        reconnectTimer = setTimeout(connect, 2000);
        return;
      }

      abortController = new AbortController();

      fetch("/api/agents/stream", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal: abortController.signal,
      })
        .then((res) => {
          if (!res.ok || !res.body) {
            throw new Error(`SSE stream error: ${res.status}`);
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let currentEvent = "";
          let currentData = "";

          function processChunk(): Promise<void> {
            return reader.read().then(({ done, value }) => {
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
            });
          }

          return processChunk();
        })
        .catch((err) => {
          // AbortError means we intentionally disconnected
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (disposed) return;

          const delay = Math.min(1000 * 2 ** attempt, 30_000);
          attempt++;
          reconnectTimer = setTimeout(connect, delay);
        });
    }

    connect();

    return () => {
      disposed = true;
      abortController?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [campaignId]);
}
