"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import type { FormRecord } from "@/lib/services";
import { useBrigadistaMetrics, useRecentForms } from "@/lib/hooks";
import { type PipelinePeriod, type PipelineDateRanges, getDateRanges } from "../pipeline-filters";
import { type GeoDrillState, INITIAL_GEO_DRILL } from "../geo-ranking";

/* ========== Types ========== */

export type PipelineState = {
  period: PipelinePeriod;
  onPeriodChange: (p: PipelinePeriod) => void;
  /** Period offset: 0 = current, -1 = previous, etc. */
  offset: number;
  onOffsetChange: (offset: number) => void;
  /** Geo drill state for the ranking (dep → prov → dist) */
  geoDrill: GeoDrillState;
  onGeoDrillChange: (d: GeoDrillState) => void;
  /** Total forms count filtered by geo (null when no geo filter active) */
  regionTotalDatos: number | null;
  /** Whether any geo filter is active */
  hasGeoFilter: boolean;
  isPending: boolean;
  periodLabel: string;
  dateRanges: PipelineDateRanges;
  /** All forms for the current period (unfiltered by geo — for geo ranking) */
  periodForms: FormRecord[];
  /** Forms filtered by geo + period (for funnel, charts, brigadista table) */
  filteredForms: FormRecord[];
  prevFilteredForms: FormRecord[];
  brigadistaMetrics: ReturnType<typeof useBrigadistaMetrics>["data"];
  prevBrigadistaMetrics: ReturnType<typeof useBrigadistaMetrics>["data"];
  metricsLoading: boolean;
};

/* ========== Hook ========== */

const EMPTY_FORMS: FormRecord[] = [];

/**
 * Encapsulates all Pipeline-specific state:
 * - Period filter + startTransition for non-urgent switches
 * - Date range computation (current + previous)
 * - Geo drill state (departamento → provincia → distrito)
 * - Server-side period-scoped forms queries
 * - Dual brigadista metrics queries (current + previous period)
 */
export function usePipelineState(
  campaignId: string | undefined,
  forms: FormRecord[],
): PipelineState {
  const [period, setPeriod] = useState<PipelinePeriod>("week");
  const [offset, setOffset] = useState(0);
  const [geoDrill, setGeoDrill] = useState<GeoDrillState>(INITIAL_GEO_DRILL);
  const [isPending, startTransition] = useTransition();

  const onPeriodChange = useCallback((p: PipelinePeriod) => {
    startTransition(() => { setPeriod(p); setOffset(0); });
  }, []);

  const onOffsetChange = useCallback((o: number) => {
    startTransition(() => setOffset(Math.min(o, 0)));
  }, []);

  const onGeoDrillChange = useCallback((d: GeoDrillState) => {
    startTransition(() => setGeoDrill(d));
  }, []);

  const dateRanges = useMemo(() => getDateRanges(period, offset), [period, offset]);
  const periodFrom = dateRanges.current.from || undefined;
  const periodTo = dateRanges.current.to || undefined;
  const prevFrom = dateRanges.previous.from || undefined;
  const prevTo = dateRanges.previous.to || undefined;

  // Brigadista metrics: current period + previous for comparison
  const { data: brigadistaMetrics, isLoading: metricsLoading } = useBrigadistaMetrics(campaignId, periodFrom, periodTo);
  const { data: prevBrigadistaMetrics } = useBrigadistaMetrics(
    period !== "all" ? campaignId : undefined, prevFrom, prevTo,
  );

  // ── Server-side period-scoped forms queries ──
  const { data: serverPeriodForms } = useRecentForms(
    period !== "all" ? campaignId : undefined,
    periodFrom,
    periodTo,
  );

  const { data: prevPeriodForms } = useRecentForms(
    period !== "all" ? campaignId : undefined,
    prevFrom,
    prevTo,
  );

  // For "all" period, use the unfiltered forms array from the parent
  const timeForms = period === "all" ? forms : (serverPeriodForms ?? EMPTY_FORMS);
  const prevTimeForms = period === "all" ? EMPTY_FORMS : (prevPeriodForms ?? EMPTY_FORMS);

  // ── Geo filter derived from drill state ──
  const hasGeoFilter = !!(geoDrill.departamento || geoDrill.provincia);

  const matchesGeo = useCallback((f: FormRecord): boolean => {
    if (geoDrill.departamento && f.departamento !== geoDrill.departamento) return false;
    if (geoDrill.provincia && f.provincia !== geoDrill.provincia) return false;
    return true;
  }, [geoDrill.departamento, geoDrill.provincia]);

  // ── Geo total: count all-time forms matching the geo filter (for funnel "Total") ──
  const regionTotalDatos = useMemo(
    () => hasGeoFilter ? forms.filter(matchesGeo).length : null,
    [forms, hasGeoFilter, matchesGeo],
  );

  // ── Period forms (unfiltered by geo — used by GeoRanking for its own drill) ──
  const periodForms = timeForms;

  // ── Geo-filtered forms: for funnel, charts, brigadista table ──
  const filteredForms = useMemo(
    () => hasGeoFilter ? timeForms.filter(matchesGeo) : timeForms,
    [timeForms, hasGeoFilter, matchesGeo],
  );
  const prevFilteredForms = useMemo(
    () => hasGeoFilter ? prevTimeForms.filter(matchesGeo) : prevTimeForms,
    [prevTimeForms, hasGeoFilter, matchesGeo],
  );

  // ── Geo filter on brigadista metrics ──
  const geoBrigadistaIds = useMemo(() => {
    if (!hasGeoFilter) return null;
    const ids = new Set<string>();
    for (const f of timeForms) {
      if (matchesGeo(f)) {
        const id = f.agent_id || f.encuestador_id;
        if (id) ids.add(id);
      }
    }
    return ids;
  }, [timeForms, hasGeoFilter, matchesGeo]);

  const filteredBrigadistas = useMemo(
    () => geoBrigadistaIds && brigadistaMetrics
      ? brigadistaMetrics.filter((b) => geoBrigadistaIds.has(b.brigadista_id))
      : brigadistaMetrics,
    [brigadistaMetrics, geoBrigadistaIds],
  );

  const filteredPrevBrigadistas = useMemo(
    () => geoBrigadistaIds && prevBrigadistaMetrics
      ? prevBrigadistaMetrics.filter((b) => geoBrigadistaIds.has(b.brigadista_id))
      : prevBrigadistaMetrics,
    [prevBrigadistaMetrics, geoBrigadistaIds],
  );

  return {
    period,
    onPeriodChange,
    offset,
    onOffsetChange,
    geoDrill,
    onGeoDrillChange,
    regionTotalDatos,
    hasGeoFilter,
    isPending,
    periodLabel: dateRanges.previousLabel,
    dateRanges,
    periodForms,
    filteredForms,
    prevFilteredForms,
    brigadistaMetrics: filteredBrigadistas,
    prevBrigadistaMetrics: filteredPrevBrigadistas,
    metricsLoading,
  };
}
