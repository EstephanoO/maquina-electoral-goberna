"use client";

import { useState, useMemo } from "react";
import type { CmsBrigadistaMetrics } from "@/lib/types";

/* ========== Types ========== */

type SortKey = "total_captures" | "goal_pct";

type Props = {
  brigadistas: CmsBrigadistaMetrics[];
  primaryColor: string;
  goalPerBrigadista: number;
  goalPerBrigadistaPerDay: number;
  periodGoalPerBrig: number;
  period: "today" | "week" | "month" | "all";
  daysRemaining: number;
  /** Selected agent IDs for compare/drill-down (max 2) */
  compareIds: string[];
  /** Toggle an agent in/out of compare selection */
  onToggleCompare: (id: string) => void;
};

/* ========== Constants ========== */

const COMPARE_COLOR_A_BG = "rgba(59, 130, 246, 0.06)"; // primary tint
const COMPARE_COLOR_B = "#f59e0b"; // amber
const COMPARE_COLOR_B_BG = "rgba(245, 158, 11, 0.06)"; // amber tint
const MEDAL = ["#f59e0b", "#94a3b8", "#cd7f32"] as const;

const STATUS_CONFIG = {
  done: { color: "#10b981", bg: "#10b98118", label: "Meta cumplida" },
  ahead: { color: "#3b82f6", bg: "#3b82f618", label: "Adelante" },
  on_track: { color: "#f59e0b", bg: "#f59e0b18", label: "En ritmo" },
  behind: { color: "#ef4444", bg: "#ef444418", label: "Atras" },
} as const;

const PERIOD_LABELS: Record<Props["period"], string> = {
  today: "Meta del dia",
  week: "Meta semanal",
  month: "Meta mensual",
  all: "Meta total",
};

/* ========== Component ========== */

