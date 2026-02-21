"use client";

/**
 * useDrillBounds — resolves the geographic bounding box for the current drill level.
 *
 * Uses the same geo service (browser-cached) as useAutoFit, so no extra network
 * requests. Returns null at level 0 (whole Peru = no filter).
 *
 * The bounds are used to geo-filter forms and agents so that the metrics panel
 * and data table only show data for the selected region.
 */

import { useEffect, useState } from "react";
import type { GeoBounds } from "@/lib/services/geo";
import { getDepartamentos, getProvincias, getDistritos } from "@/lib/services/geo";
import type { DrillState } from "../types";

export function useDrillBounds(drillState: DrillState): GeoBounds | null {
  const [bounds, setBounds] = useState<GeoBounds | null>(null);

  useEffect(() => {
    // Level 0 = Peru overview → no geo filter
    if (drillState.level === 0) {
      setBounds(null);
      return;
    }

    let cancelled = false;

    // Level 1+: departamento bounds
    if (drillState.level === 1 && drillState.depCode) {
      getDepartamentos().then((res) => {
        if (cancelled || !res.ok || !res.departamentos) return;
        const dep = res.departamentos.find((d) => d.coddep === drillState.depCode);
        if (dep) setBounds(dep.bounds);
      }).catch(() => {});
      return () => { cancelled = true; };
    }

    // Level 2: provincia bounds
    if (drillState.level === 2 && drillState.depCode && drillState.provCode) {
      getProvincias(drillState.depCode).then((res) => {
        if (cancelled || !res.ok || !res.provincias) return;
        const prov = res.provincias.find((p) => p.codprov_full === drillState.provCode);
        if (prov) setBounds(prov.bounds);
      }).catch(() => {});
      return () => { cancelled = true; };
    }

    // Level 3+: distrito bounds
    if (drillState.level >= 3 && drillState.provCode && drillState.distCode) {
      getDistritos(drillState.provCode).then((res) => {
        if (cancelled || !res.ok || !res.distritos) return;
        const dist = res.distritos.find((d) => d.ubigeo === drillState.distCode);
        if (dist) setBounds(dist.bounds);
      }).catch(() => {});
      return () => { cancelled = true; };
    }

    // Fallback — shouldn't reach here, but clear bounds if drill state is incomplete
    setBounds(null);
    return () => { cancelled = true; };
  }, [drillState.level, drillState.depCode, drillState.provCode, drillState.distCode]);

  return bounds;
}
