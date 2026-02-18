"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { FormRecord } from "@/lib/services";
import type { EnrichedAgent } from "./tierra-map";

/* ========== Types ========== */

type Props = {
  forms: FormRecord[];
  agents: EnrichedAgent[];
  primaryColor: string;
  secondaryColor?: string;
};

type HourlyData = {
  hour: string;
  label: string;
  forms: number;
  agents: number;
};

type AgentActivityData = {
  name: string;
  forms: number;
  lastActive: string;
  status: string;
};

/* ========== Utils ========== */

function formatHour(date: Date): string {
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function getHourKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}-${date.getHours().toString().padStart(2, "0")}`;
}

/* ========== Component ========== */

export function ActivityCharts({ forms, agents, primaryColor, secondaryColor }: Props) {
  // Calculate hourly activity for the last 24 hours
  const hourlyData = useMemo((): HourlyData[] => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Initialize hours
    const hourMap = new Map<string, { forms: number; agents: Set<string> }>();
    for (let i = 0; i < 24; i++) {
      const hourDate = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
      const key = getHourKey(hourDate);
      hourMap.set(key, { forms: 0, agents: new Set() });
    }
    
    // Count forms per hour
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
    
    // Convert to array
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

  // Calculate agent activity ranking
  const agentActivity = useMemo((): AgentActivityData[] => {
    return agents
      .map((agent) => ({
        name: agent.name.split(" ")[0], // First name only
        forms: agent.forms_count,
        lastActive: formatHour(agent.lastSeen),
        status: agent.status,
      }))
      .sort((a, b) => b.forms - a.forms)
      .slice(0, 10);
  }, [agents]);

  // Calculate today's forms by agent
  const todayByAgent = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const agentCounts = new Map<string, { name: string; count: number }>();
    
    for (const form of forms) {
      const formDate = new Date(form.created_at);
      if (formDate >= today) {
        const agentId = form.agent_id || form.encuestador_id || "unknown";
        const agentName = form.encuestador || "Agente";
        
        const existing = agentCounts.get(agentId);
        if (existing) {
          existing.count++;
        } else {
          agentCounts.set(agentId, { name: agentName.split(" ")[0], count: 1 });
        }
      }
    }
    
    return Array.from(agentCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [forms]);

  // Calculate cumulative forms over time (last 7 days)
  const cumulativeData = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Group by day
    const dayMap = new Map<string, number>();
    const dayLabels: string[] = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = `${date.getMonth() + 1}/${date.getDate()}`;
      dayLabels.push(key);
      dayMap.set(key, 0);
    }
    
    for (const form of forms) {
      const formDate = new Date(form.created_at);
      if (formDate >= sevenDaysAgo) {
        const key = `${formDate.getMonth() + 1}/${formDate.getDate()}`;
        const current = dayMap.get(key) ?? 0;
        dayMap.set(key, current + 1);
      }
    }
    
    // Calculate cumulative
    let cumulative = 0;
    return dayLabels.map((day) => {
      cumulative += dayMap.get(day) ?? 0;
      return { day, daily: dayMap.get(day) ?? 0, cumulative };
    });
  }, [forms]);

  // Stats summary
  const stats = useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const formsLastHour = forms.filter((f) => new Date(f.created_at).getTime() > oneHourAgo).length;
    const formsToday = forms.filter((f) => new Date(f.created_at) >= today).length;
    const activeAgents = agents.filter((a) => a.status === "connected" || a.status === "idle").length;
    
    // Calculate average forms per hour (last 24h with activity)
    const hoursWithActivity = hourlyData.filter((h) => h.forms > 0).length;
    const avgPerHour = hoursWithActivity > 0 ? Math.round(hourlyData.reduce((sum, h) => sum + h.forms, 0) / hoursWithActivity) : 0;
    
    return { formsLastHour, formsToday, activeAgents, avgPerHour };
  }, [forms, agents, hourlyData]);

  const accentColor = secondaryColor || "#0d9488";

  return (
    <div style={S.container}>
      {/* Stats summary row */}
      <div style={S.statsRow}>
        <StatCard label="Última hora" value={stats.formsLastHour} icon="⏱" color={primaryColor} />
        <StatCard label="Hoy" value={stats.formsToday} icon="📊" color="#2563eb" />
        <StatCard label="Agentes activos" value={stats.activeAgents} icon="👥" color={accentColor} />
        <StatCard label="Promedio/hora" value={stats.avgPerHour} icon="📈" color="#8b5cf6" />
      </div>

      {/* Charts row */}
      <div style={S.chartsRow}>
        {/* Hourly activity area chart */}
        <div style={S.chartCard}>
          <div style={S.chartTitle}>Actividad últimas 24 horas</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={hourlyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorForms" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 9, fill: "#94a3b8" }} 
                axisLine={false} 
                tickLine={false}
                interval={2}
              />
              <YAxis 
                tick={{ fontSize: 9, fill: "#94a3b8" }} 
                axisLine={false} 
                tickLine={false} 
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={S.tooltip}
                labelStyle={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}
              />
              <Area 
                type="monotone" 
                dataKey="forms" 
                stroke={primaryColor} 
                strokeWidth={2}
                fill="url(#colorForms)" 
                name="Formularios"
              />
              <Line 
                type="monotone" 
                dataKey="agents" 
                stroke={accentColor} 
                strokeWidth={1.5}
                dot={false}
                name="Agentes"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Today's forms by agent */}
        <div style={S.chartCard}>
          <div style={S.chartTitle}>Formularios hoy por agente</div>
          {todayByAgent.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={todayByAgent} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: "#64748b" }} 
                  axisLine={false} 
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  contentStyle={S.tooltip}
                />
                <Bar dataKey="count" fill={primaryColor} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={S.noData}>Sin actividad hoy</div>
          )}
        </div>

        {/* Weekly cumulative */}
        <div style={S.chartCard}>
          <div style={S.chartTitle}>Progreso semanal</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={cumulativeData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="day" 
                tick={{ fontSize: 9, fill: "#94a3b8" }} 
                axisLine={false} 
                tickLine={false}
              />
              <YAxis 
                yAxisId="left"
                tick={{ fontSize: 9, fill: "#94a3b8" }} 
                axisLine={false} 
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 9, fill: "#94a3b8" }} 
                axisLine={false} 
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={S.tooltip}
                labelStyle={{ fontWeight: 600, color: "#1e293b", marginBottom: 4 }}
              />
              <Legend 
                wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                iconSize={8}
              />
              <Bar yAxisId="left" dataKey="daily" fill="#e2e8f0" radius={[2, 2, 0, 0]} name="Diarios" />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="cumulative" 
                stroke={primaryColor} 
                strokeWidth={2}
                dot={{ fill: primaryColor, r: 3 }}
                name="Acumulado"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ========== Sub-components ========== */

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div style={S.statCard}>
      <div style={S.statIcon}>{icon}</div>
      <div style={S.statContent}>
        <div style={{ ...S.statValue, color }}>{value}</div>
        <div style={S.statLabel}>{label}</div>
      </div>
    </div>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  },
  statsRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  statCard: {
    flex: "1 1 120px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    border: "1px solid #f1f5f9",
  },
  statIcon: {
    fontSize: 20,
  },
  statContent: {
    display: "flex",
    flexDirection: "column",
  },
  statValue: {
    fontSize: 20,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  chartsRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
  },
  chartCard: {
    flex: "1 1 280px",
    minWidth: 0,
    padding: 12,
    backgroundColor: "#fafafa",
    borderRadius: 8,
    border: "1px solid #f1f5f9",
  },
  chartTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 8,
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
