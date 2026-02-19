/* ========== Tierra Map — Pure Utility Functions ========== */

import type { MapGeoJSONFeature } from "maplibre-gl";

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

type Bounds = [[number, number], [number, number]];

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

/**
 * Normalize a GeoJSON FeatureCollection property names to lowercase
 * for consistent Tegola/GeoJSON filter interop.
 */
export function normalizeFeatureProperties(
  fc: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const p = f.properties ?? {};
      return {
        ...f,
        properties: {
          ...p,
          coddep: p.CODDEP ?? p.coddep ?? "",
          departamento: p.DEPARTAMEN ?? p.departamento ?? "",
          codprov: p.CODPROV ?? p.codprov ?? "",
          provincia: p.PROVINCIA ?? p.provincia ?? "",
          codprov_full: (p.CODDEP ?? "") + (p.CODPROV ?? ""),
          coddist: p.CODDIST ?? p.coddist ?? "",
          distrito: p.DISTRITO ?? p.distrito ?? "",
          ubigeo: p.UBIGEO ?? p.ubigeo ?? "",
          sector: p.SECTOR ?? p.sector ?? null,
          subsector: p.SUBSECTOR ?? p.subsector ?? null,
        },
      };
    }),
  };
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
