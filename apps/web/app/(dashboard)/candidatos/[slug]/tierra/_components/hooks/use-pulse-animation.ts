"use client";

/**
 * usePulseAnimation — Animates expanding/fading rings on new form points.
 *
 * MapLibre GL renders layers via WebGL, so CSS keyframes don't work.
 * Instead, this hook uses requestAnimationFrame to smoothly interpolate
 * `circle-radius` and `circle-stroke-opacity` on the pulse layer.
 *
 * The animation is a repeating "sonar ping": a circle expands outward
 * from the point while fading out, then resets. Runs only while
 * `hasNewPoints` is true to avoid wasted GPU cycles.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { MapRef } from "@vis.gl/react-maplibre";

const PULSE_LAYER_ID = "forms-new-pulse";
const GLOW_LAYER_ID = "forms-new-glow";

/** Full cycle duration in ms */
const CYCLE_MS = 1800;

/** Radius range (MapLibre circle-radius units) */
const R_MIN = 5;
const R_MAX = 28;

/** Stroke opacity range */
const O_MAX = 0.85;
const O_MIN = 0;

/** Glow opacity range */
const GLOW_O_MAX = 0.55;

export function usePulseAnimation(
  mapRef: RefObject<MapRef | null>,
  hasNewPoints: boolean,
  isDark: boolean,
) {
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!hasNewPoints) {
      // No new points — stop any running animation and reset paint
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const map = mapRef.current?.getMap();
    if (!map) return;

    startRef.current = performance.now();

    function tick(now: number) {
      const m = mapRef.current?.getMap();
      if (!m || !m.getLayer(PULSE_LAYER_ID)) {
        rafRef.current = null;
        return;
      }

      const elapsed = now - startRef.current;
      // t goes 0 → 1 per cycle, repeating
      const t = (elapsed % CYCLE_MS) / CYCLE_MS;

      // Ease-out quad for smooth expansion
      const eased = 1 - (1 - t) * (1 - t);

      const radius = R_MIN + (R_MAX - R_MIN) * eased;
      const strokeOpacity = O_MAX * (1 - eased);

      m.setPaintProperty(PULSE_LAYER_ID, "circle-radius", radius);
      m.setPaintProperty(PULSE_LAYER_ID, "circle-stroke-opacity", strokeOpacity);

      // Glow layer (dark theme only)
      if (m.getLayer(GLOW_LAYER_ID)) {
        const glowRadius = R_MIN + (R_MAX * 1.3 - R_MIN) * eased;
        const glowOpacity = GLOW_O_MAX * (1 - eased);
        m.setPaintProperty(GLOW_LAYER_ID, "circle-radius", glowRadius);
        m.setPaintProperty(GLOW_LAYER_ID, "circle-opacity", glowOpacity);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [hasNewPoints, mapRef, isDark]);
}
