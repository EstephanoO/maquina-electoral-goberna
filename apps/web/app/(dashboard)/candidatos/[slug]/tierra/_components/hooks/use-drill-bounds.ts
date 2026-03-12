"use client";

/**
 * useDrillBounds / useDrillRegion — resolves the geographic bounding box
 * AND polygon geometry for the current drill level.
 *
 * Two-phase strategy for instant feedback:
 * 1. Bounds resolve first (browser-cached, ~0ms) → numbers update immediately
 * 2. Polygon geometry arrives shortly after (~200-500ms) → numbers refine with
 *    accurate point-in-polygon filtering
 *
 * This avoids the 1-2s blank/stale period that happened when both had to
 * resolve together before any UI update.
 */

import { useEffect, useState } from "react";
import type { GeoBounds } from "@/lib/services/geo";
import { getAdminGeometry } from "@/lib/services/geo";
import type { DrillState } from "../types";
import { resolveDrillBounds, type DrillRegion } from "./resolve-drill-bounds";

export type { DrillRegion } from "./resolve-drill-bounds";

export function useDrillBounds(drillState: DrillState): GeoBounds | null {
  const region = useDrillRegion(drillState);
  return region?.bounds ?? null;
}

export function useDrillRegion(drillState: DrillState): DrillRegion | null {
  const [region, setRegion] = useState<DrillRegion | null>(null);

  useEffect(() => {
    if (drillState.level === 0) {
      setRegion(null);
      return;
    }

    let cancelled = false;

    // Phase 1: resolve bounds immediately (browser-cached, ~0ms).
    // This updates the counters right away with bounding-box filtering.
    resolveDrillBounds(drillState).then((bounds) => {
      if (cancelled || !bounds) return;
      setRegion((prev) => {
        // Only set if we don't already have geometry for this exact bounds
        if (prev?.bounds === bounds && prev?.geometry) return prev;
        return { bounds, geometry: null };
      });
    }).catch(() => {});

    // Phase 2: fetch polygon geometry (network request, ~200-500ms first time).
    // When it arrives, the counters refine with accurate point-in-polygon.
    const level = drillState.level === 1 ? "dep" as const
      : drillState.level === 2 ? "prov" as const
      : "dist" as const;
    const code = drillState.level === 1 ? drillState.depCode
      : drillState.level === 2 ? drillState.provCode
      : drillState.distCode;

    if (code) {
      getAdminGeometry(level, code).then((res) => {
        if (cancelled || !res.ok || !res.geometry) return;
        setRegion((prev) => {
          if (!prev) return prev; // bounds not resolved yet — unlikely but safe
          return { bounds: prev.bounds, geometry: res.geometry! };
        });
      }).catch(() => {});
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillState]);

  return region;
}
