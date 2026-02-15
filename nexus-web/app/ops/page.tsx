"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type HealthResponse = {
  ok?: boolean;
  service?: string;
  ts?: string;
};

type ReadyResponse = {
  ok?: boolean;
  checks?: {
    database?: boolean;
    tegola?: boolean;
    redis?: boolean;
  };
  ts?: string;
};

type AgentLocation = {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
};

type AgentSnapshotResponse = {
  ok?: boolean;
  agents?: AgentLocation[];
};

type AgentsHealthResponse = {
  ok?: boolean;
  online_agents?: number;
  sse_clients?: number;
  queue_depth?: number;
  last_ingest_age_ms?: number | null;
  last_flush_duration_ms?: number | null;
};

type MetricsResponse = {
  ok?: boolean;
  counters?: {
    tracking_ingest_total?: Record<string, number>;
    forms_ingest_total?: Record<string, number>;
  };
  gauges?: {
    tracking_queue_depth?: number;
    forms_queue_depth?: number;
    tracking_online_agents?: number;
    tracking_sse_clients?: number;
  };
  latencies?: Record<
    string,
    {
      count: number;
      p50_ms: number;
      p95_ms: number;
      p99_ms: number;
    }
  >;
  ts?: string;
};

type SystemResponse = {
  ok?: boolean;
  cpu_percent?: number;
  mem_percent?: number;
  disk_percent?: number;
  uptime_seconds?: number;
};

