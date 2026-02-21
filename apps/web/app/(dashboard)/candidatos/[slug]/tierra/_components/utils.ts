/* ========== Tierra Map — Pure Utility Functions ========== */

import type { MapGeoJSONFeature } from "maplibre-gl";
import type { AgentStatus } from "./types";

/* ─── Time helpers ─── */

/** Second-precision relative time (for activity logs where events just happened) */
export function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return "ahora";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Minute-precision relative time (for "last seen" timestamps) */
export function getTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/* ─── Agent status ─── */

const TWO_MIN = 2 * 60_000;
const TEN_MIN = 10 * 60_000;

/** Derive agent connection status from its last-seen timestamp */
export function getAgentStatus(ts: string, now: number): AgentStatus {
  const age = now - new Date(ts).getTime();
  if (age < TWO_MIN) return "connected";
  if (age < TEN_MIN) return "idle";
  return "inactive";
}

/**
 * Recursively extract [lng, lat] coordinate pairs from any GeoJSON geometry.
 * Handles Point, MultiPoint, LineString, Polygon, Multi* and GeometryCollection.
 */
export function extractCoordsFromGeometry(c: unknown, coords: number[][]): void {
  if (!Array.isArray(c)) return;
  if (typeof c[0] === "number" && typeof c[1] === "number") {
    coords.push(c as number[]);
  } else {
    for (const item of c) extractCoordsFromGeometry(item, coords);
  }
}

export type Bounds = [[number, number], [number, number]];

/**
 * Get the bounding box of a single MapGeoJSONFeature (clicked feature from map).
 */
export function getBoundsFromFeature(feature: MapGeoJSONFeature): Bounds | null {
  try {
    const coords: number[][] = [];
    extractCoordsFromGeometry(
      (feature.geometry as unknown as { coordinates: unknown }).coordinates,
      coords,
    );
    if (coords.length === 0) return null;
    return boundsFromCoords(coords);
  } catch {
    return null;
  }
}

/**
 * Calculate the bounding box of an array of GeoJSON Features.
 */
export function calculateBoundsFromFeatures(features: GeoJSON.Feature[]): Bounds | null {
  if (features.length === 0) return null;

  const coords: number[][] = [];
  for (const f of features) {
    if (f.geometry && "coordinates" in f.geometry) {
      extractCoordsFromGeometry(f.geometry.coordinates, coords);
    }
  }
  if (coords.length === 0) return null;
  return boundsFromCoords(coords);
}

/* ─── Bounds for current drill level ─── */

import { PERU_BOUNDS } from "./constants";

/* ─── Internal ─── */

function boundsFromCoords(coords: number[][]): Bounds | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  if (minLng === Infinity || maxLng === -Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}
