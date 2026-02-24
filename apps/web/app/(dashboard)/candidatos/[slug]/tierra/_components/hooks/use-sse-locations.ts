import { useState, useRef, useEffect, useCallback } from "react";
import type { AgentLocation } from "@/lib/hooks";
import type { LogEntry } from "../types";

const BATCH_INTERVAL_MS = 250;
const MAX_LOG_ENTRIES = 30;

/**
 * Manages SSE location batching, offline events, and background/foreground status.
 * Extracted from page.tsx to keep the page under 200 lines.
 */
export function useSSELocations(initialLocations: AgentLocation[] | undefined) {
  const [locations, setLocations] = useState<AgentLocation[]>([]);
  const locationsMapRef = useRef<Map<string, AgentLocation>>(new Map());

  // Seed from snapshot
  useEffect(() => {
    if (initialLocations?.length) {
      const map = new Map<string, AgentLocation>();
      for (const loc of initialLocations) map.set(loc.agent_id, loc);
      locationsMapRef.current = map;
      setLocations(initialLocations);
    }
  }, [initialLocations]);

  // SSE batching refs
  const ssePendingRef = useRef<Map<string, AgentLocation> | null>(null);
  const sseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sseEvents, setSseEvents] = useState<LogEntry[]>([]);
  const [backgroundAgentIds, setBackgroundAgentIds] = useState<Set<string>>(new Set());

  const handleSSEUpdate = useCallback((incoming: AgentLocation[]) => {
    if (!ssePendingRef.current) ssePendingRef.current = new Map();
    for (const loc of incoming) ssePendingRef.current.set(loc.agent_id, loc);
    if (sseTimerRef.current) return;
    sseTimerRef.current = setTimeout(() => {
      sseTimerRef.current = null;
      const pending = ssePendingRef.current;
      if (!pending || pending.size === 0) return;
      ssePendingRef.current = null;

      setBackgroundAgentIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of pending.keys()) {
          if (next.has(id)) { next.delete(id); changed = true; }
        }
        return changed ? next : prev;
      });

      const map = locationsMapRef.current;
      for (const [id, loc] of pending) map.set(id, loc);
      setLocations(Array.from(map.values()));
    }, BATCH_INTERVAL_MS);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => () => { if (sseTimerRef.current) clearTimeout(sseTimerRef.current); }, []);

  const handleAgentOffline = useCallback((payload: { agent_id: string; agent_name?: string; ts: string }) => {
    locationsMapRef.current.delete(payload.agent_id);
    setLocations((prev) => prev.filter((l) => l.agent_id !== payload.agent_id));
    const name = payload.agent_name ?? `Agente ${payload.agent_id.slice(0, 8)}`;
    setSseEvents((prev) => [{
      id: `sse-offline-${payload.agent_id}-${payload.ts}`, type: "agent_disconnected" as const,
      agentName: name, message: `${name} se desconecto`, timestamp: new Date(payload.ts), lat: null, lng: null,
    }, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const handleAgentStatus = useCallback((payload: { agent_id: string; status: string }) => {
    if (payload.status === "background") {
      setBackgroundAgentIds((prev) => { const next = new Set(prev); next.add(payload.agent_id); return next; });
    } else if (payload.status === "foreground") {
      setBackgroundAgentIds((prev) => { const next = new Set(prev); next.delete(payload.agent_id); return next; });
    }
  }, []);

  return {
    locations,
    sseEvents,
    backgroundAgentIds,
    handleSSEUpdate,
    handleAgentOffline,
    handleAgentStatus,
  };
}
