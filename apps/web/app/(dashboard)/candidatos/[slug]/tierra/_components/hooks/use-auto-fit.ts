"use client";

/**
 * useAutoFit — fits map bounds when drill state changes.
 *
 * Bound resolution is delegated to resolveDrillBounds (shared with useDrillBounds)
 * so both hooks stay in sync if the geo API ever changes.
 */

import { useEffect, useRef } from "react";
import type { MapRef } from "@vis.gl/react-maplibre";
import type { DrillState } from "../types";
import { PERU_BOUNDS, FLY_DURATION } from "../constants";
import { resolveDrillBounds } from "./resolve-drill-bounds";

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

    resolveDrillBounds(drillState).then((bounds) => {
      if (!bounds || !mapRef.current) return;
      mapRef.current.fitBounds(bounds, { padding: 50, duration: FLY_DURATION });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillState, mapRef, skipNextFitRef]);
}
