import type { AppEnv } from "../../config/env";
import type { AgentLiveState, AgentLocationInput } from "./types";

export class AgentsStore {
  private readonly env: AppEnv;
  private readonly agents = new Map<string, AgentLiveState>();

  constructor(env: AppEnv) {
    this.env = env;
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

  removeStale(): string[] {
    const now = Date.now();
    const removed: string[] = [];

    for (const [agentId, state] of this.agents.entries()) {
      if (now - state.lastSeenAtMs > this.env.agentStaleAfterMs) {
        this.agents.delete(agentId);
        removed.push(agentId);
      }
    }

    return removed;
  }

  listLive(): AgentLocationInput[] {
    const now = Date.now();
    const output: AgentLocationInput[] = [];

    for (const state of this.agents.values()) {
      if (now - state.lastSeenAtMs > this.env.agentStaleAfterMs) {
        continue;
      }
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
