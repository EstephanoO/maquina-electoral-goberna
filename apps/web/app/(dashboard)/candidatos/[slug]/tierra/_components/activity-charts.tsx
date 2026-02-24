"use client";

import { memo, useMemo } from "react";
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
import type { PipelinePeriod } from "./pipeline-filters";
import { KpiCard, ChartIcon, UsersIcon, ClockIcon, TrendIcon } from "./kpi-cards";

/* ========== Types ========== */

type Props = {
  forms: FormRecord[];
  prevForms: FormRecord[];
  agents: EnrichedAgent[];
  primaryColor: string;
  secondaryColor?: string;
  periodLabel: string;
  period: PipelinePeriod;
};

type TimeSeriesPoint = { label: string; forms: number; agents: number };

/* ========== Utils ========== */

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function formatDayLabel(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()}`;
}

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prev) / prev) * 100);
}

/* ========== Tooltip styles (inline required for Recharts) ========== */

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 11,
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
  padding: "8px 14px",
};

/* ========== Component ========== */

export const ActivityCharts = memo(function ActivityCharts({
  forms, prevForms, agents, primaryColor, secondaryColor, periodLabel, period,
}: Props) {
  const accentColor = secondaryColor || "#0d9488";
  const hasPrev = prevForms.length > 0 && period !== "all";

  /* ── Time series ── */
  const timeSeriesData = useMemo((): TimeSeriesPoint[] => {
    const now = new Date();

    if (period === "today") {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const hourMap = new Map<number, { forms: number; agents: Set<string> }>();
      for (let h = 0; h < 24; h++) hourMap.set(h, { forms: 0, agents: new Set() });

      for (const form of forms) {
        const d = new Date(form.created_at);
        if (d >= todayStart) {
          const bucket = hourMap.get(d.getHours());
          if (bucket) {
            bucket.forms++;
            if (form.agent_id || form.encuestador_id)
              bucket.agents.add(form.agent_id || form.encuestador_id || "");
          }
        }
      }

      const result: TimeSeriesPoint[] = [];
      for (let h = 0; h < 24; h++) {
        const bucket = hourMap.get(h)!;
        result.push({ label: `${h.toString().padStart(2, "0")}:00`, forms: bucket.forms, agents: bucket.agents.size });
      }
      return result;
    }

    const days = period === "month" ? 30 : period === "week" ? 7 : 14;
    const dayMap = new Map<string, { forms: number; agents: Set<string> }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (days - 1 - i));
      dayMap.set(getDayKey(d), { forms: 0, agents: new Set() });
    }

    for (const form of forms) {
      const d = new Date(form.created_at);
      const bucket = dayMap.get(getDayKey(d));
      if (bucket) {
        bucket.forms++;
        if (form.agent_id || form.encuestador_id)
          bucket.agents.add(form.agent_id || form.encuestador_id || "");
      }
    }

    const result: TimeSeriesPoint[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (days - 1 - i));
      const key = getDayKey(d);
      const bucket = dayMap.get(key);
      result.push({ label: formatDayLabel(d), forms: bucket?.forms ?? 0, agents: bucket?.agents.size ?? 0 });
    }
    return result;
  }, [forms, period]);

  /* ── Agent ranking (top 10) ── */
  const agentRanking = useMemo(() => {
    return agents
      .map((agent) => {
        const firstName = agent.name.split(" ")[0];
        return { id: agent.id, name: firstName.length > 10 ? `${firstName.slice(0, 9)}…` : firstName, fullName: agent.name, forms: agent.forms_count, status: agent.status };
      })
      .sort((a, b) => b.forms - a.forms)
      .slice(0, 10);
  }, [agents]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const totalForms = forms.length;
    const prevTotal = prevForms.length;
    const activeAgents = agents.filter((a) => a.status === "connected" || a.status === "idle").length;
    const avgPerAgent = agents.length > 0 ? Math.round(totalForms / agents.length) : 0;

    const uniqueAgents = new Set<string>();
    for (const f of forms) if (f.agent_id || f.encuestador_id) uniqueAgents.add(f.agent_id || f.encuestador_id || "");

    const prevUniqueAgents = new Set<string>();
    for (const f of prevForms) if (f.agent_id || f.encuestador_id) prevUniqueAgents.add(f.agent_id || f.encuestador_id || "");

    const peak = timeSeriesData.reduce((max, d) => d.forms > max.forms ? d : max, timeSeriesData[0]);

    return {
      totalForms, prevTotal, activeAgents, avgPerAgent,
      totalAgents: uniqueAgents.size, prevTotalAgents: prevUniqueAgents.size, peak,
      formsDelta: pctChange(totalForms, prevTotal),
      agentsDelta: pctChange(uniqueAgents.size, prevUniqueAgents.size),
    };
  }, [forms, prevForms, agents, timeSeriesData]);

  /* ── Ranking colors ── */
  const rankingColors = useMemo(() => [
    "#f59e0b", "#f59e0b", "#f59e0b",
    primaryColor, primaryColor,
    accentColor, accentColor,
    "#64748b", "#94a3b8", "#cbd5e1",
  ], [primaryColor, accentColor]);

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      {/* ═══ KPI strip ═══ */}
      <div className="grid grid-cols-4 gap-2.5">
        <KpiCard label="Registros" value={stats.totalForms} color={primaryColor} delta={hasPrev ? stats.formsDelta : undefined} deltaLabel={periodLabel} icon={<ChartIcon />} />
        <KpiCard label="Brigadistas" value={stats.totalAgents} color="#2563eb" delta={hasPrev ? stats.agentsDelta : undefined} deltaLabel={periodLabel} icon={<UsersIcon />} />
        <KpiCard label="Activos ahora" value={stats.activeAgents} color={accentColor} subtitle={`de ${agents.length}`} icon={<ClockIcon />} />
        <KpiCard label="Prom/agente" value={stats.avgPerAgent} color="#8b5cf6" subtitle={stats.peak?.forms > 0 ? `pico: ${stats.peak.label}` : undefined} icon={<TrendIcon />} />
      </div>

      {/* ═══ Charts row (2/3 timeline + 1/3 ranking) ═══ */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
        {/* Left: Activity timeline */}
        <div className="bg-slate-50/60 rounded-xl border border-slate-100 px-4 py-3 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Actividad {period === "today" ? "de hoy" : period === "week" ? "semanal" : period === "month" ? "mensual" : "general"}
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                <span className="text-[9px] text-slate-400">Registros</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-0.5 rounded-full border-b border-dashed" style={{ borderColor: accentColor }} />
                <span className="text-[9px] text-slate-400">Agentes</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={timeSeriesData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGradPipeline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={period === "month" ? 4 : period === "today" ? 3 : 0} />
              <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [String(value ?? 0), name === "forms" ? "Registros" : "Agentes"]} />
              <Area type="monotone" dataKey="forms" stroke={primaryColor} strokeWidth={2} fill="url(#areaGradPipeline)" name="forms" animationDuration={800} />
              <Area type="monotone" dataKey="agents" stroke={accentColor} strokeWidth={1.5} fill="transparent" strokeDasharray="4 2" name="agents" animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Agent ranking bars */}
        <div className="bg-slate-50/60 rounded-xl border border-slate-100 px-4 py-3 flex flex-col min-w-0 max-h-[320px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Rendimiento</span>
            <span className="text-[10px] text-slate-400 tabular-nums">{agents.length} agentes</span>
          </div>
          {agentRanking.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(210, agentRanking.length * 28)}>
              <BarChart data={agentRanking} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} width={80} interval={0} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value, _name, props) => { const entry = props.payload as (typeof agentRanking)[number]; return [String(value ?? 0), entry.fullName]; }} />
                <Bar dataKey="forms" radius={[0, 6, 6, 0]} maxBarSize={18} animationDuration={600}>
                  {agentRanking.map((entry, idx) => (
                    <Cell key={entry.id} fill={rankingColors[idx] ?? "#cbd5e1"} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center flex-1 text-xs text-slate-400">Sin datos de agentes</div>
          )}
        </div>
      </div>
    </div>
  );
});
