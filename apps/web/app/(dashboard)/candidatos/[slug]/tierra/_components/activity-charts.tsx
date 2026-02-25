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
import type { PipelinePeriod, PipelineDateRanges } from "./pipeline-filters";
import { KpiCard, ChartIcon, UsersIcon, ClockIcon, TrendIcon } from "./kpi-cards";

/* ========== Types ========== */

type Props = {
  forms: FormRecord[];
  prevForms: FormRecord[];
  primaryColor: string;
  secondaryColor?: string;
  periodLabel: string;
  period: PipelinePeriod;
  dateRanges: PipelineDateRanges;
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

/** Build day buckets between two dates (inclusive start, exclusive end). */
function buildDayBuckets(from: Date, to: Date): Map<string, { forms: number; agents: Set<string> }> {
  const map = new Map<string, { forms: number; agents: Set<string> }>();
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    map.set(getDayKey(cursor), { forms: 0, agents: new Set() });
    cursor.setDate(cursor.getDate() + 1);
  }
  return map;
}

/** Sort day keys chronologically and produce TimeSeries. */
function dayMapToSeries(dayMap: Map<string, { forms: number; agents: Set<string> }>): TimeSeriesPoint[] {
  return [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return { label: formatDayLabel(date), forms: bucket.forms, agents: bucket.agents.size };
    });
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
  forms, prevForms, primaryColor, secondaryColor, periodLabel, period, dateRanges,
}: Props) {
  const accentColor = secondaryColor || "#0d9488";
  const hasPrev = prevForms.length > 0 && period !== "all";

  /* ── Time series — buckets match actual period dates ── */
  const timeSeriesData = useMemo((): TimeSeriesPoint[] => {
    const now = new Date();

    /* TODAY: hour buckets 0..currentHour */
    if (period === "today") {
      const currentHour = now.getHours();
      const hourMap = new Map<number, { forms: number; agents: Set<string> }>();
      for (let h = 0; h <= currentHour; h++) hourMap.set(h, { forms: 0, agents: new Set() });

      for (const form of forms) {
        const d = new Date(form.created_at);
        const bucket = hourMap.get(d.getHours());
        if (bucket) {
          bucket.forms++;
          const agentKey = form.agent_id || form.encuestador_id;
          if (agentKey) bucket.agents.add(agentKey);
        }
      }

      const result: TimeSeriesPoint[] = [];
      for (let h = 0; h <= currentHour; h++) {
        const bucket = hourMap.get(h)!;
        result.push({ label: `${h.toString().padStart(2, "0")}:00`, forms: bucket.forms, agents: bucket.agents.size });
      }
      return result;
    }

    /* WEEK / MONTH: use actual period boundaries from dateRanges */
    if (period === "week" || period === "month") {
      const from = new Date(dateRanges.current.from);
      const to = new Date(dateRanges.current.to);
      const dayMap = buildDayBuckets(from, to);

      for (const form of forms) {
        const d = new Date(form.created_at);
        const bucket = dayMap.get(getDayKey(d));
        if (bucket) {
          bucket.forms++;
          const agentKey = form.agent_id || form.encuestador_id;
          if (agentKey) bucket.agents.add(agentKey);
        }
      }

      return dayMapToSeries(dayMap);
    }

    /* ALL: derive range from actual form data (earliest → today) */
    if (forms.length === 0) return [];

    let earliest = now.getTime();
    let latest = 0;
    for (const form of forms) {
      const ts = new Date(form.created_at).getTime();
      if (ts < earliest) earliest = ts;
      if (ts > latest) latest = ts;
    }

    const from = new Date(earliest);
    from.setHours(0, 0, 0, 0);
    const to = new Date(latest);
    to.setDate(to.getDate() + 1);
    to.setHours(0, 0, 0, 0);

    const dayMap = buildDayBuckets(from, to);

    for (const form of forms) {
      const d = new Date(form.created_at);
      const bucket = dayMap.get(getDayKey(d));
      if (bucket) {
        bucket.forms++;
        const agentKey = form.agent_id || form.encuestador_id;
        if (agentKey) bucket.agents.add(agentKey);
      }
    }

    return dayMapToSeries(dayMap);
  }, [forms, period, dateRanges]);

  /* ── Agent ranking (top 10) — computed from filtered forms, not unfiltered agents ── */
  const agentRanking = useMemo(() => {
    const countMap = new Map<string, { id: string; name: string; count: number }>();
    for (const form of forms) {
      const agentId = form.agent_id || form.encuestador_id;
      const agentName = form.encuestador || "Desconocido";
      if (!agentId) continue;
      const existing = countMap.get(agentId);
      if (existing) {
        existing.count++;
      } else {
        countMap.set(agentId, { id: agentId, name: agentName, count: 1 });
      }
    }

    return [...countMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((entry) => {
        const firstName = entry.name.split(" ")[0];
        return {
          id: entry.id,
          name: firstName.length > 10 ? `${firstName.slice(0, 9)}…` : firstName,
          fullName: entry.name,
          forms: entry.count,
        };
      });
  }, [forms]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const totalForms = forms.length;
    const prevTotal = prevForms.length;

    const uniqueAgents = new Set<string>();
    for (const f of forms) {
      const key = f.agent_id || f.encuestador_id;
      if (key) uniqueAgents.add(key);
    }

    const prevUniqueAgents = new Set<string>();
    for (const f of prevForms) {
      const key = f.agent_id || f.encuestador_id;
      if (key) prevUniqueAgents.add(key);
    }

    const avgPerAgent = uniqueAgents.size > 0 ? Math.round(totalForms / uniqueAgents.size) : 0;
    const peak = timeSeriesData.length > 0
      ? timeSeriesData.reduce((max, d) => d.forms > max.forms ? d : max, timeSeriesData[0])
      : undefined;

    return {
      totalForms, prevTotal, avgPerAgent,
      totalAgents: uniqueAgents.size, prevTotalAgents: prevUniqueAgents.size, peak,
      formsDelta: pctChange(totalForms, prevTotal),
      agentsDelta: pctChange(uniqueAgents.size, prevUniqueAgents.size),
    };
  }, [forms, prevForms, timeSeriesData]);

  /* ── Ranking colors ── */
  const rankingColors = useMemo(() => [
    "#f59e0b", "#f59e0b", "#f59e0b",
    primaryColor, primaryColor,
    accentColor, accentColor,
    "#64748b", "#94a3b8", "#cbd5e1",
  ], [primaryColor, accentColor]);

  /* ── Adaptive XAxis interval ── */
  const xInterval = useMemo(() => {
    const len = timeSeriesData.length;
    if (len <= 7) return 0;
    if (len <= 14) return 1;
    if (len <= 31) return 4;
    return Math.floor(len / 8);
  }, [timeSeriesData]);

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3">
      {/* ═══ KPI strip ═══ */}
      <div className="grid grid-cols-4 gap-2.5">
        <KpiCard label="Registros" value={stats.totalForms} color={primaryColor} delta={hasPrev ? stats.formsDelta : undefined} deltaLabel={periodLabel} icon={<ChartIcon />} />
        <KpiCard label="Brigadistas" value={stats.totalAgents} color="#2563eb" delta={hasPrev ? stats.agentsDelta : undefined} deltaLabel={periodLabel} icon={<UsersIcon />} />
        <KpiCard label="Prom/agente" value={stats.avgPerAgent} color={accentColor} subtitle={stats.peak && stats.peak.forms > 0 ? `pico: ${stats.peak.label}` : undefined} icon={<ClockIcon />} />
        <KpiCard label="Top agente" value={agentRanking[0]?.forms ?? 0} color="#8b5cf6" subtitle={agentRanking[0]?.fullName} icon={<TrendIcon />} />
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
          {timeSeriesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={timeSeriesData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGradPipeline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={primaryColor} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={primaryColor} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={xInterval} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [String(value ?? 0), name === "forms" ? "Registros" : "Agentes"]} />
                <Area type="monotone" dataKey="forms" stroke={primaryColor} strokeWidth={2} fill="url(#areaGradPipeline)" name="forms" animationDuration={800} />
                <Area type="monotone" dataKey="agents" stroke={accentColor} strokeWidth={1.5} fill="transparent" strokeDasharray="4 2" name="agents" animationDuration={800} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[170px] text-xs text-slate-400">Sin registros en este periodo</div>
          )}
        </div>

        {/* Right: Agent ranking bars */}
        <div className="bg-slate-50/60 rounded-xl border border-slate-100 px-4 py-3 flex flex-col min-w-0 max-h-[260px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Rendimiento</span>
            <span className="text-[10px] text-slate-400 tabular-nums">{stats.totalAgents} agentes</span>
          </div>
          {agentRanking.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(170, agentRanking.length * 24)}>
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
