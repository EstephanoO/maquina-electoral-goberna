/**
 * Hook that connects to GET /api/agents/stream (SSE) and maintains
 * a live map of all online agents.
 *
 * Returns a Map<agent_id, AgentLocationWire> that updates in real-time.
 *
 * Events handled:
 * - snapshot: initial full state
 * - location.batch: incremental updates
 * - agent.offline: removes agent from map
 * - heartbeat: ignored (keeps connection alive)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import type { AgentLocationWire } from '@/lib/types';

const RECONNECT_DELAY_MS = 5_000;

type AgentsMap = Map<string, AgentLocationWire>;

export function useAgentsStream() {
  const [agents, setAgents] = useState<AgentLocationWire[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agentsRef = useRef<AgentsMap>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncState = useCallback(() => {
    if (!mountedRef.current) return;
    setAgents(Array.from(agentsRef.current.values()));
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    // Cleanup previous
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const token = await getAccessToken();
    if (!token) {
      setError('No hay token de autenticacion');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/agents/stream`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body for SSE');
      }

      setConnected(true);
      setError(null);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (mountedRef.current) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              handleEventRef.current(currentEvent, data);
            } catch {
              // Invalid JSON, skip
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return; // Intentional disconnect

      const message = err instanceof Error ? err.message : 'Error de conexion SSE';
      if (mountedRef.current) {
        setConnected(false);
        setError(message);

        // Auto-reconnect
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            void connect();
          }
        }, RECONNECT_DELAY_MS);
      }
    }
  }, []);

  const handleEventRef = useRef((event: string, data: unknown) => {});
  handleEventRef.current = (event: string, data: unknown) => {
    if (!mountedRef.current) return;

    const obj = data as Record<string, unknown>;

    switch (event) {
      case 'snapshot': {
        agentsRef.current.clear();
        const snapshotAgents = (obj.agents ?? []) as AgentLocationWire[];
        for (const agent of snapshotAgents) {
          agentsRef.current.set(agent.agent_id, agent);
        }
        syncState();
        break;
      }
      case 'location.batch': {
        const batchAgents = (obj.agents ?? []) as AgentLocationWire[];
        for (const agent of batchAgents) {
          agentsRef.current.set(agent.agent_id, agent);
        }
        syncState();
        break;
      }
      case 'agent.offline': {
        const agentId = obj.agent_id as string;
        if (agentId) {
          agentsRef.current.delete(agentId);
          syncState();
        }
        break;
      }
      case 'heartbeat':
        // Just keeps connection alive, nothing to do
        break;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void connect();

    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  return { agents, connected, error };
}