type SamplePoint = {
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

type WindowStats = {
  windowMinutes: number;
  tracking2xx: number;
  tracking4xx: number;
  tracking5xx: number;
  forms2xx: number;
  forms4xx: number;
  forms5xx: number;
};

const MAX_POINTS = 72;

function sanitizeApiBase(rawValue: string): string {
  const value = rawValue.trim();
  if (!value || value === "undefined" || value === "null") {
    return "";
  }

  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      return "";
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function statusClassSum(record: Record<string, number> | undefined, classPrefix: "2" | "4" | "5"): number {
  if (!record) return 0;
  let total = 0;
  for (const [status, count] of Object.entries(record)) {
    if (status.startsWith(classPrefix)) total += count;
  }
  return total;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function clampDelta(next: number, prev: number): number {
  const delta = next - prev;
  return delta > 0 ? delta : 0;
}

export default function OpsDashboardPage() {
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

    const poll = async () => {
      try {
        const [healthRes, readyRes, metricsRes, agentsHealthRes, liveRes, systemRes] = await Promise.all([
          fetch(healthUrl, { cache: "no-store" }),
          fetch(readyUrl, { cache: "no-store" }),
          fetch(metricsUrl, { cache: "no-store" }),
          fetch(agentsHealthUrl, { cache: "no-store" }),
          fetch(agentsLiveUrl, { cache: "no-store" }),
          fetch(systemUrl, { cache: "no-store" }),
        ]);

        if (cancelled) return;

        const healthPayload = healthRes.ok ? ((await healthRes.json()) as HealthResponse) : null;
        const readyPayload = readyRes.ok ? ((await readyRes.json()) as ReadyResponse) : null;
        const metricsPayload = metricsRes.ok ? ((await metricsRes.json()) as MetricsResponse) : null;
        const agentsHealthPayload = agentsHealthRes.ok ? ((await agentsHealthRes.json()) as AgentsHealthResponse) : null;

        if (healthPayload) setHealth(healthPayload);
        if (readyPayload) setReady(readyPayload);
        if (metricsPayload) setMetrics(metricsPayload);
        if (agentsHealthPayload) setAgentsHealth(agentsHealthPayload);

        if (liveRes.ok) {
          const payload = (await liveRes.json()) as AgentSnapshotResponse;
          setLiveAgents(Array.isArray(payload.agents) ? payload.agents.length : 0);
        }

        if (systemRes.ok) {
          setSystem((await systemRes.json()) as SystemResponse);
          setSystemAvailable(true);
        } else if (systemRes.status === 404) {
          setSystemAvailable(false);
          setSystem(null);
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

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 5000);

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

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #e8f0ff 0%, #f6fbf2 45%, #fff4e8 100%)", color: "#0f172a" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "24px 16px 32px" }}>
        <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "10px", marginBottom: "16px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "30px", letterSpacing: "0.4px" }}>Ops Dashboard</h1>
            <p style={{ margin: "8px 0 0", color: "#334155" }}>Tracking Expo + Backend + cola write-behind en una sola vista.</p>
          </div>
          <a href="/" style={{ alignSelf: "center", textDecoration: "none", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: "10px", padding: "8px 12px", background: "#ffffff" }}>
            Volver al mapa
          </a>
        </header>

        {lastError ? (
          <p style={{ margin: "0 0 14px", padding: "10px 12px", borderRadius: "10px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}>
            Error de polling: {lastError}
          </p>
        ) : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          <StatCard title="Health" value={health?.ok ? "OK" : "DOWN"} tone={health?.ok ? "good" : "bad"} detail={health?.service ?? "backend"} />
          <StatCard title="Ready" value={ready?.ok ? "READY" : "NOT READY"} tone={ready?.ok ? "good" : "bad"} detail={`db=${String(ready?.checks?.database ?? false)} | redis=${String(ready?.checks?.redis ?? false)} | tegola=${String(ready?.checks?.tegola ?? false)}`} />
          <StatCard title="Agentes online" value={String(agentsHealth?.online_agents ?? liveAgents)} tone="info" detail={`live snapshot=${liveAgents}`} />
          <StatCard title="Clientes SSE" value={String(agentsHealth?.sse_clients ?? 0)} tone="info" detail={`last_ingest_age_ms=${agentsHealth?.last_ingest_age_ms ?? "-"}`} />
          <StatCard title="Queue tracking" value={String(metrics?.gauges?.tracking_queue_depth ?? agentsHealth?.queue_depth ?? 0)} tone="warn" detail={`flush_ms=${agentsHealth?.last_flush_duration_ms ?? "-"}`} />
          <StatCard title="Queue forms" value={String(metrics?.gauges?.forms_queue_depth ?? 0)} tone="warn" detail="write-behind forms" />
          <StatCard title="VPS observability" value={systemAvailable ? "Disponible" : "Pendiente"} tone={systemAvailable ? "good" : "warn"} detail={systemAvailable ? `cpu=${system?.cpu_percent ?? "-"}% mem=${system?.mem_percent ?? "-"}%` : "falta endpoint /api/ops/system"} />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          <StatCard
            title={`Tracking 4xx real (${window5m.windowMinutes}m)`}
            value={`${window5m.tracking4xx}`}
            tone={window5m.tracking4xx > 0 ? "warn" : "good"}
            detail={`total=${trackingWindowTotal} | ratio=${trackingWindow4xxRate}%`}
          />
          <StatCard
            title={`Forms 4xx real (${window5m.windowMinutes}m)`}
            value={`${window5m.forms4xx}`}
            tone={window5m.forms4xx > 0 ? "warn" : "good"}
            detail={`total=${formsWindowTotal} | ratio=${formsWindow4xxRate}%`}
          />
          <StatCard
            title={`Tracking 2xx (${window5m.windowMinutes}m)`}
            value={`${window5m.tracking2xx}`}
            tone="info"
            detail={`5xx=${window5m.tracking5xx}`}
          />
          <StatCard
            title={`Forms 2xx (${window5m.windowMinutes}m)`}
            value={`${window5m.forms2xx}`}
            tone="info"
            detail={`5xx=${window5m.forms5xx}`}
          />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          <Panel title="Trafico ingesta (acumulado)">
            {chartsReady ? (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <BarChart width={640} height={300} data={ingestionBars} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="name" stroke="#334155" />
                  <YAxis stroke="#334155" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="ok2xx" fill="#16a34a" name="2xx" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="err4xx" fill="#f59e0b" name="4xx" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="err5xx" fill="#dc2626" name="5xx" radius={[6, 6, 0, 0]} />
                </BarChart>
              </div>
            ) : (
              <div style={{ height: "300px", display: "grid", placeItems: "center", color: "#64748b" }}>Inicializando grafico...</div>
            )}
            <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#64748b" }}>
              Los contadores son acumulados desde el ultimo restart del backend.
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#475569", wordBreak: "break-word" }}>
              tracking={JSON.stringify(metrics?.counters?.tracking_ingest_total ?? {})}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#475569", wordBreak: "break-word" }}>
              forms={JSON.stringify(metrics?.counters?.forms_ingest_total ?? {})}
            </p>
          </Panel>

          <Panel title="Colas y usuarios activos (ultimos puntos)">
            {chartsReady ? (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <LineChart width={640} height={300} data={points} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <XAxis dataKey="t" stroke="#334155" minTickGap={24} />
                  <YAxis stroke="#334155" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="online" stroke="#2563eb" strokeWidth={2} dot={false} name="Online" />
                  <Line type="monotone" dataKey="sse" stroke="#7c3aed" strokeWidth={2} dot={false} name="SSE" />
                  <Line type="monotone" dataKey="trackingQueue" stroke="#ea580c" strokeWidth={2} dot={false} name="Q tracking" />
                  <Line type="monotone" dataKey="formsQueue" stroke="#b45309" strokeWidth={2} dot={false} name="Q forms" />
                </LineChart>
              </div>
            ) : (
              <div style={{ height: "300px", display: "grid", placeItems: "center", color: "#64748b" }}>Inicializando grafico...</div>
            )}
          </Panel>
        </section>

        <Panel title="Latencias por ruta (backend)">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#e2e8f0" }}>
                  <th style={thStyle}>Ruta</th>
                  <th style={thStyle}>Count</th>
                  <th style={thStyle}>P50 ms</th>
                  <th style={thStyle}>P95 ms</th>
                  <th style={thStyle}>P99 ms</th>
                </tr>
              </thead>
              <tbody>
                {latencyRows.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={5}>
                      Sin datos de latencia.
                    </td>
                  </tr>
                ) : (
                  latencyRows.map((row) => (
                    <tr key={row.route}>
                      <td style={tdStyle}>{row.route}</td>
                      <td style={tdStyle}>{row.count}</td>
                      <td style={tdStyle}>{row.p50}</td>
                      <td style={tdStyle}>{row.p95}</td>
                      <td style={tdStyle}>{row.p99}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        border: "1px solid #cbd5e1",
        borderRadius: "14px",
        padding: "14px",
        boxShadow: "0 8px 22px rgba(15, 23, 42, 0.08)",
      }}
    >
      <h2 style={{ margin: "0 0 10px", fontSize: "16px" }}>{title}</h2>
      {children}
    </section>
  );
}

function StatCard({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "good" | "bad" | "warn" | "info" }) {
  const toneMap: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    good: { bg: "#ecfdf5", fg: "#166534", border: "#86efac" },
    bad: { bg: "#fef2f2", fg: "#991b1b", border: "#fca5a5" },
    warn: { bg: "#fff7ed", fg: "#9a3412", border: "#fdba74" },
    info: { bg: "#eff6ff", fg: "#1e3a8a", border: "#93c5fd" },
  };

  const colors = toneMap[tone];

  return (
    <article style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "12px" }}>
      <p style={{ margin: 0, fontSize: "12px", color: "#334155" }}>{title}</p>
      <p style={{ margin: "6px 0 4px", fontSize: "24px", fontWeight: 700, color: colors.fg }}>{value}</p>
      <p style={{ margin: 0, fontSize: "12px", color: "#475569" }}>{detail}</p>
    </article>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #cbd5e1",
  fontSize: "12px",
};

const tdStyle: CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "13px",
};
