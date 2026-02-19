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
import { PERU_BOUNDS } from "../constants";
import { calculateBoundsFromFeatures } from "../utils";
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

    // Level 0: fit to GeoJSON or Peru bounds
    if (drillState.level === 0) {
      const features = geoData.dep?.features ?? geoData.dist?.features ?? [];
      if (features.length > 0) {
        const bounds = calculateBoundsFromFeatures(features);
        if (bounds) { map.fitBounds(bounds, { padding: 50, duration: 800 }); return; }
      }
      map.fitBounds(PERU_BOUNDS, { padding: 40, duration: 800 });
      return;
    }

    // Navigation back — use cached API bounds
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

    // GeoJSON fallback: fit to features at current level
    let features: GeoJSON.Feature[] = [];

    if (drillState.level === 1 && drillState.depCode) {
      if (geoData.prov) {
        features = geoData.prov.features.filter((f) => f.properties?.coddep === drillState.depCode);
      }
      if (features.length === 0 && geoData.dep) {
        features = geoData.dep.features.filter((f) => f.properties?.coddep === drillState.depCode);
      }
    } else if (drillState.level === 2 && drillState.provCode) {
      if (geoData.dist) {
        features = geoData.dist.features.filter((f) => f.properties?.codprov_full === drillState.provCode);
      }
      if (features.length === 0 && geoData.prov) {
        features = geoData.prov.features.filter((f) => f.properties?.codprov_full === drillState.provCode);
      }
    } else if (drillState.level === 3 && drillState.distCode) {
      if (geoData.sector) {
        features = geoData.sector.features.filter((f) => f.properties?.ubigeo === drillState.distCode);
      }
      if (features.length === 0 && geoData.dist) {
        features = geoData.dist.features.filter((f) => f.properties?.ubigeo === drillState.distCode);
      }
    }

    if (features.length === 0) return;

    const bounds = calculateBoundsFromFeatures(features);
    if (bounds) map.fitBounds(bounds, { padding: 50, duration: 800 });
  }, [drillState.level, drillState.depCode, drillState.provCode, drillState.distCode, geoData, mapRef, skipNextFitRef]);
}
