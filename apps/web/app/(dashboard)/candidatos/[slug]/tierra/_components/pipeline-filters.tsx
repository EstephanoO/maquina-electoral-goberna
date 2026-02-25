"use client";

import { useMemo } from "react";

/* ========== Types ========== */

export type PipelinePeriod = "today" | "week" | "month" | "all";

export type DateRange = {
  from: string; // ISO date
  to: string;   // ISO date
};

export type PipelineDateRanges = {
  current: DateRange;
  previous: DateRange;
  label: string;
  previousLabel: string;
};

type Props = {
  period: PipelinePeriod;
  onChange: (period: PipelinePeriod) => void;
  primaryColor: string;
  /** How many periods back from "current" (0 = today/this week/this month, -1 = yesterday/last week, etc.) */
  offset: number;
  onOffsetChange: (offset: number) => void;
};

/* ========== Date Helpers ========== */

/* ── Date formatting helpers ── */

const SHORT_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

/** e.g. "Lun 24 Feb" */
function fmtDayFull(d: Date): string {
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

/** e.g. "24 Feb" */
function fmtDayShort(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

/** e.g. "24 Feb – 2 Mar" */
function fmtWeekRange(mon: Date): string {
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `${fmtDayShort(mon)} – ${fmtDayShort(sun)}`;
}

/** e.g. "Feb 2026" */
function fmtMonth(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Compute current & previous date ranges for a given period.
 * `offset` shifts the window: 0 = current period, -1 = previous, -2 = two ago, etc.
 * Week = Mon→Sun (ISO week).
 * Month = 1st → last day of month.
 * All = no bounds (offset ignored).
 *
 * `label` = human-friendly ("Hoy", "Esta semana", etc.)
 * `rangeLabel` = concrete date string shown between arrows ("Lun 24 Feb", "24 Feb – 2 Mar")
 */
export function getDateRanges(period: PipelinePeriod, offset = 0): PipelineDateRanges {
  const now = new Date();

  if (period === "all") {
    return {
      current: { from: "", to: "" },
      previous: { from: "", to: "" },
      label: "Todo el tiempo",
      previousLabel: "",
    };
  }

  if (period === "today") {
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + offset);

    const next = new Date(base);
    next.setDate(base.getDate() + 1);

    const prev = new Date(base);
    prev.setDate(base.getDate() - 1);

    const isToday = offset === 0;
    const label = isToday ? "Hoy" : offset === -1 ? "Ayer" : fmtDayFull(base);

    return {
      current: { from: base.toISOString(), to: next.toISOString() },
      previous: { from: prev.toISOString(), to: base.toISOString() },
      label,
      previousLabel: isToday ? "ayer" : "dia anterior",
    };
  }

  if (period === "week") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday + offset * 7);
    monday.setHours(0, 0, 0, 0);

    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);

    const isThisWeek = offset === 0;
    const label = isThisWeek ? "Esta semana" : offset === -1 ? "Sem. pasada" : fmtWeekRange(monday);

    return {
      current: { from: monday.toISOString(), to: nextMonday.toISOString() },
      previous: { from: prevMonday.toISOString(), to: monday.toISOString() },
      label,
      previousLabel: isThisWeek ? "sem. anterior" : "sem. anterior",
    };
  }

  // month
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const firstOfNextMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 1);
  const firstOfPrevMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() - 1, 1);

  const isThisMonth = offset === 0;
  const label = isThisMonth ? "Este mes" : offset === -1 ? "Mes pasado" : fmtMonth(firstOfMonth);

  return {
    current: { from: firstOfMonth.toISOString(), to: firstOfNextMonth.toISOString() },
    previous: { from: firstOfPrevMonth.toISOString(), to: firstOfMonth.toISOString() },
    label,
    previousLabel: isThisMonth ? "mes anterior" : "mes anterior",
  };
}

/* ========== Component ========== */

const PERIODS: { key: PipelinePeriod; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "all", label: "Todo" },
];

export function PipelineFilters({ period, onChange, primaryColor, offset, onOffsetChange }: Props) {
  const ranges = useMemo(() => getDateRanges(period, offset), [period, offset]);
  const canGoForward = period !== "all" && offset < 0;

  /** Concrete date string to show between arrows — always a real date/range */
  const navLabel = useMemo(() => {
    if (period === "all") return "";
    const from = ranges.current.from ? new Date(ranges.current.from) : null;
    if (!from) return "";

    if (period === "today") return fmtDayFull(from);

    if (period === "week") {
      return fmtWeekRange(from);
    }

    // month
    return fmtMonth(from);
  }, [period, ranges]);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {/* Period pills */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden">
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors"
              style={active ? { backgroundColor: primaryColor, color: "#fff" } : { color: "#64748b" }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* ← date/range → navigation */}
      {period !== "all" && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOffsetChange(offset - 1)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer border-none bg-transparent"
            aria-label="Periodo anterior"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Anterior"><title>Anterior</title><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          <span className="text-[11px] font-semibold text-slate-600 tabular-nums min-w-[100px] text-center select-none">
            {navLabel}
          </span>

          <button
            type="button"
            onClick={() => onOffsetChange(offset + 1)}
            disabled={!canGoForward}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer border-none bg-transparent"
            aria-label="Periodo siguiente"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Siguiente"><title>Siguiente</title><polyline points="9 18 15 12 9 6" /></svg>
          </button>

          {offset !== 0 && (
            <button
              type="button"
              onClick={() => onOffsetChange(0)}
              className="ml-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 cursor-pointer transition-colors hover:bg-slate-50 bg-white"
              style={{ color: primaryColor }}
            >
              Actual
            </button>
          )}
        </div>
      )}

      {/* Human-friendly label + comparison */}
      {period !== "all" && offset !== 0 && (
        <span className="text-[11px] font-medium text-slate-400">
          {ranges.label}
        </span>
      )}
      {period !== "all" && offset === 0 && ranges.previousLabel && (
        <span className="text-[11px] font-medium text-slate-400">
          vs <span className="text-slate-300">{ranges.previousLabel}</span>
        </span>
      )}
    </div>
  );
}
