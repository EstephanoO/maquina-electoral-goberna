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

/* ========== Tooltip styles (inline needed for Recharts) ========== */

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 11,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

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
    <div className="flex flex-col gap-2 px-4 py-3 bg-white h-full overflow-hidden">
      {/* Selection context banner */}
      {hasSelection && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md mb-1" style={{ backgroundColor: `${primaryColor}10`, border: `1px solid ${primaryColor}25` }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
          <span className="text-[11px] font-semibold" style={{ color: primaryColor }}>
            Metricas de: {selectionLabel}
          </span>
          <span className="text-[10px] text-slate-400 ml-auto">
            {stats.totalForms} de {stats.allTotal} registros
          </span>
        </div>
      )}

      <div className="grid flex-1 min-h-0 gap-3" style={{ gridTemplateColumns: "auto 1fr 260px" }}>
        {/* Left: KPI Cards (2x2) */}
        <div className="grid grid-cols-2 gap-2 w-60">
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
        <div className="bg-slate-50/80 rounded-lg border border-slate-100 px-3 py-2.5 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Actividad 24h</span>
            {stats.peakHour && stats.peakHour.forms > 0 && (
              <span className="text-[10px] text-slate-400">
                Pico: <span className="font-bold" style={{ color: primaryColor }}>{stats.peakHour.forms}</span> a las {stats.peakHour.label}
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
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={3} />
              <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => `${l}`}
                formatter={(value, name) => [String(value ?? 0), name === "forms" ? "Registros" : "Agentes"]}
              />
              <Area type="monotone" dataKey="forms" stroke={primaryColor} strokeWidth={2} fill="url(#areaGrad)" name="forms" animationDuration={800} />
              <Area type="monotone" dataKey="agents" stroke={accentColor} strokeWidth={1.5} fill="transparent" strokeDasharray="4 2" name="agents" animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Agent ranking bars */}
        <div className="bg-slate-50/80 rounded-lg border border-slate-100 px-3 py-2.5 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Rendimiento</span>
            <span className="text-[10px] text-slate-400">{agents.length} agentes</span>
          </div>
          {agentRanking.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={agentRanking} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={65} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [String(value ?? 0), "Registros"]} />
                <Bar dataKey="forms" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={600}>
                  {agentRanking.map((entry) => (
                    <Cell key={entry.id} fill={statusColors[entry.status] ?? primaryColor} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-xs text-slate-400">Sin datos de agentes</div>
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
    <div className="px-3 py-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center" style={{ color }}>{icon}</span>
        {trend && (
          <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">
            {trend}
          </span>
        )}
      </div>
      <div className="text-[22px] font-extrabold leading-tight tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{label}</div>
      {subtitle && <div className="text-[9px] text-slate-300 mt-px">{subtitle}</div>}
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
