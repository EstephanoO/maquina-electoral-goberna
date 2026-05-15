/**
 * Map configuration — pure, no React Native imports.
 *
 * Keeping this module free of React Native / Expo dependencies allows it
 * to be exercised directly with the bun test runner without triggering
 * RN's Flow-typed index.js.
 *
 * TILE_URL is the style JSON endpoint for MapLibre (used in map.tsx).
 * The Tegola vector tile URL is hardcoded in map.tsx MAP_STYLE to keep
 * this file importable from both the app and the test runner.
 */

import type { Contact } from './offline-queue/contacts';

// Style JSON endpoint for MapLibre map.tsx.
export const TILE_URL =
  'https://tiles.gobernakarte.com/styles/goberna-basic/style.json';

// Bounding box for Peru [west, south, east, north]
export const PERU_BBOX: [number, number, number, number] = [
  -81.41, -18.35, -68.65, -0.04,
];

export type ContactFeature = GeoJSON.Feature<
  GeoJSON.Point,
  { id: string; name: string; estado: Contact['estado'] }
>;

export type ContactGeoJSON = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { id: string; name: string; estado: Contact['estado'] }
>;

/**
 * Convert a Contact array into a GeoJSON FeatureCollection of Points.
 * Contacts without lat/lng or with deleted_at set are excluded.
 */
export function contactsToGeoJSON(contacts: Contact[]): ContactGeoJSON {
  const features: ContactFeature[] = contacts
    .filter((c) => c.lat !== null && c.lng !== null && !c.deleted_at)
    .map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng!, c.lat!] },
      properties: { id: c.id, name: c.name, estado: c.estado },
    }));
  return { type: 'FeatureCollection', features };
}
