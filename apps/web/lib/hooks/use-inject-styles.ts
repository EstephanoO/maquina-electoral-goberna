/**
 * GOBERNA — useInjectStyles Hook
 * Inject CSS keyframes on mount (idempotent).
 */

import { useEffect } from "react";
import { injectStyles } from "../utils";
import { GOBERNA_KEYFRAMES } from "../constants";

const STYLES_ID = "goberna-keyframes";

export function useInjectStyles(): void {
  useEffect(() => {
    injectStyles(STYLES_ID, GOBERNA_KEYFRAMES);
  }, []);
}
