"use client";

/**
 * useDrillBounds — resolves the geographic bounding box AND polygon geometry
 * for the current drill level.
 *
 * Uses the same geo service (browser-cached) as useAutoFit, so no extra network
 * requests for bounds. Also fetches the actual polygon geometry for accurate
 * point-in-polygon filtering (replaces bounding-box filtering which has
 * overlap issues between neighboring irregular polygons).
 *
 * Returns null at level 0 (whole Peru = no filter).
 */

import { useEffect, useState } from "react";
import type { GeoBounds } from "@/lib/services/geo";
import type { DrillState } from "../types";
import { resolveDrillRegion, type DrillRegion } from "./resolve-drill-bounds";

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
    resolveDrillRegion(drillState).then((r) => {
      if (!cancelled) setRegion(r);
    }).catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillState]);

  return region;
}
