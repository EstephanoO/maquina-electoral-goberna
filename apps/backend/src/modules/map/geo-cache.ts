/**
 * Geographic hierarchy cache service
 * Caches departamentos, provincias, distritos bounds and metadata in Redis
 * for fast drill-down navigation on the frontend.
 */

import { pool } from "../../db";
import { redisClient } from "../../infra/redis";

/* ========== Types ========== */

export type GeoBounds = [[number, number], [number, number]]; // [[minLng, minLat], [maxLng, maxLat]]

export type DepartamentoInfo = {
  coddep: string;
  departamento: string;
  bounds: GeoBounds;
};

export type ProvinciaInfo = {
  coddep: string;
  codprov: string;
  codprov_full: string;
  provincia: string;
  bounds: GeoBounds;
};

export type DistritoInfo = {
  coddep: string;
  codprov_full: string;
  ubigeo: string;
  distrito: string;
  bounds: GeoBounds;
};

export type GeoHierarchy = {
  departamentos: DepartamentoInfo[];
  cached_at: string;
};

export type ProvinciasResponse = {
  coddep: string;
  provincias: ProvinciaInfo[];
  bounds: GeoBounds; // bounds of all provincias combined
  cached_at: string;
};

export type DistritosResponse = {
  codprov_full: string;
  distritos: DistritoInfo[];
  bounds: GeoBounds; // bounds of all distritos combined
  cached_at: string;
};

/* ========== Cache Keys ========== */

const CACHE_PREFIX = "geo:";
const CACHE_TTL_SECONDS = 86400; // 24 hours - geographic data is static

const keys = {
  departamentos: () => `${CACHE_PREFIX}departamentos`,
  provincias: (coddep: string) => `${CACHE_PREFIX}prov:${coddep}`,
  distritos: (codprov_full: string) => `${CACHE_PREFIX}dist:${codprov_full}`,
  peruBounds: () => `${CACHE_PREFIX}peru:bounds`,
};

/* ========== Database Queries ========== */

async function fetchDepartamentosFromDB(): Promise<DepartamentoInfo[]> {
  const result = await pool.query<{
    coddep: string;
    departamento: string;
    min_lng: number;
    min_lat: number;
    max_lng: number;
    max_lat: number;
  }>(`
    SELECT 
      coddep,
      nomdep AS departamento,
      ST_XMin(ST_Envelope(geom)) as min_lng,
      ST_YMin(ST_Envelope(geom)) as min_lat,
      ST_XMax(ST_Envelope(geom)) as max_lng,
      ST_YMax(ST_Envelope(geom)) as max_lat
    FROM peru_departamentos
    ORDER BY nomdep
  `);

  return result.rows.map((row) => ({
    coddep: row.coddep,
    departamento: row.departamento,
    bounds: [
      [row.min_lng, row.min_lat],
      [row.max_lng, row.max_lat],
    ],
  }));
}

async function fetchProvinciasFromDB(coddep: string): Promise<{ provincias: ProvinciaInfo[]; bounds: GeoBounds }> {
  const result = await pool.query<{
    coddep: string;
    codprov: string;
    provincia: string;
    min_lng: number;
    min_lat: number;
    max_lng: number;
    max_lat: number;
  }>(
    `
    SELECT 
      coddep,
      codprov,
      nomprov AS provincia,
      ST_XMin(ST_Envelope(geom)) as min_lng,
      ST_YMin(ST_Envelope(geom)) as min_lat,
      ST_XMax(ST_Envelope(geom)) as max_lng,
      ST_YMax(ST_Envelope(geom)) as max_lat
    FROM peru_provincias
    WHERE coddep = $1
    ORDER BY nomprov
  `,
    [coddep]
  );

  const provincias = result.rows.map((row) => ({
    coddep: row.coddep,
    codprov: row.codprov,
    codprov_full: row.coddep + row.codprov,
    provincia: row.provincia,
    bounds: [
      [row.min_lng, row.min_lat],
      [row.max_lng, row.max_lat],
    ] as GeoBounds,
  }));

  // Calculate combined bounds
  const bounds = calculateCombinedBounds(provincias.map((p) => p.bounds));

  return { provincias, bounds };
}

