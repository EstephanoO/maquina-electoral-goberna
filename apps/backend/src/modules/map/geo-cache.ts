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
      departamento,
      ST_XMin(ST_Envelope(geom)) as min_lng,
      ST_YMin(ST_Envelope(geom)) as min_lat,
      ST_XMax(ST_Envelope(geom)) as max_lng,
      ST_YMax(ST_Envelope(geom)) as max_lat
    FROM peru_departamentos
    ORDER BY departamento
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
      provincia,
      ST_XMin(ST_Envelope(geom)) as min_lng,
      ST_YMin(ST_Envelope(geom)) as min_lat,
      ST_XMax(ST_Envelope(geom)) as max_lng,
      ST_YMax(ST_Envelope(geom)) as max_lat
    FROM peru_provincias
    WHERE coddep = $1
    ORDER BY provincia
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
      distrito,
      ST_XMin(ST_Envelope(geom)) as min_lng,
      ST_YMin(ST_Envelope(geom)) as min_lat,
      ST_XMax(ST_Envelope(geom)) as max_lng,
      ST_YMax(ST_Envelope(geom)) as max_lat
    FROM peru_distritos
    WHERE coddep = $1 AND codprov = $2
    ORDER BY distrito
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

export async function invalidateGeoCache(): Promise<void> {
  const pattern = `${CACHE_PREFIX}*`;
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(keys);
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
      d.departamento,
      d.codprov,
      d.provincia,
      d.ubigeo,
      d.distrito
    FROM peru_distritos d
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

/* ========== Tile Cache ========== */

const TILE_CACHE_PREFIX = "tile:";
const TILE_CACHE_TTL_SECONDS = 3600; // 1 hour for tiles

export async function getCachedTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const cacheKey = `${TILE_CACHE_PREFIX}${z}:${x}:${y}`;
  try {
    // Use sendCommand to get raw buffer data
    const cached = await redisClient.sendCommand(["GET", cacheKey], { returnBuffers: true }) as Buffer | null;
    return cached;
  } catch {
    return null;
  }
}

export async function setCachedTile(z: number, x: number, y: number, data: Buffer): Promise<void> {
  const cacheKey = `${TILE_CACHE_PREFIX}${z}:${x}:${y}`;
  try {
    await redisClient.sendCommand(["SETEX", cacheKey, TILE_CACHE_TTL_SECONDS.toString(), data]);
  } catch {
    // Cache write failed, continue
  }
}
