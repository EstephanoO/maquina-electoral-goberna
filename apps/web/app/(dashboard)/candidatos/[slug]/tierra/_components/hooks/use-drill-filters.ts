"use client";

/**
 * useDrillFilters — all MapLibre filter expressions for the drill-down hierarchy.
 *
 * Fixes from original:
 * - depFillFilter === depLineFilter → consolidated into one
 * - provFillFilter === provLineFilter → consolidated into one
 * - distFillFilter === distLineFilter → consolidated into one
 * - depOtherFilter was zombie (only used by removed dep-label) → removed
 * - SHOW_ALL_FILTER constant reused (no new array per render)
 */

import { useMemo } from "react";
import type { FilterSpecification } from "maplibre-gl";
import type { DrillFilters, DrillState } from "../types";
import { HIDE_FILTER, SHOW_ALL_FILTER } from "../constants";

export function useDrillFilters(
  drillState: DrillState,
  campaignId: string,
): DrillFilters {
  const campaignFilter: FilterSpecification = useMemo(
    () => ["==", ["get", "campaign_id"], campaignId],
    [campaignId],
  );

  // Departamentos: all at level 0, only selected at level 1+
  const depFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return SHOW_ALL_FILTER;
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode]);

  // Same filter for fill and line — one memo instead of two
  const depLineFilter = depFillFilter;

  // Provincias: level 1 all provs, level 2+ only selected
  const provFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return HIDE_FILTER;
    if (drillState.level >= 2 && drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode, drillState.provCode]);

  // Distritos: level 2 all dists, level 3+ only selected
  const distFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 2) return HIDE_FILTER;
    if (drillState.level >= 3 && drillState.distCode) return ["==", ["get", "ubigeo"], drillState.distCode];
    if (drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.provCode, drillState.distCode]);

  // Priority layers (red campaign-specific zones)
  const priorityDepFilter: FilterSpecification = useMemo(() => {
    if (drillState.level >= 1) return HIDE_FILTER;
    return ["all", campaignFilter] as FilterSpecification;
  }, [campaignFilter, drillState.level]);

  const priorityProvFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 1 || !drillState.depCode) return HIDE_FILTER;
    if (drillState.level >= 2) return HIDE_FILTER;
    return ["all", campaignFilter, ["==", ["get", "coddep"], drillState.depCode]] as FilterSpecification;
  }, [campaignFilter, drillState.level, drillState.depCode]);

  const priorityDistFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 2 || !drillState.provCode) return HIDE_FILTER;
    if (drillState.level >= 3) return HIDE_FILTER;
    return ["all", campaignFilter, ["==", ["get", "codprov_full"], drillState.provCode]] as FilterSpecification;
  }, [campaignFilter, drillState.level, drillState.provCode]);

  // Sectors / subsectors
  const sectorFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 3 || !drillState.distCode) return HIDE_FILTER;
    if (drillState.level === 3) {
      return ["all", campaignFilter, ["==", ["get", "parent_code"], drillState.distCode], ["==", ["get", "zone_level"], "sector"]] as FilterSpecification;
    }
    if (drillState.level === 4 && drillState.sector != null) {
      return ["all", campaignFilter, ["==", ["get", "parent_code"], drillState.distCode], ["==", ["get", "zone_level"], "subsector"], ["==", ["get", "sector"], drillState.sector]] as FilterSpecification;
    }
    return ["all", campaignFilter, ["==", ["get", "parent_code"], drillState.distCode]] as FilterSpecification;
  }, [campaignFilter, drillState.level, drillState.distCode, drillState.sector]);

  return {
    depFillFilter,
    depLineFilter,
    provFilter,
    distFilter,
    priorityDepFilter,
    priorityProvFilter,
    priorityDistFilter,
    sectorFilter,
  };
}
