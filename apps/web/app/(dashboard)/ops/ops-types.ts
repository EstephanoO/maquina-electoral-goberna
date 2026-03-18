export type HealthResponse = {
  ok?: boolean;
  service?: string;
  ts?: string;
};

export type ReadyResponse = {
  ok?: boolean;
  checks?: {
    database?: boolean;
    tegola?: boolean;
    redis?: boolean;
  };
  ts?: string;
};

export type AgentLocation = {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
};

export type AgentSnapshotResponse = {
  ok?: boolean;
  agents?: AgentLocation[];
};

export type AgentsHealthResponse = {
  ok?: boolean;
  online_agents?: number;
  sse_clients?: number;
  queue_depth?: number;
  last_ingest_age_ms?: number | null;
  last_flush_duration_ms?: number | null;
};

export type MetricsResponse = {
  ok?: boolean;
  counters?: {
    tracking_ingest_total?: Record<string, number>;
    forms_ingest_total?: Record<string, number>;
  };
  gauges?: {
    tracking_queue_depth?: number;
    forms_queue_depth?: number;
    tracking_last_flush_age_ms?: number;
    forms_last_flush_age_ms?: number;
    tracking_online_agents?: number;
    tracking_sse_clients?: number;
  };
  latencies?: Record<
    string,
    {
      count: number;
      p50_ms: number;
      p90_ms: number;
      p95_ms: number;
      p99_ms: number;
    }
  >;
  ingest_outcome_latencies?: {
    forms?: Record<
      string,
      {
        count: number;
        p50_ms: number;
        p90_ms: number;
        p95_ms: number;
        p99_ms: number;
      }
    >;
    tracking?: Record<
      string,
      {
        count: number;
        p50_ms: number;
        p90_ms: number;
        p95_ms: number;
        p99_ms: number;
      }
    >;
  };
  ts?: string;
};

export type OutcomeLatencyRow = {
  stream: "tracking" | "forms";
  outcome: string;
  count: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
};

export type AlertState = {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warn" | "bad";
};

export type SystemResponse = {
  ok?: boolean;
  cpu_percent?: number;
  mem_percent?: number;
  disk_percent?: number;
  uptime_seconds?: number;
};

export type SamplePoint = {
  tsMs: number;
  t: string;
  tracking202: number;
  forms202: number;
  tracking4xx: number;
  forms4xx: number;
  tracking5xx: number;
  forms5xx: number;
  online: number;
  sse: number;
  trackingQueue: number;
  formsQueue: number;
};

export type WindowStats = {
  windowMinutes: number;
  tracking2xx: number;
  tracking4xx: number;
  tracking5xx: number;
  forms2xx: number;
  forms4xx: number;
  forms5xx: number;
};

export const MAX_POINTS = 72;
