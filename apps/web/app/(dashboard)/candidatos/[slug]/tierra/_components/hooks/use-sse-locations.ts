import { useState, useRef, useEffect, useCallback } from "react";
import type { AgentLocation } from "@/lib/hooks";
import type { LogEntry } from "../types";

const BATCH_INTERVAL_MS = 250;
const MAX_LOG_ENTRIES = 30;

/**
 * Manages SSE location batching, offline events, background/foreground status,
 * and session-based online tracking (login/logout presence).
 * Extracted from page.tsx to keep the page under 200 lines.
 */
export function useSSELocations(initialLocations: AgentLocation[] | undefined) {
  const [locations, setLocations] = useState<AgentLocation[]>([]);
  const locationsMapRef = useRef<Map<string, AgentLocation>>(new Map());

  /**
   * Session-based online agent IDs.
   * An agent is "online" from login until logout — regardless of GPS or app state.
   * Seeded from SSE snapshot, updated by agent.online / agent.offline events.
   */
  const [onlineAgentIds, setOnlineAgentIds] = useState<Set<string>>(new Set());

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
  /** Agents the backend reports as GPS-idle (no recent location data) */
  const [idleAgentIds, setIdleAgentIds] = useState<Set<string>>(new Set());

  /** Seed online agent IDs from SSE snapshot (called once when snapshot arrives) */
  const handleSnapshotOnlineIds = useCallback((ids: string[]) => {
    setOnlineAgentIds(new Set(ids));
  }, []);

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

      // Agent sending GPS again means it's no longer GPS-idle
      setIdleAgentIds((prev) => {
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

  /** Agent logged out — remove from online set, add disconnect log entry */
  const handleAgentOffline = useCallback((payload: { agent_id: string; agent_name?: string; ts: string }) => {
    setOnlineAgentIds((prev) => { const next = new Set(prev); next.delete(payload.agent_id); return next; });
    setIdleAgentIds((prev) => { const next = new Set(prev); next.delete(payload.agent_id); return next; });
    const name = payload.agent_name ?? `Agente ${payload.agent_id.slice(0, 8)}`;
    setSseEvents((prev) => [{
      id: `sse-offline-${payload.agent_id}-${payload.ts}`, type: "agent_disconnected" as const,
      agentName: name, message: `${name} cerro sesion`, timestamp: new Date(payload.ts), lat: null, lng: null,
    }, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  /** Agent logged in — add to online set, add connect log entry */
  const handleAgentOnline = useCallback((payload: { agent_id: string; agent_name?: string; ts: string }) => {
    setOnlineAgentIds((prev) => { const next = new Set(prev); next.add(payload.agent_id); return next; });
    const name = payload.agent_name ?? `Agente ${payload.agent_id.slice(0, 8)}`;
    setSseEvents((prev) => [{
      id: `sse-online-${payload.agent_id}-${payload.ts}`, type: "agent_connected" as const,
      agentName: name, message: `${name} inicio sesion`, timestamp: new Date(payload.ts), lat: null, lng: null,
    }, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  /** Agent has no recent GPS data — mark as GPS-idle */
  const handleAgentIdle = useCallback((payload: { agent_id: string; agent_name?: string; ts: string }) => {
    setIdleAgentIds((prev) => { const next = new Set(prev); next.add(payload.agent_id); return next; });
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
    idleAgentIds,
    onlineAgentIds,
    handleSSEUpdate,
    handleSnapshotOnlineIds,
    handleAgentOffline,
    handleAgentOnline,
    handleAgentIdle,
    handleAgentStatus,
  };
}
