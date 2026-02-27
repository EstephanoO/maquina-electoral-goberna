"use client";

import { useState, useEffect } from "react";

/* ========== Breakpoint detection ========== */

/**
 * Matches the dashboard sidebar breakpoint (768px) and adds a TV tier (>1920px).
 *
 * Returns:
 *  - `mobile`  : width < 768
 *  - `desktop` : 768 <= width <= 1920
 *  - `tv`      : width > 1920
 */
export type ScreenTier = "mobile" | "desktop" | "tv";

const MOBILE_MAX = 768;
const TV_MIN = 1921;

function getTier(w: number): ScreenTier {
  if (w < MOBILE_MAX) return "mobile";
  if (w >= TV_MIN) return "tv";
  return "desktop";
}

export function useBreakpoint(): ScreenTier {
  const [tier, setTier] = useState<ScreenTier>("desktop"); // SSR-safe default

  useEffect(() => {
    const update = () => setTier(getTier(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return tier;
}
