"use client";

import { memo, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { CmsBrigadistaMetrics } from "@/lib/types";
import type { FormRecord } from "@/lib/services";
import { useTheme } from "@/lib/theme-context";
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

const ValidacionRanking = dynamic(
  () => import("./validacion-ranking").then((m) => ({ default: m.ValidacionRanking })),
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
  campaignId: string;
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
  /** Period offset for time navigation (0 = current, -1 = previous, etc.) */
  offset: number;
  onOffsetChange: (offset: number) => void;
  periodLabel: string;
  dateRanges: PipelineDateRanges;
  totalDatos: number;
  /** Server-side totals from campaign stats (authoritative counts) */
  serverTotals: { forms_count: number; forms_today: number; forms_week: number };
  agentesCampoCount: number;
  metaDatos: number;
};

/* ========== Component ========== */

export const PipelineView = memo(function PipelineView({
  campaignId, brigadistas, prevBrigadistas, isLoading, isPending, primaryColor, secondaryColor,
  forms, prevForms, agents, period, onPeriodChange, offset, onOffsetChange, periodLabel, dateRanges,
  totalDatos, serverTotals, agentesCampoCount, metaDatos,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  // ── Compare / drill-down state (max 2 selected) ──
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const handleToggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // FIFO: drop oldest
      return [...prev, id];
    });
  }, []);
  const handleClearCompare = useCallback(() => setCompareIds([]), []);

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

  // ── Agent-specific data for single drill-down (1 selected) ──
  const agentDrill = useMemo(() => {
    if (compareIds.length !== 1) return null;
    const id = compareIds[0];
    const brig = brigadistas.find((b) => b.brigadista_id === id);
    const agentForms = forms.filter((f) => (f.agent_id || f.encuestador_id) === id);
    const agentName = brig?.full_name ?? agentForms[0]?.encuestador ?? "Agente";
    const periodDatos = agentForms.length;
    const totalCaptures = brig?.total_captures ?? periodDatos;
    return { id, name: agentName, periodDatos, totalCaptures };
  }, [compareIds, brigadistas, forms]);

  // ── Compare pair names (2 selected) ──
  const comparePair = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const getName = (id: string) => {
      const b = brigadistas.find((br) => br.brigadista_id === id);
      if (b) return b.full_name;
      const f = forms.find((fr) => (fr.agent_id || fr.encuestador_id) === id);
      return f?.encuestador ?? "Agente";
    };
    return { a: { id: compareIds[0], name: getName(compareIds[0]) }, b: { id: compareIds[1], name: getName(compareIds[1]) } };
  }, [compareIds, brigadistas, forms]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-3">
        <div className={`w-5 h-5 border-2 rounded-full animate-spin ${isDark ? "border-[#343b47] border-t-slate-200" : "border-slate-200 border-t-slate-600"}`} />
        <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-400"}`}>Cargando metricas...</span>
      </div>
    );
  }

  // Use server-side counts when available (current period) — forms array may be empty
  // due to client-side filtering on a limited (500-record) API response
  const serverPeriodCount = offset === 0
    ? (period === "today" ? serverTotals.forms_today
      : period === "week" ? serverTotals.forms_week
      : period === "all" ? serverTotals.forms_count
      : undefined)
    : undefined;
  const hasForms = forms.length > 0 || (serverPeriodCount != null && serverPeriodCount > 0);
  const hasBrigadistas = brigadistas.length > 0;
  const isEmpty = !hasForms && !hasBrigadistas;

  return (
      <div className={`hide-scrollbar tierra-pipeline-view h-full flex flex-col min-h-0 overflow-y-auto transition-opacity duration-150 ${isDark ? "bg-[#090D15]" : "bg-slate-50/80"} ${isPending ? "opacity-70" : "opacity-100"}`}>
      {/* 1. Filter bar */}
      <div className={`shrink-0 ${isDark ? "border-b border-[#2a303b] bg-[#090D15]" : "border-b border-slate-100 bg-white"}`}>
        <PipelineFilters period={period} onChange={onPeriodChange} primaryColor={primaryColor} offset={offset} onOffsetChange={onOffsetChange} />
      </div>

      {/* Agent drill-down banner (1 selected) */}
      {agentDrill && (
        <div className={`flex items-center gap-3 px-4 py-2 shrink-0 ${isDark ? "bg-[#090D15] border-b border-[#2a303b]" : "bg-white border-b border-slate-200/80"}`}>
          <button
            type="button"
            onClick={handleClearCompare}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] cursor-pointer border-none transition-colors shrink-0 ${isDark ? "bg-[#090D15] text-slate-300 hover:bg-[#090D15]" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
            aria-label="Volver a vista global"
          >
            &larr;
          </button>
          <span className={`text-[12px] font-bold truncate ${isDark ? "text-slate-100" : "text-slate-700"}`}>{agentDrill.name}</span>
          <span className="text-[11px] font-extrabold tabular-nums ml-auto" style={{ color: primaryColor }}>
            {agentDrill.periodDatos} registros en periodo
          </span>
        </div>
      )}

      {/* Compare banner (2 selected) */}
      {comparePair && (
        <div className={`flex items-center gap-3 px-4 py-2 shrink-0 ${isDark ? "bg-[#090D15] border-b border-[#2a303b]" : "bg-white border-b border-slate-200/80"}`}>
          <button
            type="button"
            onClick={handleClearCompare}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] cursor-pointer border-none transition-colors shrink-0 ${isDark ? "bg-[#090D15] text-slate-300 hover:bg-[#090D15]" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
            aria-label="Limpiar comparacion"
          >
            &times;
          </button>
          <span className="text-[12px] font-bold truncate" style={{ color: primaryColor }}>{comparePair.a.name}</span>
          <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-400"}`}>vs</span>
          <span className="text-[12px] font-bold truncate" style={{ color: "#f59e0b" }}>{comparePair.b.name}</span>
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-16">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? "bg-[#090D15]" : "bg-slate-100"}`}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#94a3b8" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Sin datos">
              <title>Sin datos</title>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <span className={`text-base font-semibold block ${isDark ? "text-slate-200" : "text-slate-600"}`}>Sin datos en este periodo</span>
            <span className={`text-sm mt-1 block max-w-xs ${isDark ? "text-slate-400" : "text-slate-400"}`}>Proba seleccionando &quot;Todo&quot; o un periodo mas amplio</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0 min-h-0">
          {/* 2. Goal Hero — compact period-adaptive progress */}
          <div className={`shrink-0 ${isDark ? "border-b border-[#2a303b] bg-[#090D15]" : "border-b border-slate-100 bg-white"}`}>
            <PipelineFunnel
              primaryColor={primaryColor}
              totalDatos={agentDrill ? agentDrill.totalCaptures : totalDatos}
              periodDatos={agentDrill ? agentDrill.periodDatos : (serverPeriodCount ?? forms.length)}
              agentesCampoCount={agentesCampoCount}
              metaDatos={metaDatos}
              period={period}
              selectedAgentName={agentDrill?.name ?? undefined}
              periodGoalPerBrig={goalCalcs.periodGoalPerBrig}
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
              periodGoalPerBrig={goalCalcs.periodGoalPerBrig}
              compareIds={compareIds}
              onToggleCompare={handleToggleCompare}
              onClearCompare={handleClearCompare}
              serverPeriodCount={serverPeriodCount}
            />
          )}

          {/* 4. Brigadista Table — goal progress per brigadista, always visible */}
          {hasBrigadistas && (
            <div className={isDark ? "shrink-0 bg-[#090D15]" : "shrink-0 bg-white"} style={{ minHeight: "320px" }}>
              <BrigadistaTable
                brigadistas={brigadistas}
                primaryColor={primaryColor}
                goalPerBrigadista={goalCalcs.goalPerBrigadista}
                goalPerBrigadistaPerDay={goalCalcs.goalPerBrigadistaPerDay}
                periodGoalPerBrig={goalCalcs.periodGoalPerBrig}
                period={period}
                daysRemaining={goalCalcs.daysRemaining}
                compareIds={compareIds}
                onToggleCompare={handleToggleCompare}
              />
            </div>
          )}

          {/* 5. Validacion Ranking — datos validados vs imposibles por encuestador */}
          {campaignId && (
            <div className={`shrink-0 ${isDark ? "border-t border-[#2a303b]" : "border-t border-slate-200"}`}>
              <ValidacionRanking campaignId={campaignId} primaryColor={primaryColor} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/* ========== Collapsible Charts Section ========== */

function ChartsSection({ forms, prevForms, primaryColor, secondaryColor, periodLabel, period, dateRanges, periodGoalPerBrig, compareIds, onToggleCompare, onClearCompare, serverPeriodCount }: {
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
        className={`flex items-center gap-2 w-full px-4 py-2 text-left cursor-pointer border-none transition-colors ${isDark ? "bg-[#090D15] hover:bg-[#090D15]" : "bg-slate-50/60 hover:bg-slate-100/60"}`}
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
      <div className="p-4 bg-slate-100/80 rounded-xl h-[120px]" />
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
