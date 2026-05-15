import { PERU_BBOX, contactsToGeoJSON, TILE_URL } from '../map-config';
import type { Contact } from '../offline-queue/contacts';

describe('map-config', () => {
  it('PERU_BBOX has 4 coords', () => {
    expect(PERU_BBOX).toHaveLength(4);
    // [west, south, east, north]
    expect(PERU_BBOX[0]).toBeLessThan(PERU_BBOX[2]); // west < east
    expect(PERU_BBOX[1]).toBeLessThan(PERU_BBOX[3]); // south < north
  });

  it('TILE_URL is a string', () => {
    expect(typeof TILE_URL).toBe('string');
    expect(TILE_URL.length).toBeGreaterThan(0);
  });

  it('contactsToGeoJSON returns FeatureCollection', () => {
    const contacts: Contact[] = [
      {
        id: '1', name: 'Ana', phone: null, ubigeo: null, distrito_nombre: null,
        lat: -12.046, lng: -77.043, estado: 'apoya', note: null,
        photo_uri: null, reminder_at: null, reminder_notif_id: null,
        created_at: 1000, updated_at: 1000, deleted_at: null,
        campaign_id: null, agent_id: null, sync_status: 'local', server_id: null,
      },
      {
        id: '2', name: 'Bob', phone: null, ubigeo: null, distrito_nombre: null,
        lat: null, lng: null, estado: 'duda', note: null,
        photo_uri: null, reminder_at: null, reminder_notif_id: null,
        created_at: 1000, updated_at: 1000, deleted_at: null,
        campaign_id: null, agent_id: null, sync_status: 'local', server_id: null,
      },
    ];
    const gj = contactsToGeoJSON(contacts);
    expect(gj.type).toBe('FeatureCollection');
    // Only contact with lat/lng should appear
    expect(gj.features).toHaveLength(1);
    expect(gj.features[0].properties?.id).toBe('1');
    expect(gj.features[0].properties?.estado).toBe('apoya');
  });

  it('contactsToGeoJSON skips contacts without coords', () => {
    const gj = contactsToGeoJSON([]);
    expect(gj.features).toHaveLength(0);
  });
});
