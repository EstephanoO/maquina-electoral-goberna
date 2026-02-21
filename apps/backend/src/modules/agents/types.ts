export type AgentLocationInput = {
  agent_id: string;
  agent_name?: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  seq: number;
  campaign_id?: string;
};

export type AgentLiveState = {
  agentId: string;
  agentName: string | null;
  ts: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  seq: number;
  campaignId: string | null;
  receivedAt: string;
  lastSeenAtMs: number;
};
