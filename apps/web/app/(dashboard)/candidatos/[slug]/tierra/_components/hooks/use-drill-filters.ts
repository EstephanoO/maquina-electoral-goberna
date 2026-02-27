"use client";

/**
 * useDrillFilters — all MapLibre filter expressions for the drill-down hierarchy.
 *
 * Tile-native masking strategy:
 *   Fill layers always show ALL siblings at the active level so that the map
 *   engine's own tile geometry can be used to darken non-selected zones via
 *   data-driven paint expressions. Line layers stay restrictive to avoid
 *   visual clutter.
 *
 * Example (level 1 = provincias active):
 *   depFillFilter  = SHOW_ALL_FILTER   (all deps visible, paint darkens non-selected)
 *   depLineFilter  = selected dep only (only selected dep outline shown)
 *   provFillFilter = all provs in dep  (all siblings visible, paint darkens non-selected)
 *   provLineFilter = all provs in dep  (same — lines for active level)
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

  // ─── DEPARTAMENTOS ───
  // Fill: ALWAYS show all deps (tile-native mask darkens non-selected via paint)
  const depFillFilter: FilterSpecification = SHOW_ALL_FILTER;

  // Line: level 0 all, level 1+ only selected (reduce clutter)
  const depLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return SHOW_ALL_FILTER;
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode]);

  // ─── PROVINCIAS ───
  // Fill: show all provs in selected dep (for tile-native masking at level 2+)
  const provFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return HIDE_FILTER;
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode]);

  // Line: level 1 all provs in dep, level 2+ only selected prov
  const provLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return HIDE_FILTER;
    if (drillState.level >= 2 && drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode, drillState.provCode]);

  // ─── DISTRITOS ───
  // Fill: show all dists in selected prov (for tile-native masking at level 3+)
  const distFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 2) return HIDE_FILTER;
    if (drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.provCode]);

  // Line: level 2 all dists, level 3+ only selected dist
  const distLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 2) return HIDE_FILTER;
    if (drillState.level >= 3 && drillState.distCode) return ["==", ["get", "ubigeo"], drillState.distCode];
    if (drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.provCode, drillState.distCode]);

  // ─── PRIORITY LAYERS — filtered by campaign_id (tiles are already filtered server-side,
  //     but we add client-side filter too for defense-in-depth) ───
  const priorityDepFilter: FilterSpecification = useMemo(() => {
    if (!campaignId) return HIDE_FILTER;
    // Show priority departments whenever we have a campaign
    return campaignFilter;
  }, [campaignId, campaignFilter]);

  const priorityProvFilter: FilterSpecification = useMemo(() => {
    if (!campaignId) return HIDE_FILTER;
    // Show priority provinces scoped to the drilled departamento (or all if at dept level)
    if (drillState.depCode) {
      return ["all", campaignFilter, ["==", ["get", "coddep"], drillState.depCode]] as FilterSpecification;
    }
    return campaignFilter;
  }, [campaignId, campaignFilter, drillState.depCode]);

  const priorityDistFilter: FilterSpecification = useMemo(() => {
    if (!campaignId) return HIDE_FILTER;
    // Show priority districts scoped to the drilled provincia (or dep, or all)
    if (drillState.provCode) {
      return ["all", campaignFilter, ["==", ["get", "codprov_full"], drillState.provCode]] as FilterSpecification;
    }
    if (drillState.depCode) {
      return ["all", campaignFilter, ["==", ["get", "coddep"], drillState.depCode]] as FilterSpecification;
    }
    return campaignFilter;
  }, [campaignId, campaignFilter, drillState.depCode, drillState.provCode]);

  // ─── SECTORS / SUBSECTORS ───
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

  // ─── BRIGADISTA LOCATIONS — always visible when campaign is set (points filtered server-side by campaign_id) ───
  const brigadistaFilter: FilterSpecification = useMemo(() => {
    if (!campaignId) return HIDE_FILTER;
    return campaignFilter;
  }, [campaignId, campaignFilter]);

  return {
    depFillFilter,
    depLineFilter,
    provFillFilter,
    provLineFilter,
    distFillFilter,
    distLineFilter,
    priorityDepFilter,
    priorityProvFilter,
    priorityDistFilter,
    sectorFilter,
    brigadistaFilter,
  };
}
