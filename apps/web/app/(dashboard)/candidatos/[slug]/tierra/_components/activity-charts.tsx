"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import type { FormRecord } from "@/lib/services";
import type { EnrichedAgent } from "./types";

/* ========== Types ========== */

type Props = {
  forms: FormRecord[];
  agents: EnrichedAgent[];
  allForms: FormRecord[];
  allAgents: EnrichedAgent[];
  primaryColor: string;
  secondaryColor?: string;
  selectionLabel?: string | null;
};

type HourlyData = {
  hour: string;
  label: string;
  forms: number;
  agents: number;
};

/* ========== Utils ========== */

function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function getHourKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}-${date.getHours().toString().padStart(2, "0")}`;
}

/* ========== Component ========== */

export function ActivityCharts({ forms, agents, allForms, allAgents, primaryColor, secondaryColor, selectionLabel }: Props) {
  const hasSelection = !!selectionLabel;
  const accentColor = secondaryColor || "#0d9488";

  // Calculate hourly activity for the last 24 hours
  const hourlyData = useMemo((): HourlyData[] => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const hourMap = new Map<string, { forms: number; agents: Set<string> }>();
    for (let i = 0; i < 24; i++) {
      const hourDate = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
      const key = getHourKey(hourDate);
      hourMap.set(key, { forms: 0, agents: new Set() });
    }
    
    for (const form of forms) {
      const formDate = new Date(form.created_at);
      if (formDate >= twentyFourHoursAgo) {
        const key = getHourKey(formDate);
        const data = hourMap.get(key);
        if (data) {
          data.forms++;
          if (form.agent_id || form.encuestador_id) {
            data.agents.add(form.agent_id || form.encuestador_id || "");
          }
        }
      }
    }
    
    const result: HourlyData[] = [];
    for (let i = 0; i < 24; i++) {
      const hourDate = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
      const key = getHourKey(hourDate);
      const data = hourMap.get(key);
      result.push({
        hour: key,
        label: formatHourLabel(hourDate.getHours()),
        forms: data?.forms ?? 0,
        agents: data?.agents.size ?? 0,
      });
    }
    
    return result;
  }, [forms]);

  // Calculate agent performance ranking
  const agentRanking = useMemo(() => {
    return agents
      .map((agent) => ({
        id: agent.id,
        name: agent.name.length > 12 ? agent.name.split(" ")[0] : agent.name,
        forms: agent.forms_count,
        status: agent.status,
      }))
      .sort((a, b) => b.forms - a.forms)
      .slice(0, 8);
  }, [agents]);

  // Stats summary
  const stats = useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const formsLastHour = forms.filter((f) => new Date(f.created_at).getTime() > oneHourAgo).length;
    const formsToday = forms.filter((f) => new Date(f.created_at) >= today).length;
    const activeAgents = agents.filter((a) => a.status === "connected" || a.status === "idle").length;
    const totalForms = forms.length;
    
    // Peak hour
    const peakHour = hourlyData.reduce((max, h) => h.forms > max.forms ? h : max, hourlyData[0]);
    
    // Average forms per agent
    const avgPerAgent = agents.length > 0 ? Math.round(totalForms / agents.length) : 0;
    
    // Velocity: forms per hour in last 3 hours
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;
    const formsLast3h = forms.filter((f) => new Date(f.created_at).getTime() > threeHoursAgo).length;
    const velocity = Math.round(formsLast3h / 3);

    // Totals from all data (not filtered)
    const allTotal = allForms.length;
    const allAgentsTotal = allAgents.length;
    
    return { formsLastHour, formsToday, activeAgents, totalForms, peakHour, avgPerAgent, velocity, allTotal, allAgentsTotal };
  }, [forms, agents, hourlyData, allForms, allAgents]);

  // Status bar colors
  const statusColors: Record<string, string> = {
    connected: "#0d9488",
    idle: "#d97706",
    inactive: "#94a3b8",
  };

  return (
    <div style={S.container}>
      {/* Selection context banner */}
      {hasSelection && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          backgroundColor: `${primaryColor}10`,
          borderRadius: 6,
          border: `1px solid ${primaryColor}25`,
          marginBottom: 4,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: primaryColor }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: primaryColor }}>
            Metricas de: {selectionLabel}
          </span>
          <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>
            {stats.totalForms} de {stats.allTotal} registros
          </span>
        </div>
      )}

      <div style={S.mainGrid}>
        {/* Left: KPI Cards (2x2) */}
        <div style={S.kpiGrid}>
          <KpiCard
            label="Ultima hora"
            value={stats.formsLastHour}
            color={primaryColor}
            trend={stats.velocity > 0 ? `${stats.velocity}/h` : undefined}
            icon={<ClockIcon />}
          />
          <KpiCard
            label="Hoy"
            value={stats.formsToday}
            color="#2563eb"
            subtitle={`de ${stats.totalForms} total`}
            icon={<ChartIcon />}
          />
          <KpiCard
            label="Activos"
            value={stats.activeAgents}
            color={accentColor}
            subtitle={`de ${agents.length}`}
            icon={<UsersIcon />}
          />
          <KpiCard
            label="Prom/agente"
            value={stats.avgPerAgent}
            color="#8b5cf6"
            subtitle={stats.peakHour ? `pico ${stats.peakHour.label}` : undefined}
            icon={<TrendIcon />}
          />
        </div>

        {/* Center: 24h activity chart */}
        <div style={S.chartCard}>
          <div style={S.chartHeader}>
            <span style={S.chartTitle}>Actividad 24h</span>
            {stats.peakHour && stats.peakHour.forms > 0 && (
              <span style={{ fontSize: 10, color: "#94a3b8" }}>
                Pico: <span style={{ color: primaryColor, fontWeight: 700 }}>{stats.peakHour.forms}</span> a las {stats.peakHour.label}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={hourlyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 9, fill: "#94a3b8" }} 
                axisLine={false} 
                tickLine={false}
                interval={3}
              />
              <YAxis 
                tick={{ fontSize: 9, fill: "#94a3b8" }} 
                axisLine={false} 
                tickLine={false} 
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={S.tooltip}
                labelFormatter={(l) => `${l}`}
                formatter={(value, name) => [String(value ?? 0), name === "forms" ? "Registros" : "Agentes"]}
              />
              <Area 
                type="monotone" 
                dataKey="forms" 
                stroke={primaryColor} 
                strokeWidth={2}
                fill="url(#areaGrad)" 
                name="forms"
                animationDuration={800}
              />
              <Area 
                type="monotone" 
                dataKey="agents" 
                stroke={accentColor} 
                strokeWidth={1.5}
                fill="transparent"
                strokeDasharray="4 2"
                name="agents"
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Agent ranking bars */}
        <div style={S.chartCard}>
          <div style={S.chartHeader}>
            <span style={S.chartTitle}>Rendimiento</span>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>{agents.length} agentes</span>
          </div>
          {agentRanking.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={agentRanking} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: "#64748b" }} 
                  axisLine={false} 
                  tickLine={false}
                  width={65}
                />
                <Tooltip
                  contentStyle={S.tooltip}
                  formatter={(value) => [String(value ?? 0), "Registros"]}
                />
                <Bar dataKey="forms" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={600}>
                  {agentRanking.map((entry) => (
                    <Cell key={entry.id} fill={statusColors[entry.status] ?? primaryColor} fillOpacity={0.85} />
                  ))}
                </Bar>
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

/* ========== KPI Card ========== */

function KpiCard({ label, value, color, trend, subtitle, icon }: { 
  label: string; value: number; color: string; trend?: string; subtitle?: string; icon: React.ReactNode;
}) {
  return (
    <div style={S.kpiCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ ...S.kpiIcon, color }}>{icon}</span>
        {trend && (
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#10b981",
            backgroundColor: "#ecfdf5",
            padding: "2px 6px",
            borderRadius: 4,
          }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ ...S.kpiValue, color }}>{value}</div>
      <div style={S.kpiLabel}>{label}</div>
      {subtitle && <div style={S.kpiSubtitle}>{subtitle}</div>}
    </div>
  );
}

/* ========== Icons ========== */

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Reloj">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Grafico">
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Usuarios">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Tendencia">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 16px",
    backgroundColor: "#ffffff",
    height: "100%",
    overflow: "hidden",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "auto 1fr 260px",
    gap: 12,
    flex: 1,
    minHeight: 0,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    width: 240,
  },
  kpiCard: {
    padding: "10px 12px",
    backgroundColor: "#fafbfc",
    borderRadius: 8,
    border: "1px solid #f1f5f9",
  },
  kpiIcon: {
    display: "flex",
    alignItems: "center",
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1.1,
    fontVariantNumeric: "tabular-nums",
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginTop: 2,
  },
  kpiSubtitle: {
    fontSize: 9,
    color: "#cbd5e1",
    marginTop: 1,
  },
  chartCard: {
    backgroundColor: "#fafbfc",
    borderRadius: 8,
    border: "1px solid #f1f5f9",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  chartHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  chartTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  tooltip: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 11,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    padding: "8px 12px",
  },
  noData: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 160,
    fontSize: 12,
    color: "#94a3b8",
  },
};
