/**
 * Geographic hierarchy service
 * Fetches cached departamentos, provincias, distritos bounds from backend.
 */

import { api } from "./api";

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

/* ========== In-Memory Cache ========== */

// Browser-side cache to avoid redundant requests
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  memoryCache.set(key, { data, expiresAt: Date.now() + MEMORY_CACHE_TTL });
}

/* ========== API Functions ========== */

export async function getDepartamentos(): Promise<{
  ok: boolean;
  departamentos?: DepartamentoInfo[];
  cached_at?: string;
  error?: string;
}> {
  const cacheKey = "geo:departamentos";
  const cached = getCached<DepartamentoInfo[]>(cacheKey);
  if (cached) {
    return { ok: true, departamentos: cached, cached_at: "memory" };
  }

  const res = await api.get<{
    ok: boolean;
    departamentos: DepartamentoInfo[];
    cached_at: string;
  }>("/api/geo/departamentos");

  if (res.ok && res.data?.departamentos) {
    setCache(cacheKey, res.data.departamentos);
    return { ok: true, departamentos: res.data.departamentos, cached_at: res.data.cached_at };
  }

  return { ok: false, error: res.error?.message ?? "Error fetching departamentos" };
}

export async function getProvincias(coddep: string): Promise<{
  ok: boolean;
  provincias?: ProvinciaInfo[];
  bounds?: GeoBounds;
  cached_at?: string;
  error?: string;
}> {
  const cacheKey = `geo:prov:${coddep}`;
  const cached = getCached<{ provincias: ProvinciaInfo[]; bounds: GeoBounds }>(cacheKey);
  if (cached) {
    return { ok: true, provincias: cached.provincias, bounds: cached.bounds, cached_at: "memory" };
  }

  const res = await api.get<{
    ok: boolean;
    provincias: ProvinciaInfo[];
    bounds: GeoBounds;
    cached_at: string;
  }>(`/api/geo/departamentos/${coddep}/provincias`);

  if (res.ok && res.data?.provincias) {
    setCache(cacheKey, { provincias: res.data.provincias, bounds: res.data.bounds });
    return {
      ok: true,
      provincias: res.data.provincias,
      bounds: res.data.bounds,
      cached_at: res.data.cached_at,
    };
  }

  return { ok: false, error: res.error?.message ?? "Error fetching provincias" };
}

export async function getDistritos(codprov_full: string): Promise<{
  ok: boolean;
  distritos?: DistritoInfo[];
  bounds?: GeoBounds;
  cached_at?: string;
  error?: string;
}> {
  const cacheKey = `geo:dist:${codprov_full}`;
  const cached = getCached<{ distritos: DistritoInfo[]; bounds: GeoBounds }>(cacheKey);
  if (cached) {
    return { ok: true, distritos: cached.distritos, bounds: cached.bounds, cached_at: "memory" };
  }

  const res = await api.get<{
    ok: boolean;
    distritos: DistritoInfo[];
    bounds: GeoBounds;
    cached_at: string;
  }>(`/api/geo/provincias/${codprov_full}/distritos`);

  if (res.ok && res.data?.distritos) {
    setCache(cacheKey, { distritos: res.data.distritos, bounds: res.data.bounds });
    return {
      ok: true,
      distritos: res.data.distritos,
      bounds: res.data.bounds,
      cached_at: res.data.cached_at,
    };
  }

  return { ok: false, error: res.error?.message ?? "Error fetching distritos" };
}

export async function getPeruBounds(): Promise<{
  ok: boolean;
  bounds?: GeoBounds;
  error?: string;
}> {
  const cacheKey = "geo:peru:bounds";
  const cached = getCached<GeoBounds>(cacheKey);
  if (cached) {
    return { ok: true, bounds: cached };
  }

  const res = await api.get<{
    ok: boolean;
    bounds: GeoBounds;
  }>("/api/geo/bounds");

  if (res.ok && res.data?.bounds) {
    setCache(cacheKey, res.data.bounds);
    return { ok: true, bounds: res.data.bounds };
  }

  return { ok: false, error: res.error?.message ?? "Error fetching Peru bounds" };
}

/* ========== Reverse Geocoding ========== */

export type ReverseGeocodeResult = {
  coddep: string;
  departamento: string;
  codprov_full: string;
  provincia: string;
  ubigeo: string;
  distrito: string;
};

export async function reverseGeocode(lng: number, lat: number): Promise<{
  ok: boolean;
  result?: ReverseGeocodeResult;
  error?: string;
}> {
  // No memory cache for reverse geocode (too many possible points)
  const res = await api.get<{
    ok: boolean;
    coddep: string;
    departamento: string;
    codprov_full: string;
    provincia: string;
    ubigeo: string;
    distrito: string;
  }>(`/api/geo/reverse?lng=${lng}&lat=${lat}`);

  if (res.ok && res.data) {
    return {
      ok: true,
      result: {
        coddep: res.data.coddep,
        departamento: res.data.departamento,
        codprov_full: res.data.codprov_full,
        provincia: res.data.provincia,
        ubigeo: res.data.ubigeo,
        distrito: res.data.distrito,
      },
    };
  }

  return { ok: false, error: res.error?.message ?? "Error en reverse geocode" };
}

/* ========== Preload Functions ========== */

// Preload all departamentos on app start
export function preloadDepartamentos(): void {
  getDepartamentos().catch(() => {
    // Ignore preload errors
  });
}

// Preload provincias when user clicks on a departamento
export function preloadProvincias(coddep: string): void {
  getProvincias(coddep).catch(() => {
    // Ignore preload errors
  });
}

// Preload distritos when user clicks on a provincia
export function preloadDistritos(codprov_full: string): void {
  getDistritos(codprov_full).catch(() => {
    // Ignore preload errors
  });
}
