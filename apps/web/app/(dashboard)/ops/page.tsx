"use client";

import { PageHeader, Button } from "../../../lib/ui";
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

import { StatCard, Panel } from "./_components";
import { thStyle, tdStyle } from "./ops-styles";
import { useOpsData } from "./use-ops-data";

export default function OpsDashboardPage() {
  const {
    health, ready, agentsHealth, metrics, liveAgents,
    system, systemAvailable, points, lastError, chartsReady,
    latencyRows, ingestionBars, outcomeLatencyRows, opsAlerts,
    window5m, trackingWindowTotal, formsWindowTotal,
    trackingWindow4xxRate, formsWindow4xxRate,
  } = useOpsData();

  return (
    <main style={{ minHeight: "100vh", color: "var(--color-text-primary)" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "24px 16px 32px" }}>
        <PageHeader
          title="Ops Dashboard"
          description="Tracking Expo + Backend + cola write-behind en una sola vista."
          breadcrumbs={[{ label: "Dashboard", href: "/home" }, { label: "Operaciones" }]}
          actions={
            <a href="/home" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="sm">Volver al mapa</Button>
            </a>
          }
        />

        {lastError ? (
          <p style={{ margin: "0 0 14px", padding: "10px 12px", borderRadius: "10px", background: "var(--color-error-bg)", color: "var(--color-error)", border: "1px solid var(--color-error-border)" }}>
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

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          {opsAlerts.map((alert) => (
            <StatCard key={alert.label} title={alert.label} value={alert.value} tone={alert.tone} detail={alert.detail} />
          ))}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          <Panel title="Trafico ingesta (acumulado)">
            {chartsReady ? (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <BarChart width={640} height={300} data={ingestionBars} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-strong)" />
                  <XAxis dataKey="name" stroke="var(--color-text-primary)" />
                  <YAxis stroke="var(--color-text-primary)" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="ok2xx" fill="var(--color-success)" name="2xx" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="err4xx" fill="var(--color-warning)" name="4xx" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="err5xx" fill="var(--color-error)" name="5xx" radius={[6, 6, 0, 0]} />
                </BarChart>
              </div>
            ) : (
              <div style={{ height: "300px", display: "grid", placeItems: "center", color: "var(--color-text-tertiary)" }}>Inicializando gráfico...</div>
            )}
            <p style={{ margin: "10px 0 0", fontSize: "12px", color: "var(--color-text-tertiary)" }}>
              Los contadores son acumulados desde el último restart del backend.
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-text-secondary)", wordBreak: "break-word" }}>
              tracking={JSON.stringify(metrics?.counters?.tracking_ingest_total ?? {})}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-text-secondary)", wordBreak: "break-word" }}>
              forms={JSON.stringify(metrics?.counters?.forms_ingest_total ?? {})}
            </p>
          </Panel>

          <Panel title="Colas y usuarios activos (últimos puntos)">
            {chartsReady ? (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <LineChart width={640} height={300} data={points} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-strong)" />
                  <XAxis dataKey="t" stroke="var(--color-text-primary)" minTickGap={24} />
                  <YAxis stroke="var(--color-text-primary)" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="online" stroke="var(--color-info)" strokeWidth={2} dot={false} name="Online" />
                  <Line type="monotone" dataKey="sse" stroke="var(--color-accent)" strokeWidth={2} dot={false} name="SSE" />
                  <Line type="monotone" dataKey="trackingQueue" stroke="var(--color-warning)" strokeWidth={2} dot={false} name="Q tracking" />
                  <Line type="monotone" dataKey="formsQueue" stroke="var(--color-error)" strokeWidth={2} dot={false} name="Q forms" />
                </LineChart>
              </div>
            ) : (
              <div style={{ height: "300px", display: "grid", placeItems: "center", color: "var(--color-text-tertiary)" }}>Inicializando gráfico...</div>
            )}
          </Panel>
        </section>

        <Panel title="Latencias por ruta (backend)">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-surface-active)" }}>
                  <th style={thStyle}>Ruta</th>
                  <th style={thStyle}>Count</th>
                  <th style={thStyle}>P50 ms</th>
                  <th style={thStyle}>P90 ms</th>
                  <th style={thStyle}>P95 ms</th>
                  <th style={thStyle}>P99 ms</th>
                </tr>
              </thead>
              <tbody>
                {latencyRows.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={6}>
                      Sin datos de latencia.
                    </td>
                  </tr>
                ) : (
                  latencyRows.map((row) => (
                    <tr key={row.route}>
                      <td style={tdStyle}>{row.route}</td>
                      <td style={tdStyle}>{row.count}</td>
                      <td style={tdStyle}>{row.p50}</td>
                      <td style={tdStyle}>{row.p90}</td>
                      <td style={tdStyle}>{row.p95}</td>
                      <td style={tdStyle}>{row.p99}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Latencias por outcome (tracking/forms)">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-surface-active)" }}>
                  <th style={thStyle}>Stream</th>
                  <th style={thStyle}>Outcome</th>
                  <th style={thStyle}>Count</th>
                  <th style={thStyle}>P50 ms</th>
                  <th style={thStyle}>P90 ms</th>
                  <th style={thStyle}>P95 ms</th>
                  <th style={thStyle}>P99 ms</th>
                </tr>
              </thead>
              <tbody>
                {outcomeLatencyRows.length === 0 ? (
                  <tr>
                    <td style={tdStyle} colSpan={7}>
                      Sin datos de latencia por outcome.
                    </td>
                  </tr>
                ) : (
                  outcomeLatencyRows.map((row) => (
                    <tr key={`${row.stream}-${row.outcome}`}>
                      <td style={tdStyle}>{row.stream}</td>
                      <td style={tdStyle}>{row.outcome}</td>
                      <td style={tdStyle}>{row.count}</td>
                      <td style={tdStyle}>{row.p50}</td>
                      <td style={tdStyle}>{row.p90}</td>
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
