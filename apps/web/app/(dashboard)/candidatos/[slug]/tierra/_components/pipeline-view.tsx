"use client";

import { memo, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { CmsBrigadistaMetrics } from "@/lib/types";
import type { FormRecord } from "@/lib/services";
import type { EnrichedAgent } from "./types";
import { PipelineFilters, type PipelinePeriod, type PipelineDateRanges } from "./pipeline-filters";

/* ========== Lazy-loaded components ========== */

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

/* ========== Goal Helpers ========== */

const DEFAULT_FECHA_LIMITE = "2026-04-10";
const DEFAULT_META_DATOS = 200000;

function calcDaysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T23:59:59");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)), 0);
}

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
  dateRanges: PipelineDateRanges;
  totalDatos: number;
  agentesCampoCount: number;
  metaDatos: number;
};

/* ========== Component ========== */

export const PipelineView = memo(function PipelineView({
  brigadistas, prevBrigadistas, isLoading, isPending, primaryColor, secondaryColor,
  forms, prevForms, agents, period, onPeriodChange, periodLabel, dateRanges,
  totalDatos, agentesCampoCount, metaDatos,
}: Props) {
  // Goal calculations for brigadista table — period-adaptive
  const goalCalcs = useMemo(() => {
    const meta = metaDatos > 0 ? metaDatos : DEFAULT_META_DATOS;
    const brigs = agentesCampoCount > 0 ? agentesCampoCount : Math.max(brigadistas.length, 1);
    const dias = calcDaysUntil(DEFAULT_FECHA_LIMITE);
    const goalPerBrigadista = brigs > 0 ? Math.ceil(meta / brigs) : 0;
    const goalPerBrigadistaPerDay = brigs > 0 && dias > 0 ? Math.ceil(meta / (brigs * dias)) : 0;

    // Period-adaptive goal per brigadista (matches the Goal Hero period)
    let periodGoalPerBrig = goalPerBrigadista;
    if (period === "today") periodGoalPerBrig = goalPerBrigadistaPerDay;
    else if (period === "week") periodGoalPerBrig = goalPerBrigadistaPerDay * 7;
    else if (period === "month") periodGoalPerBrig = goalPerBrigadistaPerDay * 30;

    return { goalPerBrigadista, goalPerBrigadistaPerDay, periodGoalPerBrig, daysRemaining: dias };
  }, [metaDatos, agentesCampoCount, brigadistas.length, period]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-3">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        <span className="text-sm text-slate-400 font-medium">Cargando metricas...</span>
      </div>
    );
  }

  const hasForms = forms.length > 0;
  const hasBrigadistas = brigadistas.length > 0;
  const isEmpty = !hasForms && !hasBrigadistas;

  return (
    <div className={`flex flex-col flex-1 min-h-0 overflow-y-auto bg-slate-50/80 transition-opacity duration-150 ${isPending ? "opacity-70" : "opacity-100"}`}>
      {/* 1. Filter bar */}
      <div className="shrink-0 border-b border-slate-100 bg-white">
        <PipelineFilters period={period} onChange={onPeriodChange} primaryColor={primaryColor} />
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-16">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Sin datos">
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
      ) : (
        <div className="flex flex-col gap-0 min-h-0">
          {/* 2. Goal Hero — compact period-adaptive progress */}
          <div className="shrink-0 border-b border-slate-100 bg-white">
            <PipelineFunnel
              primaryColor={primaryColor}
              totalDatos={totalDatos}
              periodDatos={forms.length}
              agentesCampoCount={agentesCampoCount}
              metaDatos={metaDatos}
              period={period}
            />
          </div>

          {/* 3. Activity Charts (KPIs + timeline + ranking) — collapsible */}
          {hasForms && (
            <ChartsSection
              forms={forms}
              prevForms={prevForms}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              periodLabel={periodLabel}
              period={period}
              dateRanges={dateRanges}
            />
          )}

          {/* 4. Brigadista Table — goal progress per brigadista, always visible */}
          {hasBrigadistas && (
            <div className="shrink-0 bg-white" style={{ minHeight: "320px" }}>
              <BrigadistaTable
                brigadistas={brigadistas}
                primaryColor={primaryColor}
                goalPerBrigadista={goalCalcs.goalPerBrigadista}
                goalPerBrigadistaPerDay={goalCalcs.goalPerBrigadistaPerDay}
                periodGoalPerBrig={goalCalcs.periodGoalPerBrig}
                period={period}
                daysRemaining={goalCalcs.daysRemaining}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/* ========== Collapsible Charts Section ========== */

function ChartsSection({ forms, prevForms, primaryColor, secondaryColor, periodLabel, period, dateRanges }: {
  forms: FormRecord[]; prevForms: FormRecord[]; primaryColor: string; secondaryColor?: string;
  periodLabel: string; period: PipelinePeriod; dateRanges: PipelineDateRanges;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="shrink-0 border-b border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-2 bg-slate-50/60 text-left cursor-pointer border-none hover:bg-slate-100/60 transition-colors"
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          role="img" aria-label="Toggle"
        >
          <title>Toggle</title>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actividad &amp; Rendimiento</span>
        {!open && <span className="text-[9px] text-slate-400 ml-auto">Mostrar graficos</span>}
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
        />
      )}
    </div>
  );
}

/* ========== Skeletons ========== */

function ChartsSkeleton() {
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

function FunnelSkeleton() {
  return (
    <div className="px-4 py-4 animate-pulse">
      <div className="h-3 w-32 bg-slate-100 rounded mb-4" />
      <div className="p-4 bg-slate-100/80 rounded-xl h-[120px] mb-3" />
      <div className="grid grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={`goal-skel-${i}`} className="bg-slate-100/80 rounded-xl h-[60px]" />
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
