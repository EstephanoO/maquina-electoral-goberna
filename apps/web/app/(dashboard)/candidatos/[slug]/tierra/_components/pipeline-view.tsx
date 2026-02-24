"use client";

import { memo, Suspense } from "react";
import dynamic from "next/dynamic";
import type { CmsBrigadistaMetrics } from "@/lib/types";
import type { FormRecord } from "@/lib/services";
import type { EnrichedAgent } from "./types";
import { PipelineFilters, type PipelinePeriod } from "./pipeline-filters";

/* ========== Lazy-loaded chart components (Recharts = heavy bundle) ========== */

const ActivityCharts = dynamic(
  () => import("./activity-charts").then((m) => ({ default: m.ActivityCharts })),
  { ssr: false, loading: () => <ChartsSkeleton /> },
);

const PipelineFunnel = dynamic(
  () => import("./pipeline-funnel").then((m) => ({ default: m.PipelineFunnel })),
  { ssr: false, loading: () => <FunnelSkeleton /> },
);

const BrigadistaTable = dynamic(
  () => import("./brigadista-table").then((m) => ({ default: m.BrigadistaTable })),
  { ssr: false, loading: () => <TableSkeleton /> },
);

/* ========== Types ========== */

type Props = {
  brigadistas: CmsBrigadistaMetrics[];
  prevBrigadistas: CmsBrigadistaMetrics[];
  isLoading: boolean;
  isPending?: boolean;
  primaryColor: string;
  secondaryColor?: string;
  forms: FormRecord[];
  prevForms: FormRecord[];
  agents: EnrichedAgent[];
  period: PipelinePeriod;
  onPeriodChange: (p: PipelinePeriod) => void;
  periodLabel: string;
};

/* ========== Component ========== */

export const PipelineView = memo(function PipelineView({
  brigadistas, prevBrigadistas, isLoading, isPending, primaryColor, secondaryColor,
  forms, prevForms, agents, period, onPeriodChange, periodLabel,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-3">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        <span className="text-sm text-slate-400 font-medium">Cargando metricas...</span>
      </div>
    );
  }

  if (brigadistas.length === 0 && forms.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 border-b border-slate-100 bg-white">
          <PipelineFilters period={period} onChange={onPeriodChange} primaryColor={primaryColor} />
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-16">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <title>Sin datos</title>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <span className="text-base font-semibold text-slate-600 block">Sin datos en este periodo</span>
            <span className="text-sm text-slate-400 mt-1 block max-w-xs">Proba seleccionando &quot;Todo&quot; o un periodo mas amplio</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col flex-1 min-h-0 overflow-y-auto bg-slate-50/80 transition-opacity duration-150 ${isPending ? "opacity-70" : "opacity-100"}`}>
      {/* ═══ Filter bar ═══ */}
      <div className="shrink-0 border-b border-slate-100 bg-white">
        <PipelineFilters period={period} onChange={onPeriodChange} primaryColor={primaryColor} />
      </div>

      {/* ═══ Activity Charts — lazy loaded, skips SSR (Recharts) ═══ */}
      <div className="shrink-0 border-b border-slate-100">
        <ActivityCharts
          forms={forms}
          prevForms={prevForms}
          agents={agents}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          periodLabel={periodLabel}
          period={period}
        />
      </div>

      {/* ═══ Pipeline funnel — lazy loaded ═══ */}
      <div className="shrink-0 border-b border-slate-100 bg-white">
        <PipelineFunnel brigadistas={brigadistas} primaryColor={primaryColor} />
      </div>

      {/* ═══ Brigadista table — lazy loaded ═══ */}
      <div className="flex-1 min-h-0 bg-white">
        <BrigadistaTable brigadistas={brigadistas} primaryColor={primaryColor} />
      </div>
    </div>
  );
});

/* ========== Skeletons ========== */

function ChartsSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 animate-pulse">
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-3.5 py-3 bg-slate-100/80 rounded-xl h-[88px]" />
        ))}
      </div>
      {/* Charts row */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="bg-slate-100/80 rounded-xl h-[260px]" />
        <div className="bg-slate-100/80 rounded-xl h-[260px]" />
      </div>
    </div>
  );
}

function FunnelSkeleton() {
  return (
    <div className="px-4 py-3 animate-pulse">
      <div className="h-3 w-32 bg-slate-100 rounded mb-3" />
      <div className="flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1">
            <div className="h-2 w-12 bg-slate-100 rounded mb-1.5" />
            <div className="h-2 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
        <div className="h-4 w-20 bg-slate-100 rounded" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 h-11 border-b border-slate-50">
          <div className="w-5 h-5 bg-slate-100 rounded-full" />
          <div className="flex-1 h-3 bg-slate-100 rounded" />
          <div className="w-10 h-3 bg-slate-100 rounded" />
          <div className="w-24 h-3 bg-slate-100 rounded" />
          <div className="w-16 h-3 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}
