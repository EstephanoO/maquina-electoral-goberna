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

/** GPS threshold: 15s without GPS → idle */
export const GPS_CONNECTED_MS = 15_000;
/** Form threshold: 2min after submitting a form → still connected */
export const FORM_CONNECTED_MS = 2 * 60_000;
const IDLE_THRESHOLD_MS = 10 * 60_000;

/** Derive agent connection status from its last-seen timestamp (GPS-only, legacy) */
export function getAgentStatus(ts: string, now: number): AgentStatus {
  const age = now - new Date(ts).getTime();
  if (age < GPS_CONNECTED_MS) return "connected";
  if (age < IDLE_THRESHOLD_MS) return "idle";
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

/* ─── Tile coordinate math ─── */

/** Convert lng/lat to slippy-map tile coordinates at a given zoom (Web Mercator). */
export function lngLatToTile(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return [Math.max(0, Math.min(x, n - 1)), Math.max(0, Math.min(y, n - 1))];
}

/**
 * Pre-fetch tiles for Peru at low zoom levels (z3-z8) in the background.
 * Uses low-priority fetch; tiles are cached by the browser HTTP cache,
 * making zoom-out transitions instant after the first load.
 *
 * Prewarms BOTH vector tiles (Tegola) and raster basemap tiles (CARTO).
 * Without raster prewarming, zoom-out shows background color until CARTO tiles arrive.
 */
const CARTO_TEMPLATE = "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png";

export function prewarmTiles(templateUrl: string) {
  const PERU_SW: [number, number] = [-81.4, -18.4];
  const PERU_NE: [number, number] = [-68.7, -0.1];

  const urls: string[] = [];
  for (let z = 3; z <= 8; z++) {
    const [x0, y0] = lngLatToTile(PERU_SW[0], PERU_NE[1], z);
    const [x1, y1] = lngLatToTile(PERU_NE[0], PERU_SW[1], z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        // Vector tiles (Tegola via backend proxy)
        urls.push(templateUrl.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
        // Raster basemap tiles (CARTO CDN) — without these, zoom-out shows white/background
        urls.push(CARTO_TEMPLATE.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
      }
    }
  }

  let i = 0;
  const BATCH = 6;
  function fetchBatch() {
    const batch = urls.slice(i, i + BATCH);
    if (!batch.length) return;
    i += BATCH;
    Promise.all(batch.map((u) => fetch(u, { priority: "low" } as RequestInit).catch(() => {}))).then(() => {
      setTimeout(fetchBatch, 50);
    });
  }
  fetchBatch();
}

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
