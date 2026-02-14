export type AgentLocationInput = {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  seq: number;
};

export type AgentLiveState = {
  agentId: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  seq: number;
  receivedAt: string;
  lastSeenAtMs: number;
};
