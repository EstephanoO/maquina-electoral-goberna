"use client";

/**
 * useAutoFit — fits map bounds when drill state changes.
 *
 * Fixes from original:
 * - geoData deps are now granular (only the levels actually read)
 * - skipNextFit ref exposed so click handler can coordinate
 * - Async API calls only fire on navigation-back
 */

import { useEffect, useRef } from "react";
import type { MapRef } from "@vis.gl/react-maplibre";
import type { DrillState, GeoDataState } from "../types";
import { getBoundsForCurrentDrill } from "../utils";
import { getProvincias, getDistritos } from "@/lib/services/geo";

export function useAutoFit(
  mapRef: React.RefObject<MapRef | null>,
  drillState: DrillState,
  geoData: GeoDataState,
  skipNextFitRef: React.MutableRefObject<boolean>,
) {
  const prevLevelRef = useRef<number>(drillState.level);

  useEffect(() => {
    if (!mapRef.current) return;

    // Skip if bounds were already handled by click handler
    if (skipNextFitRef.current) {
      skipNextFitRef.current = false;
      prevLevelRef.current = drillState.level;
      return;
    }

    const prevLevel = prevLevelRef.current;
    const isNavigatingBack = drillState.level < prevLevel;
    prevLevelRef.current = drillState.level;

    const map = mapRef.current;

    // Navigation back — use cached API bounds (async, more precise)
    if (isNavigatingBack) {
      if (drillState.level === 1 && drillState.depCode) {
        getProvincias(drillState.depCode).then((result) => {
          if (result.ok && result.bounds && mapRef.current) {
            mapRef.current.fitBounds(result.bounds, { padding: 50, duration: 800 });
          }
        }).catch(() => {});
        return;
      }
      if (drillState.level === 2 && drillState.provCode) {
        getDistritos(drillState.provCode).then((result) => {
          if (result.ok && result.bounds && mapRef.current) {
            mapRef.current.fitBounds(result.bounds, { padding: 50, duration: 800 });
          }
        }).catch(() => {});
        return;
      }
    }

    // Use shared bounds calculation for current drill level
    const bounds = getBoundsForCurrentDrill(drillState, geoData);
    if (bounds) map.fitBounds(bounds, { padding: 50, duration: 800 });
  }, [drillState.level, drillState.depCode, drillState.provCode, drillState.distCode, geoData, mapRef, skipNextFitRef]);
}
