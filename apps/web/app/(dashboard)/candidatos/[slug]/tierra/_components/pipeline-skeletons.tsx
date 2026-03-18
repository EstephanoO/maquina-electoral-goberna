"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { FormRecord } from "@/lib/services";
import { useTheme } from "@/lib/theme-context";
import type { PipelinePeriod, PipelineDateRanges } from "./pipeline-filters";

/* ========== Lazy ActivityCharts (needs skeleton reference) ========== */

const ActivityCharts = dynamic(
  () => import("./activity-charts").then((m) => ({ default: m.ActivityCharts })),
  { ssr: false, loading: () => <ChartsSkeleton /> },
);

/* ========== Collapsible Charts Section ========== */

export function ChartsSection({ forms, prevForms, primaryColor, secondaryColor, periodLabel, period, dateRanges, periodGoalPerBrig, compareIds, onToggleCompare, onClearCompare, serverPeriodCount }: {
  forms: FormRecord[]; prevForms: FormRecord[]; primaryColor: string; secondaryColor?: string;
  periodLabel: string; period: PipelinePeriod; dateRanges: PipelineDateRanges; periodGoalPerBrig?: number;
  compareIds: string[]; onToggleCompare: (id: string) => void; onClearCompare: () => void;
  serverPeriodCount?: number;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [open, setOpen] = useState(true);
  return (
    <div className={`shrink-0 ${isDark ? "border-b border-[#2a303b] bg-[#090D15]" : "border-b border-slate-100"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 w-full px-4 py-2 text-left cursor-pointer border-none transition-colors ${isDark ? "bg-[#090D15] hover:bg-[#111827]" : "bg-slate-50/60 hover:bg-slate-100/60"}`}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#cbd5e1" : "#64748b"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          role="img" aria-label="Toggle"
        >
          <title>Toggle</title>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-400"}`}>Actividad &amp; Rendimiento</span>
        {!open && <span className={`text-[9px] ml-auto ${isDark ? "text-slate-400" : "text-slate-400"}`}>Mostrar graficos</span>}
      </button>
      {open && (
        <ActivityCharts
          forms={forms}
          prevForms={prevForms}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          periodLabel={periodLabel}
          period={period}
          dateRanges={dateRanges}
          periodGoalPerBrig={periodGoalPerBrig}
          compareIds={compareIds}
          onToggleCompare={onToggleCompare}
          onClearCompare={onClearCompare}
          serverPeriodCount={serverPeriodCount}
        />
      )}
    </div>
  );
}

/* ========== Skeletons ========== */

export function ChartsSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 animate-pulse">
      <div className="grid grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={`kpi-skel-${i}`} className="px-3.5 py-3 bg-slate-100/80 rounded-xl h-[88px]" />
        ))}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="bg-slate-100/80 rounded-xl h-[260px]" />
        <div className="bg-slate-100/80 rounded-xl h-[260px]" />
      </div>
    </div>
  );
}

export function FunnelSkeleton() {
  return (
    <div className="px-4 py-4 animate-pulse">
      <div className="h-3 w-32 bg-slate-100 rounded mb-4" />
      <div className="p-4 bg-slate-100/80 rounded-xl h-[120px]" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
        <div className="h-4 w-20 bg-slate-100 rounded" />
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={`table-skel-${i}`} className="flex items-center gap-3 px-4 h-[52px] border-b border-slate-50">
          <div className="w-5 h-5 bg-slate-100 rounded-full" />
          <div className="flex-1 h-3 bg-slate-100 rounded" />
          <div className="w-24 h-3 bg-slate-100 rounded" />
          <div className="w-16 h-3 bg-slate-100 rounded" />
          <div className="w-12 h-3 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}
