import { useEffect, useMemo, useRef, useState } from "react";

import type {
  HealthResponse,
  ReadyResponse,
  AgentSnapshotResponse,
  AgentsHealthResponse,
  MetricsResponse,
  OutcomeLatencyRow,
  AlertState,
  SystemResponse,
  SamplePoint,
  WindowStats,
} from "./ops-types";
import { MAX_POINTS } from "./ops-types";
import { sanitizeApiBase, statusClassSum, timeLabel, clampDelta } from "./ops-helpers";

export type OpsData = {
  health: HealthResponse | null;
  ready: ReadyResponse | null;
  agentsHealth: AgentsHealthResponse | null;
  metrics: MetricsResponse | null;
  liveAgents: number;
  system: SystemResponse | null;
  systemAvailable: boolean;
  points: SamplePoint[];
  lastError: string | null;
  chartsReady: boolean;
  latencyRows: { route: string; count: number; p50: number; p90: number; p95: number; p99: number }[];
  ingestionBars: { name: string; ok2xx: number; err4xx: number; err5xx: number }[];
  outcomeLatencyRows: OutcomeLatencyRow[];
  opsAlerts: AlertState[];
  window5m: WindowStats;
  trackingWindowTotal: number;
  formsWindowTotal: number;
  trackingWindow4xxRate: string;
  formsWindow4xxRate: string;
};