export function BrigadistaTable({ brigadistas, primaryColor, goalPerBrigadista, goalPerBrigadistaPerDay, periodGoalPerBrig, period, daysRemaining, compareIds, onToggleCompare }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_captures");
  const [sortAsc, setSortAsc] = useState(false);

  const enriched = useMemo(() => {
    return brigadistas.map((b) => {
      const totalGoalPct = goalPerBrigadista > 0 ? (b.total_captures / goalPerBrigadista) * 100 : 0;
      const totalRemaining = Math.max(goalPerBrigadista - b.total_captures, 0);
      const needsPerDay = daysRemaining > 0 ? Math.ceil(totalRemaining / daysRemaining) : 0;
      const onTrack = needsPerDay <= goalPerBrigadistaPerDay;
      const status: "ahead" | "on_track" | "behind" | "done" =
        totalGoalPct >= 100 ? "done" :
        needsPerDay < goalPerBrigadistaPerDay * 0.8 ? "ahead" :
        onTrack ? "on_track" : "behind";
      const periodPct = periodGoalPerBrig > 0 ? (b.total_captures / periodGoalPerBrig) * 100 : 0;
      const periodRemaining = Math.max(periodGoalPerBrig - b.total_captures, 0);
      return { ...b, goalPct: periodPct, remaining: periodRemaining, needsPerDay, onTrack, status, goal_pct: periodPct };
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
  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " \u2191" : " \u2193") : "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar (light) ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200/80 shrink-0">
        <div className="flex items-center gap-2 flex-1 py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200 focus-within:border-slate-300 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" role="img" aria-label="Buscar"><title>Buscar</title><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar brigadista..."
            className="flex-1 border-none outline-none bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="w-5 h-5 rounded-full border-none bg-slate-200 text-slate-500 cursor-pointer text-[10px] flex items-center justify-center hover:bg-slate-300 transition-colors" aria-label="Limpiar">x</button>
          )}
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-1.5 shrink-0">
          {summary.done > 0 && <Pill count={summary.done} color="#10b981" label="Meta" />}
          {summary.ahead > 0 && <Pill count={summary.ahead} color="#3b82f6" label="Adelante" />}
          {summary.onTrack > 0 && <Pill count={summary.onTrack} color="#f59e0b" label="En ritmo" />}
          {summary.behind > 0 && <Pill count={summary.behind} color="#ef4444" label="Atras" />}
        </div>

        <span className="text-[11px] text-slate-400 shrink-0 tabular-nums font-semibold">
          {filtered.length} brigadista{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Goal reference strip (light) ── */}
      {periodGoalPerBrig > 0 && (
        <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-50 border-b border-slate-200/80 shrink-0">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{PERIOD_LABELS[period]}:</span>
          <span className="text-[12px] font-extrabold text-slate-700 tabular-nums">{periodGoalPerBrig.toLocaleString()}<span className="text-slate-400 font-semibold text-[10px]"> datos/brig</span></span>
          <span className="text-slate-200">|</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ritmo:</span>
          <span className="text-[12px] font-extrabold text-slate-700 tabular-nums">{goalPerBrigadistaPerDay.toLocaleString()}<span className="text-slate-400 font-semibold text-[10px]">/dia</span></span>
          <span className="text-slate-200">|</span>
          <span className={`text-[12px] font-extrabold tabular-nums ${daysRemaining <= 7 ? "text-red-500" : daysRemaining <= 14 ? "text-amber-500" : "text-emerald-500"}`}>
            {daysRemaining}d <span className="text-slate-400 font-semibold text-[10px]">restantes</span>
          </span>
        </div>
      )}

      {/* ── Table header ── */}
      <div className="grid grid-cols-[28px_32px_1fr_120px_90px_70px] gap-2 px-4 py-2 border-b border-slate-200/80 bg-slate-50 shrink-0 items-center">
        <span /> {/* checkbox col */}
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">#</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Brigadista</span>
        <button type="button" onClick={() => handleSort("goal_pct")} className="text-[9px] font-bold uppercase tracking-wider text-center cursor-pointer bg-transparent border-none text-slate-500 hover:text-slate-800 transition-colors" title="Ordenar por % de meta">
          Progreso{arrow("goal_pct")}
        </button>
        <button type="button" onClick={() => handleSort("total_captures")} className="text-[9px] font-bold uppercase tracking-wider text-center cursor-pointer bg-transparent border-none text-slate-500 hover:text-slate-800 transition-colors" title="Ordenar por registros">
          Registros{arrow("total_captures")}
        </button>
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-center">Faltan</span>
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
            <span className="text-[14px] font-bold text-slate-500">Sin brigadistas</span>
            <span className="text-[12px] text-slate-400">{search ? "Intenta con otra busqueda" : "Los brigadistas apareceran cuando capturen datos"}</span>
          </div>
        ) : (
          filtered.map((b, idx) => {
            const compareIdx = compareIds.indexOf(b.brigadista_id);
            return (
              <Row
                key={b.brigadista_id}
                b={b}
                rank={idx + 1}
                pc={primaryColor}
                even={idx % 2 === 1}
                goal={periodGoalPerBrig}
                compareIdx={compareIdx}
                onToggle={() => onToggleCompare(b.brigadista_id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

/* ========== Row ========== */

type EB = CmsBrigadistaMetrics & {
  goalPct: number; remaining: number; needsPerDay: number; onTrack: boolean;
  status: "ahead" | "on_track" | "behind" | "done";
};

function Row({ b, rank, pc, even, goal, compareIdx, onToggle }: { b: EB; rank: number; pc: string; even: boolean; goal: number; compareIdx: number; onToggle: () => void }) {
  const isMedal = rank <= 3;
  const cfg = STATUS_CONFIG[b.status];
  const pct = Math.min(b.goalPct, 100);
  const statusLabel = b.status === "behind" ? `${b.needsPerDay}/dia` : cfg.label;
  const isSelected = compareIdx >= 0;
  const checkColor = compareIdx === 0 ? pc : compareIdx === 1 ? COMPARE_COLOR_B : undefined;
  const rowBg = compareIdx === 0 ? COMPARE_COLOR_A_BG : compareIdx === 1 ? COMPARE_COLOR_B_BG : even ? "rgba(248,250,252,0.5)" : "#fff";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`grid grid-cols-[28px_32px_1fr_120px_90px_70px] gap-2 px-4 items-center min-h-[48px] border-b border-slate-100/80 transition-colors hover:bg-slate-100/60 w-full text-left bg-transparent border-x-0 border-t-0 cursor-pointer`}
      style={{ backgroundColor: rowBg }}
      title={`${b.full_name} — ${b.goalPct.toFixed(0)}% de meta`}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center">
        <span
          className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
          style={{
            borderColor: isSelected ? checkColor : "#cbd5e1",
            backgroundColor: isSelected ? checkColor : "transparent",
          }}
        >
          {isSelected && (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Seleccionado">
              <title>Seleccionado</title>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
      </div>

      {/* Rank */}
      <div className="flex items-center justify-center">
        {isMedal ? (
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-sm" style={{ backgroundColor: MEDAL[rank - 1] }}>
            {rank}
          </span>
        ) : (
          <span className="text-[12px] font-bold text-slate-300 tabular-nums">{rank}</span>
        )}
      </div>

      {/* Name + badge */}
      <div className="min-w-0 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis leading-tight flex-1 min-w-0">
            {b.full_name}
          </span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-slate-100">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: cfg.color,
              boxShadow: pct > 0 ? `0 0 6px ${cfg.color}40` : "none",
            }}
          />
        </div>
        <span className="text-[11px] font-black tabular-nums shrink-0 w-9 text-right" style={{ color: cfg.color }}>
          {b.goalPct.toFixed(0)}%
        </span>
      </div>

      {/* Captures / Goal */}
      <div className="text-center">
        <span className="text-[14px] font-black tabular-nums" style={{ color: pc }}>{b.total_captures.toLocaleString()}</span>
        {goal > 0 && <span className="text-[10px] text-slate-400 font-semibold tabular-nums"> / {goal.toLocaleString()}</span>}
      </div>

      {/* Remaining */}
      <div className="flex items-center justify-center">
        {b.remaining > 0 ? (
          <span className="text-[12px] font-bold text-slate-400 tabular-nums">-{b.remaining.toLocaleString()}</span>
        ) : (
          <span className="text-[12px] font-black text-emerald-500">OK</span>
        )}
      </div>
    </button>
  );
}

/* ========== Pill ========== */

function Pill({ count, color, label }: { count: number; color: string; label: string }) {
  return (
    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tabular-nums whitespace-nowrap" style={{ backgroundColor: `${color}25`, color }}>
      {count} {label}
    </span>
  );
}
