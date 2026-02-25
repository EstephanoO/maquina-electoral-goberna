"use client";

import { useState, useMemo } from "react";
import type { CmsBrigadistaMetrics } from "@/lib/types";

/* ========== Types ========== */

type SortKey = "total_captures" | "goal_pct";

type Props = {
  brigadistas: CmsBrigadistaMetrics[];
  primaryColor: string;
  /** Individual goal per brigadista (total for the campaign) */
  goalPerBrigadista: number;
  /** Required datos per brigadista per day */
  goalPerBrigadistaPerDay: number;
  /** Period-adaptive goal per brigadista (matches selected period) */
  periodGoalPerBrig: number;
  /** Currently selected period */
  period: "today" | "week" | "month" | "all";
  /** Days remaining to deadline */
  daysRemaining: number;
};

/* ========== Constants ========== */

const MEDAL_COLORS = ["#f59e0b", "#94a3b8", "#cd7f32"] as const;

const PERIOD_LABELS: Record<Props["period"], string> = {
  today: "Meta del dia",
  week: "Meta semanal",
  month: "Meta mensual",
  all: "Meta total",
};

/* ========== Component ========== */

export function BrigadistaTable({ brigadistas, primaryColor, goalPerBrigadista, goalPerBrigadistaPerDay, periodGoalPerBrig, period, daysRemaining }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_captures");
  const [sortAsc, setSortAsc] = useState(false);

  const enriched = useMemo(() => {
    return brigadistas.map((b) => {
      // Overall status uses total goal (are they on track for the campaign deadline?)
      const totalGoalPct = goalPerBrigadista > 0 ? (b.total_captures / goalPerBrigadista) * 100 : 0;
      const totalRemaining = Math.max(goalPerBrigadista - b.total_captures, 0);
      const needsPerDay = daysRemaining > 0 ? Math.ceil(totalRemaining / daysRemaining) : 0;
      const onTrack = needsPerDay <= goalPerBrigadistaPerDay;
      const status: "ahead" | "on_track" | "behind" | "done" =
        totalGoalPct >= 100 ? "done" :
        needsPerDay < goalPerBrigadistaPerDay * 0.8 ? "ahead" :
        onTrack ? "on_track" : "behind";

      // Period-adaptive display values
      const periodPct = periodGoalPerBrig > 0 ? (b.total_captures / periodGoalPerBrig) * 100 : 0;
      const periodRemaining = Math.max(periodGoalPerBrig - b.total_captures, 0);

      return {
        ...b,
        goalPct: periodPct,
        remaining: periodRemaining,
        needsPerDay,
        onTrack,
        status,
        goal_pct: periodPct,
      };
    });
  }, [brigadistas, goalPerBrigadista, goalPerBrigadistaPerDay, periodGoalPerBrig, daysRemaining]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.full_name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? diff : -diff;
    });
  }, [enriched, search, sortKey, sortAsc]);

  // Summary stats
  const summary = useMemo(() => {
    const done = enriched.filter((b) => b.status === "done").length;
    const ahead = enriched.filter((b) => b.status === "ahead").length;
    const onTrack = enriched.filter((b) => b.status === "on_track").length;
    const behind = enriched.filter((b) => b.status === "behind").length;
    return { done, ahead, onTrack, behind };
  }, [enriched]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2 flex-1 py-1.5 px-3 rounded-lg border border-slate-200/80 bg-slate-50/60 focus-within:border-slate-300 focus-within:bg-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar brigadista..."
            className="flex-1 border-none outline-none bg-transparent text-[13px] text-slate-700 placeholder:text-slate-300"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="w-5 h-5 rounded-full border-none bg-slate-200 text-slate-500 cursor-pointer text-[10px] flex items-center justify-center hover:bg-slate-300 transition-colors" aria-label="Limpiar">
              x
            </button>
          )}
        </div>

        {/* Status summary pills */}
        <div className="flex items-center gap-1.5 shrink-0">
          {summary.done > 0 && <StatusPill count={summary.done} color="#10b981" label="Meta" />}
          {summary.ahead > 0 && <StatusPill count={summary.ahead} color="#3b82f6" label="Adelante" />}
          {summary.onTrack > 0 && <StatusPill count={summary.onTrack} color="#f59e0b" label="En ritmo" />}
          {summary.behind > 0 && <StatusPill count={summary.behind} color="#ef4444" label="Atras" />}
        </div>

        <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
          {filtered.length} brigadista{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Goal reference bar — period-adaptive ── */}
      {periodGoalPerBrig > 0 && (
        <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-50/80 border-b border-slate-100 shrink-0">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{PERIOD_LABELS[period]}:</span>
          <span className="text-[11px] font-bold text-slate-600 tabular-nums">{periodGoalPerBrig.toLocaleString()} datos/brig</span>
          <span className="text-slate-200">|</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Ritmo:</span>
          <span className="text-[11px] font-bold text-slate-600 tabular-nums">{goalPerBrigadistaPerDay.toLocaleString()}/dia</span>
          <span className="text-slate-200">|</span>
          <span className={`text-[11px] font-bold tabular-nums ${daysRemaining <= 7 ? "text-red-500" : daysRemaining <= 14 ? "text-amber-500" : "text-slate-600"}`}>
            {daysRemaining} dias restantes
          </span>
        </div>
      )}

      {/* ── Table header ── */}
      <div className="grid grid-cols-[28px_1fr_100px_80px_80px] gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/60 shrink-0 items-center">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">#</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Brigadista</span>
        <button type="button" onClick={() => handleSort("goal_pct")} className="text-[9px] font-semibold uppercase tracking-wider text-center cursor-pointer bg-transparent border-none text-slate-500 hover:text-slate-700" title="Ordenar por % de meta">
          Progreso{sortArrow("goal_pct")}
        </button>
        <button type="button" onClick={() => handleSort("total_captures")} className="text-[9px] font-semibold uppercase tracking-wider text-center cursor-pointer bg-transparent border-none text-slate-500 hover:text-slate-700" title="Ordenar por registros">
          Registros{sortArrow("total_captures")}
        </button>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center">Faltan</span>
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <span className="text-[13px] font-semibold text-slate-500">Sin brigadistas</span>
            <span className="text-xs text-slate-400">{search ? "Intenta con otra busqueda" : "Los brigadistas apareceran cuando capturen datos"}</span>
          </div>
        ) : (
          filtered.map((b, idx) => (
            <BrigadistaRow
              key={b.brigadista_id}
              brigadista={b}
              rank={idx + 1}
              primaryColor={primaryColor}
              isEven={idx % 2 === 1}
              periodGoal={periodGoalPerBrig}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ========== Row ========== */

type EnrichedBrigadista = CmsBrigadistaMetrics & {
  goalPct: number;
  remaining: number;
  needsPerDay: number;
  onTrack: boolean;
  status: "ahead" | "on_track" | "behind" | "done";
};

function BrigadistaRow({ brigadista: b, rank, primaryColor, isEven, periodGoal }: {
  brigadista: EnrichedBrigadista; rank: number; primaryColor: string; isEven: boolean; periodGoal: number;
}) {
  const isMedal = rank <= 3;

  const statusColor = {
    done: "#10b981",
    ahead: "#3b82f6",
    on_track: "#f59e0b",
    behind: "#ef4444",
  }[b.status];

  const statusLabel = {
    done: "Meta cumplida",
    ahead: "Adelante",
    on_track: "En ritmo",
    behind: `Necesita ${b.needsPerDay}/dia`,
  }[b.status];

  const goalPctClamped = Math.min(b.goalPct, 100);

  return (
    <div
      className={`grid grid-cols-[28px_1fr_100px_80px_80px] gap-2 px-4 items-center min-h-[52px] border-b border-slate-50 transition-colors hover:bg-slate-50/80 ${isEven ? "bg-slate-50/40" : ""}`}
      title={`${b.full_name} — ${b.email} — ${b.goalPct.toFixed(0)}% de meta`}
    >
      {/* Rank */}
      <div className="flex items-center justify-center">
        {isMedal ? (
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: MEDAL_COLORS[rank - 1] }}>
            {rank}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-slate-300 tabular-nums">{rank}</span>
        )}
      </div>

      {/* Name + status badge */}
      <div className="min-w-0 py-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis leading-tight flex-1 min-w-0">
            {b.full_name}
          </span>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Goal progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full overflow-hidden bg-slate-100">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${goalPctClamped}%`, backgroundColor: statusColor }}
          />
        </div>
        <span className="text-[10px] font-bold tabular-nums shrink-0 w-8 text-right" style={{ color: statusColor }}>
          {b.goalPct.toFixed(0)}%
        </span>
      </div>

      {/* Captures / Period Goal */}
      <div className="text-center">
        <span className="text-[13px] font-bold tabular-nums" style={{ color: primaryColor }}>{b.total_captures.toLocaleString()}</span>
        {periodGoal > 0 && (
          <span className="text-[9px] text-slate-300 tabular-nums"> / {periodGoal.toLocaleString()}</span>
        )}
      </div>

      {/* Remaining */}
      <div className="flex items-center justify-center">
        {b.remaining > 0 ? (
          <span className="text-[11px] font-semibold text-slate-400 tabular-nums">-{b.remaining.toLocaleString()}</span>
        ) : (
          <span className="text-[11px] font-bold text-emerald-500">OK</span>
        )}
      </div>
    </div>
  );
}

/* ========== Status Pill ========== */

function StatusPill({ count, color, label }: { count: number; color: string; label: string }) {
  return (
    <span
      className="text-[9px] font-bold px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {count} {label}
    </span>
  );
}