async function fetchDistritosFromDB(codprov_full: string): Promise<{ distritos: DistritoInfo[]; bounds: GeoBounds }> {
  const coddep = codprov_full.slice(0, 2);
  const codprov = codprov_full.slice(2, 4);

  const result = await pool.query<{
    coddep: string;
    codprov: string;
    ubigeo: string;
    distrito: string;
    min_lng: number;
    min_lat: number;
    max_lng: number;
    max_lat: number;
  }>(
    `
    SELECT 
      coddep,
      codprov,
      ubigeo,
      nomdist AS distrito,
      ST_XMin(ST_Envelope(geom)) as min_lng,
      ST_YMin(ST_Envelope(geom)) as min_lat,
      ST_XMax(ST_Envelope(geom)) as max_lng,
      ST_YMax(ST_Envelope(geom)) as max_lat
    FROM peru_distritos
    WHERE coddep = $1 AND codprov = $2
    ORDER BY nomdist
  `,
    [coddep, codprov]
  );

  const distritos = result.rows.map((row) => ({
    coddep: row.coddep,
    codprov_full: row.coddep + row.codprov,
    ubigeo: row.ubigeo,
    distrito: row.distrito,
    bounds: [
      [row.min_lng, row.min_lat],
      [row.max_lng, row.max_lat],
    ] as GeoBounds,
  }));

  // Calculate combined bounds
  const bounds = calculateCombinedBounds(distritos.map((d) => d.bounds));

  return { distritos, bounds };
}

function calculateCombinedBounds(boundsArray: GeoBounds[]): GeoBounds {
  if (boundsArray.length === 0) {
    return [
      [-81.4, -18.4],
      [-68.7, -0.1],
    ]; // Peru bounds fallback
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [[lng1, lat1], [lng2, lat2]] of boundsArray) {
    if (lng1 < minLng) minLng = lng1;
    if (lat1 < minLat) minLat = lat1;
    if (lng2 > maxLng) maxLng = lng2;
    if (lat2 > maxLat) maxLat = lat2;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/* ========== Cached Accessors ========== */

export async function getDepartamentos(): Promise<GeoHierarchy> {
  const cacheKey = keys.departamentos();

  // Try cache first
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis error, fall through to DB
  }

  // Fetch from DB
  const departamentos = await fetchDepartamentosFromDB();
  const result: GeoHierarchy = {
    departamentos,
    cached_at: new Date().toISOString(),
  };

  // Cache result
  try {
    await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
  } catch {
    // Cache write failed, continue
  }

  return result;
}

export async function getProvincias(coddep: string): Promise<ProvinciasResponse> {
  const cacheKey = keys.provincias(coddep);

  // Try cache first
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis error, fall through to DB
  }

  // Fetch from DB
  const { provincias, bounds } = await fetchProvinciasFromDB(coddep);
  const result: ProvinciasResponse = {
    coddep,
    provincias,
    bounds,
    cached_at: new Date().toISOString(),
  };

  // Cache result
  try {
    await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
  } catch {
    // Cache write failed, continue
  }

  return result;
}

export async function getDistritos(codprov_full: string): Promise<DistritosResponse> {
  const cacheKey = keys.distritos(codprov_full);

  // Try cache first
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis error, fall through to DB
  }

  // Fetch from DB
  const { distritos, bounds } = await fetchDistritosFromDB(codprov_full);
  const result: DistritosResponse = {
    codprov_full,
    distritos,
    bounds,
    cached_at: new Date().toISOString(),
  };

  // Cache result
  try {
    await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
  } catch {
    // Cache write failed, continue
  }

  return result;
}

export async function getPeruBounds(): Promise<GeoBounds> {
  const cacheKey = keys.peruBounds();

  // Try cache first
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis error, fall through to DB
  }

  // Calculate from departamentos
  const { departamentos } = await getDepartamentos();
  const bounds = calculateCombinedBounds(departamentos.map((d) => d.bounds));

  // Cache result
  try {
    await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(bounds));
  } catch {
    // Cache write failed, continue
  }

  return bounds;
}

/* ========== Cache Invalidation ========== */

/**
 * Invalidate all geo cache entries using explicit key construction.
 * Avoids KEYS command which blocks Redis during full keyspace scan.
 */
