/**
 * Lat/Lon to UTM conversion.
 * Extracted to its own module so it can be reused across screens.
 */

import type { UtmData } from './types';

export function latLonToUtm(lat: number, lon: number): UtmData {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const hemisphere: 'N' | 'S' = lat >= 0 ? 'N' : 'S';
  const k0 = 0.9996;
  const a = 6378137;
  const e = 0.081819191;
  const e2 = e * e;
  const ep2 = e2 / (1 - e2);
  const toRad = Math.PI / 180;
  const latRad = lat * toRad;
  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  const lonRad = (lon - lonOrigin) * toRad;
  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = ep2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * lonRad;
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latRad));

  const easting =
    k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;

  let northing =
    k0 *
    (M +
      N *
        Math.tan(latRad) *
        (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));

  if (hemisphere === 'S') northing += 10000000;

  const datum_epsg = (hemisphere === 'N' ? 32600 : 32700) + zone;

  return { zone, hemisphere, easting, northing, datum_epsg };
}
