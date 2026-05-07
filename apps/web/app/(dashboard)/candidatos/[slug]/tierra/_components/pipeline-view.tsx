"use client";

import { memo, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { CmsBrigadistaMetrics } from "@/lib/types";
import type { FormRecord } from "@/lib/services";
import { useTheme } from "@/lib/theme-context";
import type { EnrichedAgent } from "./types";
import { PipelineFilters, type PipelinePeriod, type PipelineDateRanges } from "./pipeline-filters";
import { GeoRanking, type GeoDrillState, INITIAL_GEO_DRILL } from "./geo-ranking";
import { ChartsSection, FunnelSkeleton, TableSkeleton } from "./pipeline-skeletons";

/* ========== Lazy-loaded components ========== */

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

type RankingTab = "regiones" | "brigadistas";

type Props = {
  campaignId: string;
  brigadistas: CmsBrigadistaMetrics[];
  prevBrigadistas: CmsBrigadistaMetrics[];
  isLoading: boolean;
  isPending?: boolean;
  primaryColor: string;
  secondaryColor?: string;
  /** Forms filtered by period + geo (for funnel, charts, brigadista table) */
  forms: FormRecord[];
  prevForms: FormRecord[];
  /** All forms for the current period (unfiltered by geo — for geo ranking) */
  periodForms: FormRecord[];
  agents: EnrichedAgent[];
  period: PipelinePeriod;
  onPeriodChange: (p: PipelinePeriod) => void;
  offset: number;
  onOffsetChange: (offset: number) => void;
  /** Geo drill state for the ranking */
  geoDrill: GeoDrillState;
  onGeoDrillChange: (d: GeoDrillState) => void;
  /** Whether any geo filter is active */
  hasGeoFilter: boolean;
  periodLabel: string;
  dateRanges: PipelineDateRanges;
  totalDatos: number;
  serverTotals: { forms_count: number; forms_today: number; forms_week: number };
  agentesCampoCount: number;
  metaDatos: number;
};

/* ========== Component ========== */

export const PipelineView = memo(function PipelineView({
  campaignId, brigadistas, prevBrigadistas, isLoading, isPending, primaryColor, secondaryColor,
  forms, prevForms, periodForms, agents, period, onPeriodChange, offset, onOffsetChange,
  geoDrill, onGeoDrillChange, hasGeoFilter,
  periodLabel, dateRanges,
  totalDatos, serverTotals, agentesCampoCount, metaDatos,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<RankingTab>("regiones");

  // ── Compare / drill-down state (max 2 selected) ──
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const handleToggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }, []);
  const handleClearCompare = useCallback(() => setCompareIds([]), []);

  // Goal calculations
  const goalCalcs = useMemo(() => {
    const meta = metaDatos > 0 ? metaDatos : DEFAULT_META_DATOS;
    const brigs = agentesCampoCount > 0 ? agentesCampoCount : Math.max(brigadistas.length, 1);
    const dias = calcDaysUntil(DEFAULT_FECHA_LIMITE);
    const goalPerBrigadista = brigs > 0 ? Math.ceil(meta / brigs) : 0;
    const goalPerBrigadistaPerDay = brigs > 0 && dias > 0 ? Math.ceil(meta / (brigs * dias)) : 0;

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

  // ── Geo label for context ──
  const geoLabel = useMemo(() => {
    if (geoDrill.provincia) return geoDrill.provincia;
    if (geoDrill.departamento) return geoDrill.departamento;
    return null;
  }, [geoDrill]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 gap-3">
        <div className={`w-5 h-5 border-2 rounded-full animate-spin ${isDark ? "border-[#343b47] border-t-slate-200" : "border-slate-200 border-t-slate-600"}`} />
        <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-400"}`}>Cargando metricas...</span>
      </div>
    );
  }

  // Server-side period counts (only when no geo filter)
  const serverPeriodCount = (offset === 0 && !hasGeoFilter)
    ? (period === "today" ? serverTotals.forms_today
      : period === "week" ? serverTotals.forms_week
      : period === "all" ? serverTotals.forms_count
      : undefined)
    : undefined;
  const hasForms = forms.length > 0 || (serverPeriodCount != null && serverPeriodCount > 0);
  const hasBrigadistas = brigadistas.length > 0;
  const isEmpty = !hasForms && !hasBrigadistas && periodForms.length === 0;

  const TABS: { key: RankingTab; label: string; icon: string }[] = [
    { key: "regiones", label: "Regiones", icon: "M" },
    { key: "brigadistas", label: "Brigadistas", icon: "B" },
  ];

  return (
    <div className={`hide-scrollbar tierra-pipeline-view h-full flex flex-col min-h-0 overflow-y-auto transition-opacity duration-150 ${isDark ? "bg-[#090D15]" : "bg-slate-50/80"} ${isPending ? "opacity-70" : "opacity-100"}`}>
      {/* 1. Filter bar (period + date nav only — no geo dropdowns) */}
      <div className={`shrink-0 ${isDark ? "border-b border-[#2a303b] bg-[#090D15]" : "border-b border-slate-100 bg-white"}`}>
        <PipelineFilters period={period} onChange={onPeriodChange} primaryColor={primaryColor} offset={offset} onOffsetChange={onOffsetChange} />
      </div>

      {/* Geo context banner */}
      {geoLabel && (
        <div className={`flex items-center gap-2 px-4 py-1.5 shrink-0 ${isDark ? "bg-[#0f1729] border-b border-[#2a303b]" : "bg-slate-50 border-b border-slate-100"}`}>
          <button
            type="button"
            onClick={() => onGeoDrillChange(INITIAL_GEO_DRILL)}
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] cursor-pointer border-none transition-colors shrink-0 ${isDark ? "bg-[#1e293b] text-slate-300 hover:bg-[#334155]" : "bg-slate-200 text-slate-500 hover:bg-slate-300"}`}
            aria-label="Limpiar filtro geo"
          >
            &times;
          </button>
          <span className={`text-[11px] font-semibold ${isDark ? "text-slate-300" : "text-slate-500"}`}>
            Filtrando por:
          </span>
          <span className="text-[11px] font-bold" style={{ color: primaryColor }}>
            {geoDrill.departamento}{geoDrill.provincia ? ` / ${geoDrill.provincia}` : ""}
          </span>
        </div>
      )}

      {/* Agent drill-down banner (1 selected) */}
      {agentDrill && (
        <div className={`flex items-center gap-3 px-4 py-2 shrink-0 ${isDark ? "bg-[#090D15] border-b border-[#2a303b]" : "bg-white border-b border-slate-200/80"}`}>
          <button
            type="button"
            onClick={handleClearCompare}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] cursor-pointer border-none transition-colors shrink-0 ${isDark ? "bg-[#1e293b] text-slate-300 hover:bg-[#334155]" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
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
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] cursor-pointer border-none transition-colors shrink-0 ${isDark ? "bg-[#1e293b] text-slate-300 hover:bg-[#334155]" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
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
        <div className="flex flex-col items-center justify-center flex-1 gap-5 text-center p-10 sm:p-16">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? "bg-[#1e293b]" : "bg-slate-100"}`}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={isDark ? "#64748b" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Sin datos">
              <title>Sin datos</title>
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </svg>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={`text-base font-bold block ${isDark ? "text-slate-200" : "text-slate-700"}`}>Sin datos en este periodo</span>
            <span className={`text-sm block max-w-sm ${isDark ? "text-slate-400" : "text-slate-400"}`}>
              No hay capturas de brigadistas ni formularios registrados{periodLabel ? ` para "${periodLabel}"` : ""}.
            </span>
          </div>
          <div className={`flex flex-col sm:flex-row items-center gap-3 mt-1 text-[12px] font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            <button
              type="button"
              onClick={() => onPeriodChange("all")}
              className={`px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                isDark
                  ? "border-slate-700 bg-[#0f172a] text-slate-300 hover:bg-[#1e293b]"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Ver periodo completo
            </button>
            {hasGeoFilter && (
              <button
                type="button"
                onClick={() => onGeoDrillChange(INITIAL_GEO_DRILL)}
                className={`px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                  isDark
                    ? "border-slate-700 bg-[#0f172a] text-slate-300 hover:bg-[#1e293b]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Quitar filtro geografico
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0 min-h-0">
          {/* 2. Funnel */}
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
              datosWspp={34323}
            />
          </div>

          {/* 3. Tabs: Regiones / Brigadistas */}
          <div className={`shrink-0 ${isDark ? "border-b border-[#2a303b] bg-[#090D15]" : "border-b border-slate-100 bg-white"}`}>
            <div className="flex px-4 gap-0">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider border-none cursor-pointer transition-colors relative ${
                      active
                        ? (isDark ? "text-slate-100" : "text-slate-800")
                        : (isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600")
                    } bg-transparent`}
                  >
                    {tab.label}
                    {active && (
                      <div
                        className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                        style={{ backgroundColor: primaryColor }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          {activeTab === "regiones" ? (
            <div className={`shrink-0 ${isDark ? "bg-[#090D15]" : "bg-white"}`}>
              <GeoRanking
                forms={periodForms}
                drill={geoDrill}
                onDrillChange={onGeoDrillChange}
                primaryColor={primaryColor}
              />
            </div>
          ) : (
            hasBrigadistas && (
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
            )
          )}

          {/* 4. Activity Charts — collapsible */}
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

          {/* 5. Validacion Ranking */}
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