export async function invalidateGeoCache(): Promise<void> {
  // Explicit keys: 1 departamentos + 25 dep provincias + ~196 prov distritos + 1 peru bounds
  // Much safer than KEYS pattern scan on production Redis
  const keysToDelete: string[] = [
    keys.departamentos(),
    keys.peruBounds(),
  ];

  // Peru has 25 departamentos (coddep: "01" to "25")
  for (let i = 1; i <= 25; i++) {
    const coddep = String(i).padStart(2, "0");
    keysToDelete.push(keys.provincias(coddep));
  }

  // Provincias: each dep has ~8 provincias (codprov_full = coddep + codprov "01"-"20")
  // Over-delete is fine — DEL on non-existent keys is a no-op
  for (let dep = 1; dep <= 25; dep++) {
    const coddep = String(dep).padStart(2, "0");
    for (let prov = 1; prov <= 20; prov++) {
      keysToDelete.push(keys.distritos(coddep + String(prov).padStart(2, "0")));
    }
  }

  // DEL is O(1) per key and non-existent keys are ignored
  if (keysToDelete.length > 0) {
    await redisClient.del(keysToDelete);
  }
}

/* ========== Reverse Geocoding ========== */

export type ReverseGeocodeResult = {
  coddep: string;
  departamento: string;
  codprov_full: string;
  provincia: string;
  ubigeo: string;
  distrito: string;
} | null;

/**
 * Reverse geocode a point to find which distrito contains it.
 * Uses PostGIS ST_Contains for accurate point-in-polygon detection.
 * Results are NOT cached as they are point-specific.
 */
export async function reverseGeocode(lng: number, lat: number): Promise<ReverseGeocodeResult> {
  const result = await pool.query<{
    coddep: string;
    departamento: string;
    codprov: string;
    provincia: string;
    ubigeo: string;
    distrito: string;
  }>(
    `
    SELECT 
      d.coddep,
      dep.nomdep AS departamento,
      d.codprov,
      prov.nomprov AS provincia,
      d.ubigeo,
      d.nomdist AS distrito
    FROM peru_distritos d
    JOIN peru_departamentos dep ON dep.coddep = d.coddep
    JOIN peru_provincias prov ON prov.coddep = d.coddep AND prov.codprov = d.codprov
    WHERE ST_Contains(d.geom, ST_SetSRID(ST_Point($1, $2), 4326))
    LIMIT 1
  `,
    [lng, lat]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    coddep: row.coddep,
    departamento: row.departamento,
    codprov_full: row.coddep + row.codprov,
    provincia: row.provincia,
    ubigeo: row.ubigeo,
    distrito: row.distrito,
  };
}

/* ========== District Search ========== */

export type DistritoSearchResult = {
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
  coddep: string;
  codprov_full: string;
};

/**
 * Full-text search across all ~1900 distritos.
 * Permissive: matches substring in distrito, provincia, or departamento name.
 * Uses ILIKE for case-insensitive matching (no unaccent dependency).
 * Prioritizes: distrito prefix > distrito contains > provincia match > departamento match.
 * Results cached 24h in Redis (query-specific key).
 */
export async function searchDistritos(query: string, limit = 20): Promise<DistritoSearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 1) return [];

  const cacheKey = `${CACHE_PREFIX}search:${normalized}:${limit}`;

  // Try cache
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis error, fall through
  }

  // Permissive search: ILIKE with substring matching on all three levels.
  // Scoring: distrito prefix = 0, distrito contains = 1, provincia = 2, departamento = 3.
  const pattern = `%${normalized}%`;
  const prefixPattern = `${normalized}%`;

  const result = await pool.query<{
    ubigeo: string;
    distrito: string;
    provincia: string;
    departamento: string;
    coddep: string;
    codprov: string;
  }>(
    `
    SELECT
      d.ubigeo,
      d.nomdist AS distrito,
      prov.nomprov AS provincia,
      dep.nomdep AS departamento,
      d.coddep,
      d.codprov
    FROM peru_distritos d
    JOIN peru_provincias prov ON prov.coddep = d.coddep AND prov.codprov = d.codprov
    JOIN peru_departamentos dep ON dep.coddep = d.coddep
    WHERE lower(d.nomdist) LIKE $1
       OR lower(prov.nomprov) LIKE $1
       OR lower(dep.nomdep) LIKE $1
    ORDER BY
      CASE
        WHEN lower(d.nomdist) LIKE $2 THEN 0
        WHEN lower(d.nomdist) LIKE $1 THEN 1
        WHEN lower(prov.nomprov) LIKE $1 THEN 2
        ELSE 3
      END,
      d.nomdist
    LIMIT $3
    `,
    [pattern, prefixPattern, limit],
  );

  const rows: DistritoSearchResult[] = result.rows.map((r) => ({
    ubigeo: r.ubigeo,
    distrito: r.distrito,
    provincia: r.provincia,
    departamento: r.departamento,
    coddep: r.coddep,
    codprov_full: r.coddep + r.codprov,
  }));

  // Cache for 24h
  try {
    await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(rows));
  } catch {
    // Cache write failed, continue
  }

  return rows;
}

