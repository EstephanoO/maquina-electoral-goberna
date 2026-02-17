"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { CampaignStats } from "@/lib/types";

/* ========== Types ========== */

type Props = {
  stats: CampaignStats;
  formsCount: number;
  connectedCount: number;
  primaryColor: string;
};

/* ========== Constants ========== */

const COLLAPSED_H = 44;
const EXPANDED_H = 220;

/* ========== Component ========== */

export function KpiPanel({ stats, formsCount, connectedCount, primaryColor }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { metas, totals, top_agents, agent_forms_chart } = stats;

  const datosProgress = metas.datos > 0 ? Math.min((totals.forms_count / metas.datos) * 100, 100) : 0;
  const votosProgress = metas.votos > 0 ? Math.min((totals.forms_count / metas.votos) * 100, 100) : 0;

  // Prepare agent chart data (top 8 agents sorted by count)
  const agentData = useMemo(() => {
    const source = agent_forms_chart.length > 0 ? agent_forms_chart : top_agents.map((a) => ({ id: a.id, name: a.name, count: a.forms_count }));
    return source
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((a) => ({ name: a.name.split(" ")[0], count: a.count }));
  }, [agent_forms_chart, top_agents]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: expanded ? EXPANDED_H : COLLAPSED_H,
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e2e8f0",
        transition: "height 0.25s cubic-bezier(0.4,0,0.2,1)",
        zIndex: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Toggle bar (always visible) ── */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={S.toggleBar}
      >
        <div style={S.toggleLeft}>
          <span style={S.toggleChevron}>{expanded ? "▼" : "▲"}</span>
          <span style={S.toggleLabel}>KPIs</span>
        </div>

        {/* Quick stats in collapsed bar */}
        <div style={S.quickStats}>
          <QuickStat label="DATOS" value={totals.forms_count} max={metas.datos} color="#2563eb" />
          <QuickStat label="HOY" value={totals.forms_today} color="#0d9488" />
          <QuickStat label="SEMANA" value={totals.forms_week} color="#1d4ed8" />
          <QuickStat label="ONLINE" value={connectedCount} color={connectedCount > 0 ? "#0d9488" : "#94a3b8"} />
        </div>
      </button>

      {/* ── Expanded content ── */}
      <div style={S.content}>
        {/* Progress gauges */}
        <div style={S.gauges}>
          <ProgressGauge label="Meta Datos" current={totals.forms_count} target={metas.datos} pct={datosProgress} color={primaryColor} />
          <ProgressGauge label="Meta Votos" current={0} target={metas.votos} pct={votosProgress} color={stats.campaign.color_secundario || primaryColor} />
        </div>

        {/* Agent forms bar chart */}
        <div style={S.chartWrap}>
          <div style={S.chartTitle}>Formularios por agente</div>
          {agentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={agentData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                  labelStyle={{ fontWeight: 700, color: "#1e293b" }}
                  cursor={{ fill: "rgba(37,99,235,0.06)" }}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={32} name="Registros" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={S.noData}>Sin datos de agentes</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========== Sub-components ========== */

function QuickStat({ label, value, max, color }: { label: string; value: number; max?: number; color: string }) {
  return (
    <div style={S.qStat}>
      <span style={{ ...S.qStatVal, color }}>{value.toLocaleString()}</span>
      {max != null && max > 0 && <span style={S.qStatMax}>/{max.toLocaleString()}</span>}
      <span style={S.qStatLabel}>{label}</span>
    </div>
  );
}

function ProgressGauge({ label, current, target, pct, color }: { label: string; current: number; target: number; pct: number; color: string }) {
  return (
    <div style={S.gauge}>
      <div style={S.gaugeTop}>
        <span style={S.gaugeLabel}>{label}</span>
        <span style={{ ...S.gaugePct, color }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={S.gaugeBar}>
        <div style={{ ...S.gaugeBarFill, width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div style={S.gaugeBottom}>
        <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }}>{current.toLocaleString()}</span>
        <span style={{ color: "#94a3b8", fontSize: 11 }}> / {target > 0 ? target.toLocaleString() : "—"}</span>
      </div>
    </div>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  toggleBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: COLLAPSED_H,
    padding: "0 16px",
    backgroundColor: "#ffffff",
    border: "none",
    cursor: "pointer",
    flexShrink: 0,
    width: "100%",
  },
  toggleLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  toggleChevron: {
    fontSize: 8,
    color: "#94a3b8",
  },
  toggleLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  },
  quickStats: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },

  qStat: {
    display: "flex",
    alignItems: "baseline",
    gap: 3,
  },
  qStatVal: {
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
  },
  qStatMax: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: 500,
  },
  qStatLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginLeft: 2,
  },

  content: {
    flex: 1,
    display: "flex",
    gap: 20,
    padding: "8px 20px 12px",
    overflow: "hidden",
  },

  gauges: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    minWidth: 180,
    justifyContent: "center",
  },
  gauge: {},
  gaugeTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  gaugeLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  gaugePct: {
    fontSize: 13,
    fontWeight: 800,
  },
  gaugeBar: {
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    overflow: "hidden",
  },
  gaugeBarFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.5s ease",
  },
  gaugeBottom: {
    marginTop: 3,
  },

  chartWrap: {
    flex: 1,
    minWidth: 0,
  },
  chartTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginBottom: 4,
  },
  noData: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 130,
    fontSize: 12,
    color: "#94a3b8",
  },
};
