"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import type { FormRecord } from "@/lib/services";
import { useBrigadistaMetrics, useRecentForms } from "@/lib/hooks";
import { type PipelinePeriod, type PipelineDateRanges, getDateRanges } from "../pipeline-filters";

/* ========== Types ========== */

export type PipelineState = {
  period: PipelinePeriod;
  onPeriodChange: (p: PipelinePeriod) => void;
  /** Period offset: 0 = current, -1 = previous, etc. */
  offset: number;
  onOffsetChange: (offset: number) => void;
  /** Region filter: null = all regions, string = departamento name */
  region: string | null;
  onRegionChange: (r: string | null) => void;
  /** Sorted list of unique departamento names found in forms data */
  availableRegions: string[];
  /** Total forms count filtered by region (null when no region filter active) */
  regionTotalDatos: number | null;
  isPending: boolean;
  periodLabel: string;
  dateRanges: PipelineDateRanges;
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
 * - Server-side period-scoped forms queries (avoids 500-record cap issues)
 * - Dual brigadista metrics queries (current + previous period)
 */
export function usePipelineState(
  campaignId: string | undefined,
  forms: FormRecord[],
): PipelineState {
  const [period, setPeriod] = useState<PipelinePeriod>("week");
  const [offset, setOffset] = useState(0);
  const [region, setRegion] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onPeriodChange = useCallback((p: PipelinePeriod) => {
    startTransition(() => { setPeriod(p); setOffset(0); }); // reset offset on period change
  }, []);

  const onOffsetChange = useCallback((o: number) => {
    startTransition(() => setOffset(Math.min(o, 0))); // never go into the future
  }, []);

  const onRegionChange = useCallback((r: string | null) => {
    startTransition(() => setRegion(r));
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
  // Instead of filtering the unscoped 500-record forms array client-side,
  // we fetch forms directly from the API with from/to params. This ensures
  // "today"/"week"/"month" get the actual forms for that period.
  const { data: periodForms } = useRecentForms(
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
  const timeForms = period === "all" ? forms : (periodForms ?? EMPTY_FORMS);
  const prevTimeForms = period === "all" ? EMPTY_FORMS : (prevPeriodForms ?? EMPTY_FORMS);

  // ── Available regions: derived from ALL forms (not period-filtered) ──
  const availableRegions = useMemo(() => {
    const deps = new Set<string>();
    for (const f of forms) {
      if (f.departamento) deps.add(f.departamento);
    }
    return Array.from(deps).sort((a, b) => a.localeCompare(b, "es"));
  }, [forms]);

  // ── Region total: count all-time forms in the selected region (for funnel "Total") ──
  const regionTotalDatos = useMemo(
    () => region ? forms.filter((f) => f.departamento === region).length : null,
    [forms, region],
  );

  // ── Region filter: applied client-side on top of time-filtered forms ──
  const filteredForms = useMemo(
    () => region ? timeForms.filter((f) => f.departamento === region) : timeForms,
    [timeForms, region],
  );
  const prevFilteredForms = useMemo(
    () => region ? prevTimeForms.filter((f) => f.departamento === region) : prevTimeForms,
    [prevTimeForms, region],
  );

  // ── Region filter on brigadista metrics (by forms, since metrics don't have departamento) ──
  const regionBrigadistaIds = useMemo(() => {
    if (!region) return null;
    const ids = new Set<string>();
    for (const f of timeForms) {
      if (f.departamento === region) {
        const id = f.agent_id || f.encuestador_id;
        if (id) ids.add(id);
      }
    }
    return ids;
  }, [timeForms, region]);

  const filteredBrigadistas = useMemo(
    () => regionBrigadistaIds && brigadistaMetrics
      ? brigadistaMetrics.filter((b) => regionBrigadistaIds.has(b.brigadista_id))
      : brigadistaMetrics,
    [brigadistaMetrics, regionBrigadistaIds],
  );

  const filteredPrevBrigadistas = useMemo(
    () => regionBrigadistaIds && prevBrigadistaMetrics
      ? prevBrigadistaMetrics.filter((b) => regionBrigadistaIds.has(b.brigadista_id))
      : prevBrigadistaMetrics,
    [prevBrigadistaMetrics, regionBrigadistaIds],
  );

  return {
    period,
    onPeriodChange,
    offset,
    onOffsetChange,
    region,
    onRegionChange,
    availableRegions,
    regionTotalDatos,
    isPending,
    periodLabel: dateRanges.previousLabel,
    dateRanges,
    filteredForms,
    prevFilteredForms,
    brigadistaMetrics: filteredBrigadistas,
    prevBrigadistaMetrics: filteredPrevBrigadistas,
    metricsLoading,
  };
}