/**
 * Get ALL distritos with parent names (for mobile offline cache).
 * ~1900 rows, cached 24h. Returns flat list without bounds (lighter payload).
 */
export async function getAllDistritos(): Promise<DistritoSearchResult[]> {
  const cacheKey = `${CACHE_PREFIX}all-distritos`;

  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis error, fall through
  }

  const result = await pool.query<{
    ubigeo: string;
    distrito: string;
    provincia: string;
    departamento: string;
    coddep: string;
    codprov: string;
  }>(`
    SELECT
      d.ubigeo,
      d.nomdist AS distrito,
      prov.nomprov AS provincia,
      dep.nomdep AS departamento,
      d.coddep,
      d.codprov
    FROM peru_distritos d
    JOIN peru_provincias prov ON prov.coddep = d.coddep AND prov.codprov = d.codprov
    JOIN peru_departamentos dep ON dep.coddep = d.coddep
    ORDER BY dep.nomdep, prov.nomprov, d.nomdist
  `);

  const rows: DistritoSearchResult[] = result.rows.map((r) => ({
    ubigeo: r.ubigeo,
    distrito: r.distrito,
    provincia: r.provincia,
    departamento: r.departamento,
    coddep: r.coddep,
    codprov_full: r.coddep + r.codprov,
  }));

  try {
    await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(rows));
  } catch {
    // Cache write failed
  }

  return rows;
}

/**
 * Validate a ubigeo code and return centroid coordinates.
 * Used by forms module to enrich submissions with distrito location data.
 */
export async function validateAndEnrichUbigeo(ubigeo: string): Promise<{
  valid: boolean;
  distrito?: string;
  provincia?: string;
  departamento?: string;
  centroid_lat?: number;
  centroid_lng?: number;
} | null> {
  if (!ubigeo || ubigeo.length !== 6) return null;

  const result = await pool.query<{
    distrito: string;
    provincia: string;
    departamento: string;
    centroid_lat: number;
    centroid_lng: number;
  }>(
    `
    SELECT
      d.nomdist AS distrito,
      prov.nomprov AS provincia,
      dep.nomdep AS departamento,
      ST_Y(ST_Centroid(d.geom)) AS centroid_lat,
      ST_X(ST_Centroid(d.geom)) AS centroid_lng
    FROM peru_distritos d
    JOIN peru_provincias prov ON prov.coddep = d.coddep AND prov.codprov = d.codprov
    JOIN peru_departamentos dep ON dep.coddep = d.coddep
    WHERE d.ubigeo = $1
    LIMIT 1
    `,
    [ubigeo],
  );

  const row = result.rows[0];
  if (!row) return { valid: false };

  return {
    valid: true,
    distrito: row.distrito,
    provincia: row.provincia,
    departamento: row.departamento,
    centroid_lat: row.centroid_lat,
    centroid_lng: row.centroid_lng,
  };
}

/* ========== Tile Cache ========== */
// Tile caching: Tegola Redis cache (max_zoom=14) + Nginx disk cache (zoom-tiered TTL).
// The backend only proxies tiles to Tegola — no second Redis cache layer needed.
// Browser caching is handled via Cache-Control headers on the tile proxy route.
// All tables (including campaign_custom_zones) use pre-projected geom_3857 columns.
