import { contactsToGeoJSON, PERU_BBOX } from '../map-config';

test('contactsToGeoJSON builds a FeatureCollection with estado property', () => {
  const fc = contactsToGeoJSON([
    { id: 'a', name: 'X', lat: -12.04, lng: -77.04, estado: 'apoya' } as any,
    { id: 'b', name: 'Y', lat: null, lng: null, estado: 'no' } as any,
  ]);
  expect(fc.type).toBe('FeatureCollection');
  expect(fc.features).toHaveLength(1); // el sin coords se descarta
  expect(fc.features[0].properties.estado).toBe('apoya');
  expect(fc.features[0].geometry.coordinates).toEqual([-77.04, -12.04]);
});

test('PERU_BBOX covers the mainland', () => {
  expect(PERU_BBOX).toEqual([-81.4, -18.4, -68.6, 0]);
});
