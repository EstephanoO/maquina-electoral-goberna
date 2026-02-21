import { agentLocationSchema } from "./schema";
import type { AgentLiveState } from "./types";

/** Parse raw input into an AgentLiveState (shared by HTTP and WS ingest). */
export function toState(value: unknown): AgentLiveState {
  const parsed = agentLocationSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("payload invalido");
  }

  return {
    agentId: parsed.data.agent_id,
    agentName: parsed.data.agent_name ?? null,
    ts: new Date(parsed.data.ts).toISOString(),
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    accuracy: parsed.data.accuracy ?? null,
    speed: parsed.data.speed ?? null,
    heading: parsed.data.heading ?? null,
    battery: parsed.data.battery ?? null,
    seq: parsed.data.seq,
    campaignId: parsed.data.campaign_id ?? null,
    receivedAt: new Date().toISOString(),
    lastSeenAtMs: Date.now(),
  };
}
