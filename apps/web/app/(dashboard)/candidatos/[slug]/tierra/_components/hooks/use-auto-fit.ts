"use client";

/**
 * useAutoFit — fits map bounds when drill state changes.
 *
 * All geographic data is now served via vector tiles (no GeoJSON fallback).
 * Bounds are computed from the backend geo hierarchy cache (Redis-backed).
 */

import { useEffect, useRef } from "react";
import type { MapRef } from "@vis.gl/react-maplibre";
import type { DrillState } from "../types";
import { PERU_BOUNDS, FLY_DURATION } from "../constants";
import { getDepartamentos, getProvincias, getDistritos } from "@/lib/services/geo";

export function useAutoFit(
  mapRef: React.RefObject<MapRef | null>,
  drillState: DrillState,
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

    prevLevelRef.current = drillState.level;
    const map = mapRef.current;

    // Level 0: Peru overview
    if (drillState.level === 0) {
      map.fitBounds(PERU_BOUNDS, { padding: 40, duration: FLY_DURATION });
      return;
    }

    // Level 1: fit to departamento bounds via API
    if (drillState.level === 1 && drillState.depCode) {
      getDepartamentos().then((result) => {
        if (!result.ok || !result.departamentos || !mapRef.current) return;
        const dep = result.departamentos.find((d) => d.coddep === drillState.depCode);
        if (dep) mapRef.current.fitBounds(dep.bounds, { padding: 50, duration: FLY_DURATION });
      }).catch(() => {});
      return;
    }

    // Level 2: fit to provincia bounds via API
    if (drillState.level === 2 && drillState.depCode && drillState.provCode) {
      getProvincias(drillState.depCode).then((result) => {
        if (!result.ok || !result.provincias || !mapRef.current) return;
        const prov = result.provincias.find((p) => p.codprov_full === drillState.provCode);
        if (prov) mapRef.current.fitBounds(prov.bounds, { padding: 50, duration: FLY_DURATION });
      }).catch(() => {});
      return;
    }

    // Level 3+: fit to distrito bounds via API
    if (drillState.level >= 3 && drillState.provCode && drillState.distCode) {
      getDistritos(drillState.provCode).then((result) => {
        if (!result.ok || !result.distritos || !mapRef.current) return;
        const dist = result.distritos.find((d) => d.ubigeo === drillState.distCode);
        if (dist) mapRef.current.fitBounds(dist.bounds, { padding: 50, duration: FLY_DURATION });
      }).catch(() => {});
    }
  }, [drillState.level, drillState.depCode, drillState.provCode, drillState.distCode, mapRef, skipNextFitRef]);
}
