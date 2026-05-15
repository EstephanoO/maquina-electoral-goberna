import { API_BASE } from './api';
import type { Contact } from './offline-queue/contacts';

export const PERU_BBOX: [number, number, number, number] = [-81.4, -18.4, -68.6, 0];

// Tegola vector tiles served by the backend (see Fase 1 spec §map).
export const TILE_URL = `${API_BASE}/tiles/{z}/{x}/{y}.vector.pbf`;

export type ContactFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id: string; name: string; estado: string };
};

export function contactsToGeoJSON(contacts: Contact[]): {
  type: 'FeatureCollection'; features: ContactFeature[];
} {
  const features = contacts
    .filter((c) => c.lat != null && c.lng != null)
    .map((c): ContactFeature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng as number, c.lat as number] },
      properties: { id: c.id, name: c.name, estado: c.estado },
    }));
  return { type: 'FeatureCollection', features };
}
