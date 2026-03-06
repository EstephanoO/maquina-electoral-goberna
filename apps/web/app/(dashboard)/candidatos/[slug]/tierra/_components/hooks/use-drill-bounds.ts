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
import type { DrillState } from "../types";
import { resolveDrillBounds } from "./resolve-drill-bounds";

export function useDrillBounds(drillState: DrillState): GeoBounds | null {
  const [bounds, setBounds] = useState<GeoBounds | null>(null);

  useEffect(() => {
    if (drillState.level === 0) {
      setBounds(null);
      return;
    }

    let cancelled = false;
    resolveDrillBounds(drillState).then((b) => {
      if (!cancelled) setBounds(b);
    }).catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillState]);

  return bounds;
}
