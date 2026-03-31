/**
 * map-camera-helpers.ts — Pure camera utility functions for TierraMap.
 *
 * Extracted from tierra-map.tsx to keep the map component focused on
 * rendering. All functions here are side-effect-free except
 * `applyFluidMapInteractions` which configures a native map instance.
 */

import type { DragPanOptions, Map as NativeMap } from "maplibre-gl";
import { PERU_VIEW } from "./constants";

/* ========== Constants ========== */

export const MAP_DRAG_PAN_OPTIONS: DragPanOptions = {
  linearity: 0.24,
  maxSpeed: 1800,
  deceleration: 2600,
};

export const TRACKPAD_ZOOM_RATE = 1 / 130;
export const WHEEL_ZOOM_RATE = 1 / 680;
export const CAMERA_PITCH_MIN = 0;
export const CAMERA_PITCH_MAX = 60;

/* ========== Helpers ========== */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Derives a MapLibre initialViewState from a bounding box.
 * Used when lockedBounds is provided so the map births at the right place
 * with no Peru flash — no animation needed.
 */
export function boundsToInitialViewState(bounds: [[number, number], [number, number]]) {
  const [sw, ne] = bounds;
  return {
    longitude: (sw[0] + ne[0]) / 2,
    latitude: (sw[1] + ne[1]) / 2,
    zoom: boundsToMinZoom(bounds),
  };
}

/**
 * Expand bounds by a fraction of their span (e.g. 0.15 = 15% margin on each side).
 * Used to give maxBounds a small margin so the user can pan slightly but not escape.
 */
export function expandBounds(
  bounds: [[number, number], [number, number]],
  fraction: number,
): [[number, number], [number, number]] {
  const [sw, ne] = bounds;
  const dLng = (ne[0] - sw[0]) * fraction;
  const dLat = (ne[1] - sw[1]) * fraction;
  return [
    [sw[0] - dLng, sw[1] - dLat],
    [ne[0] + dLng, ne[1] + dLat],
  ];
}

/**
 * Derive a reasonable minZoom from locked bounds so the user cannot
 * zoom out far enough to see beyond the jurisdiction.
 * Heuristic: larger bounds → lower minZoom. Returns a value between 7–12.
 */
export function boundsToMinZoom(bounds: [[number, number], [number, number]]): number {
  const [sw, ne] = bounds;
  const spanLng = Math.abs(ne[0] - sw[0]);
  const spanLat = Math.abs(ne[1] - sw[1]);
  const maxSpan = Math.max(spanLng, spanLat);
  // ~0.01° span (tiny district) → zoom 14; ~2° span (large dep) → zoom 7
  if (maxSpan < 0.02) return 13;
  if (maxSpan < 0.05) return 12;
  if (maxSpan < 0.1) return 11;
  if (maxSpan < 0.3) return 10;
  if (maxSpan < 0.6) return 9;
  if (maxSpan < 1.2) return 8;
  return 7;
}

/**
 * Configures fluid map interactions (drag, scroll, rotation, touch)
 * and sets up grab/grabbing cursors.
 */
export function applyFluidMapInteractions(map: NativeMap) {
  map.dragPan.enable(MAP_DRAG_PAN_OPTIONS);
  map.scrollZoom.enable();
  map.scrollZoom.setZoomRate(TRACKPAD_ZOOM_RATE);
  map.scrollZoom.setWheelZoomRate(WHEEL_ZOOM_RATE);
  map.dragRotate.enable();
  map.touchPitch.enable();
  map.keyboard.enableRotation();
  map.touchZoomRotate.enable({ around: "center" });

  const canvas = map.getCanvas();
  canvas.style.cursor = "grab";
  map.on("dragstart", () => { canvas.style.cursor = "grabbing"; });
  map.on("dragend", () => { canvas.style.cursor = "grab"; });
}