export function useOpsData(): OpsData {
  const apiBase = sanitizeApiBase(process.env.NEXT_PUBLIC_MAP_API_BASE ?? "");

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [ready, setReady] = useState<ReadyResponse | null>(null);
  const [agentsHealth, setAgentsHealth] = useState<AgentsHealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [liveAgents, setLiveAgents] = useState(0);
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [systemAvailable, setSystemAvailable] = useState(true);
  const [points, setPoints] = useState<SamplePoint[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const pollCycleRef = useRef(0);

  const healthUrl = apiBase ? `${apiBase}/api/health` : "/api/health";
  const readyUrl = apiBase ? `${apiBase}/api/ready` : "/api/ready";
  const metricsUrl = apiBase ? `${apiBase}/api/metrics` : "/api/metrics";
  const agentsHealthUrl = apiBase ? `${apiBase}/api/agents/health` : "/api/agents/health";
  const agentsLiveUrl = apiBase ? `${apiBase}/api/agents/live` : "/api/agents/live";
  const systemUrl = apiBase ? `${apiBase}/api/ops/system` : "/api/ops/system";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const frame = requestAnimationFrame(() => {
      setChartsReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [isMounted]);

  useEffect(() => {
    let cancelled = false;

    const poll = async (deepProbe: boolean) => {
      try {
        const [healthRes, metricsRes, agentsHealthRes, liveRes, readyRes, systemRes] = await Promise.all([
          fetch(healthUrl, { cache: "no-store" }),
          fetch(metricsUrl, { cache: "no-store" }),
          fetch(agentsHealthUrl, { cache: "no-store" }),
          fetch(agentsLiveUrl, { cache: "no-store" }),
          deepProbe ? fetch(readyUrl, { cache: "no-store" }) : Promise.resolve(null),
          deepProbe ? fetch(systemUrl, { cache: "no-store" }) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const healthPayload = healthRes.ok ? ((await healthRes.json()) as HealthResponse) : null;
        const metricsPayload = metricsRes.ok ? ((await metricsRes.json()) as MetricsResponse) : null;
        const agentsHealthPayload = agentsHealthRes.ok ? ((await agentsHealthRes.json()) as AgentsHealthResponse) : null;

        if (healthPayload) setHealth(healthPayload);
        if (readyRes && readyRes.ok) {
          setReady((await readyRes.json()) as ReadyResponse);
        }
        if (metricsPayload) setMetrics(metricsPayload);
        if (agentsHealthPayload) setAgentsHealth(agentsHealthPayload);

        if (liveRes.ok) {
          const payload = (await liveRes.json()) as AgentSnapshotResponse;
          setLiveAgents(Array.isArray(payload.agents) ? payload.agents.length : 0);
        }

        if (systemRes) {
          if (systemRes.ok) {
            setSystem((await systemRes.json()) as SystemResponse);
            setSystemAvailable(true);
          } else if (systemRes.status === 404) {
            setSystemAvailable(false);
            setSystem(null);
          }
        }

        setLastError(null);

        setPoints((prev) => {
          const next: SamplePoint = {
            tsMs: Date.now(),
            t: timeLabel(Date.now()),
            tracking202: statusClassSum(metricsPayload?.counters?.tracking_ingest_total, "2"),
            forms202: statusClassSum(metricsPayload?.counters?.forms_ingest_total, "2"),
            tracking4xx: statusClassSum(metricsPayload?.counters?.tracking_ingest_total, "4"),
            forms4xx: statusClassSum(metricsPayload?.counters?.forms_ingest_total, "4"),
            tracking5xx: statusClassSum(metricsPayload?.counters?.tracking_ingest_total, "5"),
            forms5xx: statusClassSum(metricsPayload?.counters?.forms_ingest_total, "5"),
            online: agentsHealthPayload?.online_agents ?? 0,
            sse: agentsHealthPayload?.sse_clients ?? 0,
            trackingQueue: metricsPayload?.gauges?.tracking_queue_depth ?? 0,
            formsQueue: metricsPayload?.gauges?.forms_queue_depth ?? 0,
          };

          const merged = [...prev, next];
          return merged.slice(Math.max(0, merged.length - MAX_POINTS));
        });
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : "error no identificado");
        }
      }
    };

    void poll(true);
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      pollCycleRef.current += 1;
      const deepProbe = pollCycleRef.current % 4 === 0;
      void poll(deepProbe);
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [agentsHealthUrl, agentsLiveUrl, healthUrl, metricsUrl, readyUrl, systemUrl]);

  const latencyRows = useMemo(() => {
    return Object.entries(metrics?.latencies ?? {}).map(([route, value]) => ({
      route,
      count: value.count,
      p50: value.p50_ms,
      p90: value.p90_ms,
      p95: value.p95_ms,
      p99: value.p99_ms,
    }));
  }, [metrics]);

  const ingestionBars = useMemo(() => {
    const tracking = metrics?.counters?.tracking_ingest_total;
    const forms = metrics?.counters?.forms_ingest_total;

    return [
      {
        name: "Tracking",
        ok2xx: statusClassSum(tracking, "2"),
        err4xx: statusClassSum(tracking, "4"),
        err5xx: statusClassSum(tracking, "5"),
      },
      {
        name: "Forms",
        ok2xx: statusClassSum(forms, "2"),
        err4xx: statusClassSum(forms, "4"),
        err5xx: statusClassSum(forms, "5"),
      },
    ];
  }, [metrics]);

  const outcomeLatencyRows = useMemo<OutcomeLatencyRow[]>(() => {
    const source = metrics?.ingest_outcome_latencies;
    if (!source) return [];

    const outcomes = ["accepted", "deduped", "rate_limited", "auth_failed", "invalid_payload", "backpressure"];
    const rows: OutcomeLatencyRow[] = [];

    for (const stream of ["tracking", "forms"] as const) {
      const streamData = source[stream] ?? {};
      for (const outcome of outcomes) {
        const value = streamData[outcome];
        if (!value) continue;
        rows.push({
          stream,
          outcome,
          count: value.count,
          p50: value.p50_ms,
          p90: value.p90_ms,
          p95: value.p95_ms,
          p99: value.p99_ms,
        });
      }
    }

    return rows;
  }, [metrics]);

  const opsAlerts = useMemo<AlertState[]>(() => {
    const formsAccepted = metrics?.ingest_outcome_latencies?.forms?.accepted;
    const trackingAccepted = metrics?.ingest_outcome_latencies?.tracking?.accepted;
    const formsRateLimited = metrics?.ingest_outcome_latencies?.forms?.rate_limited;

    const formsAcceptedCount = formsAccepted?.count ?? 0;
    const formsRateLimitedCount = formsRateLimited?.count ?? 0;
    const formsTotal = formsAcceptedCount + formsRateLimitedCount;
    const forms429Ratio = formsTotal > 0 ? (formsRateLimitedCount / formsTotal) * 100 : 0;

    const formsQueueDepth = metrics?.gauges?.forms_queue_depth ?? 0;
    const formsFlushAgeMs = metrics?.gauges?.forms_last_flush_age_ms ?? 0;
    const trackingQueueDepth = metrics?.gauges?.tracking_queue_depth ?? 0;
    const trackingFlushAgeMs = metrics?.gauges?.tracking_last_flush_age_ms ?? 0;

    const formsLatencyTone: AlertState["tone"] = !formsAccepted
      ? "warn"
      : formsAccepted.p95_ms > 380 || formsAccepted.p99_ms > 450
        ? "bad"
        : formsAccepted.p95_ms > 320 || formsAccepted.p99_ms > 380
          ? "warn"
          : "good";

    const trackingLatencyTone: AlertState["tone"] = !trackingAccepted
      ? "warn"
      : trackingAccepted.p95_ms > 380 || trackingAccepted.p99_ms > 450
        ? "bad"
        : trackingAccepted.p95_ms > 320 || trackingAccepted.p99_ms > 390
          ? "warn"
          : "good";

    const forms429Tone: AlertState["tone"] = forms429Ratio > 8 ? "bad" : forms429Ratio > 2 ? "warn" : "good";
    const formsQueueTone: AlertState["tone"] = formsQueueDepth > 300 || formsFlushAgeMs > 10000 ? "bad" : formsQueueDepth > 100 || formsFlushAgeMs > 3000 ? "warn" : "good";
    const trackingQueueTone: AlertState["tone"] =
      trackingQueueDepth > 500 || trackingFlushAgeMs > 10000 ? "bad" : trackingQueueDepth > 150 || trackingFlushAgeMs > 3000 ? "warn" : "good";

    return [
      {
        label: "SLO forms accepted",
        value: formsAccepted ? `p95=${formsAccepted.p95_ms} | p99=${formsAccepted.p99_ms}` : "sin muestra",
        detail: formsAccepted ? `count=${formsAccepted.count}` : "necesita trafico aceptado",
        tone: formsLatencyTone,
      },
      {
        label: "SLO tracking accepted",
        value: trackingAccepted ? `p95=${trackingAccepted.p95_ms} | p99=${trackingAccepted.p99_ms}` : "sin muestra",
        detail: trackingAccepted ? `count=${trackingAccepted.count}` : "necesita trafico aceptado",
        tone: trackingLatencyTone,
      },
      {
        label: "Forms rate-limited",
        value: `${forms429Ratio.toFixed(2)}%`,
        detail: `accepted=${formsAcceptedCount} | rate_limited=${formsRateLimitedCount}`,
        tone: forms429Tone,
      },
      {
        label: "Queue forms",
        value: `depth=${formsQueueDepth}`,
        detail: `flush_age_ms=${formsFlushAgeMs}`,
        tone: formsQueueTone,
      },
      {
        label: "Queue tracking",
        value: `depth=${trackingQueueDepth}`,
        detail: `flush_age_ms=${trackingFlushAgeMs}`,
        tone: trackingQueueTone,
      },
    ];
  }, [metrics]);

  const window5m = useMemo<WindowStats>(() => {
    if (points.length === 0) {
      return {
        windowMinutes: 5,
        tracking2xx: 0,
        tracking4xx: 0,
        tracking5xx: 0,
        forms2xx: 0,
        forms4xx: 0,
        forms5xx: 0,
      };
    }

    const windowMinutes = 5;
    const now = Date.now();
    const cutoff = now - windowMinutes * 60_000;

    let firstInWindowIdx = 0;
    for (let i = 0; i < points.length; i += 1) {
      if (points[i].tsMs >= cutoff) {
        firstInWindowIdx = i;
        break;
      }
    }

    const last = points[points.length - 1];
    const baseline = firstInWindowIdx > 0 ? points[firstInWindowIdx - 1] : points[0];

    return {
      windowMinutes,
      tracking2xx: clampDelta(last.tracking202, baseline.tracking202),
      tracking4xx: clampDelta(last.tracking4xx, baseline.tracking4xx),
      tracking5xx: clampDelta(last.tracking5xx, baseline.tracking5xx),
      forms2xx: clampDelta(last.forms202, baseline.forms202),
      forms4xx: clampDelta(last.forms4xx, baseline.forms4xx),
      forms5xx: clampDelta(last.forms5xx, baseline.forms5xx),
    };
  }, [points]);

  const trackingWindowTotal = window5m.tracking2xx + window5m.tracking4xx + window5m.tracking5xx;
  const formsWindowTotal = window5m.forms2xx + window5m.forms4xx + window5m.forms5xx;
  const trackingWindow4xxRate = trackingWindowTotal > 0 ? ((window5m.tracking4xx / trackingWindowTotal) * 100).toFixed(2) : "0.00";
  const formsWindow4xxRate = formsWindowTotal > 0 ? ((window5m.forms4xx / formsWindowTotal) * 100).toFixed(2) : "0.00";

  return {
    health,
    ready,
    agentsHealth,
    metrics,
    liveAgents,
    system,
    systemAvailable,
    points,
    lastError,
    chartsReady,
    latencyRows,
    ingestionBars,
    outcomeLatencyRows,
    opsAlerts,
    window5m,
    trackingWindowTotal,
    formsWindowTotal,
    trackingWindow4xxRate,
    formsWindow4xxRate,
  };
}
