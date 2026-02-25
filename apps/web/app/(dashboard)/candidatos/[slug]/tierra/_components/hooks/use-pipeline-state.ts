"use client";

import { useMemo, useState, useTransition, useCallback } from "react";
import type { FormRecord } from "@/lib/services";
import { useBrigadistaMetrics } from "@/lib/hooks";
import { type PipelinePeriod, type PipelineDateRanges, getDateRanges } from "../pipeline-filters";

/* ========== Types ========== */

export type PipelineState = {
  period: PipelinePeriod;
  onPeriodChange: (p: PipelinePeriod) => void;
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

/**
 * Encapsulates all Pipeline-specific state:
 * - Period filter + startTransition for non-urgent switches
 * - Date range computation (current + previous)
 * - Client-side form filtering
 * - Dual brigadista metrics queries (current + previous period)
 */
export function usePipelineState(
  campaignId: string | undefined,
  forms: FormRecord[],
): PipelineState {
  const [period, setPeriod] = useState<PipelinePeriod>("week");
  const [isPending, startTransition] = useTransition();

  const onPeriodChange = useCallback((p: PipelinePeriod) => {
    startTransition(() => setPeriod(p));
  }, []);

  const dateRanges = useMemo(() => getDateRanges(period), [period]);
  const periodFrom = dateRanges.current.from || undefined;
  const periodTo = dateRanges.current.to || undefined;
  const prevFrom = dateRanges.previous.from || undefined;
  const prevTo = dateRanges.previous.to || undefined;

  // Brigadista metrics: current period + previous for comparison
  const { data: brigadistaMetrics, isLoading: metricsLoading } = useBrigadistaMetrics(campaignId, periodFrom, periodTo);
  const { data: prevBrigadistaMetrics } = useBrigadistaMetrics(
    period !== "all" ? campaignId : undefined, prevFrom, prevTo,
  );

  // Client-side date filtering on already-fetched forms
  const filteredForms = useMemo(() => {
    if (!periodFrom) return forms; // "all" → no filter
    const fromTs = new Date(periodFrom).getTime();
    const toTs = periodTo ? new Date(periodTo).getTime() : Infinity;
    return forms.filter((f) => {
      const ts = new Date(f.created_at).getTime();
      return ts >= fromTs && ts < toTs;
    });
  }, [forms, periodFrom, periodTo]);

  const prevFilteredForms = useMemo(() => {
    if (!prevFrom) return [];
    const fromTs = new Date(prevFrom).getTime();
    const toTs = prevTo ? new Date(prevTo).getTime() : Infinity;
    return forms.filter((f) => {
      const ts = new Date(f.created_at).getTime();
      return ts >= fromTs && ts < toTs;
    });
  }, [forms, prevFrom, prevTo]);

  return {
    period,
    onPeriodChange,
    isPending,
    periodLabel: dateRanges.previousLabel,
    dateRanges,
    filteredForms,
    prevFilteredForms,
    brigadistaMetrics,
    prevBrigadistaMetrics,
    metricsLoading,
  };
}
