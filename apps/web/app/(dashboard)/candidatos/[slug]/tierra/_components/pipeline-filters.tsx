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
};

/* ========== Date Helpers ========== */

/**
 * Compute current & previous date ranges for a given period.
 * Week = Mon→Sun (ISO week).
 * Month = 1st → last day of current month.
 * All = no bounds.
 */
export function getDateRanges(period: PipelinePeriod): PipelineDateRanges {
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
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    return {
      current: { from: todayStart.toISOString(), to: tomorrowStart.toISOString() },
      previous: { from: yesterdayStart.toISOString(), to: todayStart.toISOString() },
      label: "Hoy",
      previousLabel: "ayer",
    };
  }

  if (period === "week") {
    // Current week: Monday 00:00 → next Monday 00:00
    const day = now.getDay(); // 0=Sun, 1=Mon, ...
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    // Previous week
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);

    return {
      current: { from: monday.toISOString(), to: nextMonday.toISOString() },
      previous: { from: prevMonday.toISOString(), to: monday.toISOString() },
      label: "Esta semana",
      previousLabel: "sem. anterior",
    };
  }

  // month
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    current: { from: firstOfMonth.toISOString(), to: firstOfNextMonth.toISOString() },
    previous: { from: firstOfPrevMonth.toISOString(), to: firstOfMonth.toISOString() },
    label: "Este mes",
    previousLabel: "mes anterior",
  };
}

/* ========== Component ========== */

const PERIODS: { key: PipelinePeriod; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "all", label: "Todo" },
];

export function PipelineFilters({ period, onChange, primaryColor }: Props) {
  const ranges = useMemo(() => getDateRanges(period), [period]);

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

      {/* Period label */}
      <span className="text-[11px] font-medium text-slate-400">
        {ranges.label}
        {ranges.previousLabel && (
          <span className="text-slate-300"> vs {ranges.previousLabel}</span>
        )}
      </span>
    </div>
  );
}
