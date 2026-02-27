import type { AppEnv } from "../../config/env";
import type { AgentLiveState, AgentLocationInput } from "./types";

export type StaleResult = {
  /** Agents that are truly offline (no WS, no GPS) — should be removed */
  offline: string[];
  /** Agents that have WS active but no recent GPS — should be marked idle */
  idle: string[];
};

export class AgentsStore {
  private readonly env: AppEnv;
  private readonly agents = new Map<string, AgentLiveState>();

  /**
   * Set of agent IDs known to have an active WebSocket connection.
   * Managed externally by ws-routes.ts via addWsAgent() / removeWsAgent().
   */
  private readonly wsConnectedAgents = new Set<string>();

  constructor(env: AppEnv) {
    this.env = env;
  }

  /** Total entries in the map (includes potentially stale agents). */
  get size(): number {
    return this.agents.size;
  }

  get(agentId: string): AgentLiveState | undefined {
    return this.agents.get(agentId);
  }

  seed(states: AgentLiveState[]) {
    for (const state of states) {
      this.upsert(state);
    }
  }

  upsert(next: AgentLiveState): { accepted: boolean; deduped: boolean } {
    const previous = this.agents.get(next.agentId);
    if (previous && next.seq <= previous.seq) {
      return { accepted: false, deduped: true };
    }

    this.agents.set(next.agentId, next);
    return { accepted: true, deduped: false };
  }

  // ─── WebSocket presence tracking ───────────────────────────

  /** Register that an agent has an active WebSocket connection */
  addWsAgent(agentId: string): void {
    this.wsConnectedAgents.add(agentId);
  }

  /** Unregister an agent's WebSocket connection */
  removeWsAgent(agentId: string): void {
    this.wsConnectedAgents.delete(agentId);
  }

  /** Check if an agent has an active WebSocket connection */
  hasWsConnection(agentId: string): boolean {
    return this.wsConnectedAgents.has(agentId);
  }

  /** Count of agents with active WebSocket connections */
  get wsAgentCount(): number {
    return this.wsConnectedAgents.size;
  }

  /**
   * Touch an agent's lastSeenAtMs without requiring a location update.
   * Used by WS pong to keep the agent alive while connected but stationary.
   */
  touchLastSeen(agentId: string): void {
    const state = this.agents.get(agentId);
    if (state) {
      state.lastSeenAtMs = Date.now();
    }
  }

  /**
   * Remove stale agents, distinguishing between truly offline and idle (WS-connected but no GPS).
   *
   * - Agents with an active WebSocket are NOT removed; they're returned in `idle`.
   * - Agents without WS that exceed stale time are removed and returned in `offline`.
   *
   * @deprecated Use sweepGpsIdle() for session-based presence paradigm.
   */
  removeStale(): StaleResult {
    const now = Date.now();
    const result: StaleResult = { offline: [], idle: [] };

    for (const [agentId, state] of this.agents.entries()) {
      if (now - state.lastSeenAtMs > this.env.agentStaleAfterMs) {
        if (this.wsConnectedAgents.has(agentId)) {
          result.idle.push(agentId);
        } else {
          this.agents.delete(agentId);
          result.offline.push(agentId);
        }
      }
    }

    return result;
  }

  /**
   * Identify GPS-idle agents without removing them from the store.
   *
   * Session-based paradigm: agents go offline ONLY on explicit logout.
   * This method only finds agents whose GPS data is stale (no recent location
   * updates), regardless of WS connection state.
   * Agents are NEVER removed from the store by the sweep — only by explicit cleanup.
   */
  sweepGpsIdle(): { idle: string[] } {
    const now = Date.now();
    const idle: string[] = [];

    for (const [agentId, state] of this.agents.entries()) {
      if (now - state.lastSeenAtMs > this.env.agentStaleAfterMs) {
        idle.push(agentId);
      }
    }

    return { idle };
  }

  /**
   * Count of agents in the store.
   * Session-based paradigm: all agents in the store are considered relevant
   * (they have sent at least one location since login).
   */
  countLive(): number {
    return this.agents.size;
  }

  /**
   * List all agents in the store.
   * Session-based paradigm: returns all agents that have ever reported a location
   * during their current session. The dashboard uses `online_agent_ids` from Redis
   * to determine which are actually connected (session active).
   */
  listLive(): AgentLocationInput[] {
    const output: AgentLocationInput[] = [];
    for (const state of this.agents.values()) {
      output.push(this.serialize(state));
    }
    return output;
  }

  serialize(state: AgentLiveState): AgentLocationInput {
    return {
      agent_id: state.agentId,
      agent_name: state.agentName ?? undefined,
      ts: state.ts,
      lat: state.lat,
      lng: state.lng,
      accuracy: state.accuracy ?? undefined,
      speed: state.speed ?? undefined,
      heading: state.heading ?? undefined,
      battery: state.battery ?? undefined,
      seq: state.seq,
      campaign_id: state.campaignId ?? undefined,
    };
  }
}
