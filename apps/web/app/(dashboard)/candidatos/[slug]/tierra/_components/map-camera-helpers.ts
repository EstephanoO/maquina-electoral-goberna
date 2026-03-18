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
    zoom: 13, // safe zoom for a small district like Carmen de la Legua
  };
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
