/**
 * Cliente para el enrichment de fase-2 desde `onboarding_fase1`.
 *
 * Estos endpoints viven en el backend y leen del pool secundario
 * (ONBOARDING_DATABASE_URL). Si esa env no está, los endpoints devuelven
 * 503 y este cliente retorna null silenciosamente — las slides aplican
 * graceful degradation.
 */
import { api } from "./api-client";

export type DistritoDetail = {
  id: number;
  distrito: string;
  id_provincia: number;
  provincia: string;
  id_departamento: number;
  departamento: string;
  poblacion_total_2025: number;
  area_km2: number;
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  centroid: [number, number];
  bbox: [number, number, number, number];
  anio_referencia: number;
  padron: {
    id_eleccion: number;
    eleccion_codigo: string;
    eleccion_nombre: string;
    fuente: string;
    fecha_corte: string | null;
    poblacion_electoral: number | null;
    votos_emitidos: number | null;
  } | null;
  presupuesto: {
    pia: string | null;
    pim: string | null;
    certificacion: string | null;
    compromiso: string | null;
    devengado: string | null;
    girado: string | null;
    nombre_entidad: string | null;
    codigo_pliego: string | null;
    fuente: string;
    fuente_url: string | null;
    fecha_corte: string | null;
  } | null;
  ranking_pim: {
    posicion: number;
    total: number;
    pim: number | null;
  } | null;
};

export type ProvinciaDistritos = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  {
    id: number;
    distrito: string;
    poblacion_total_2025: number;
    area_km2: number;
    densidad_hab_km2: number | null;
  }
>;

/** Fetch detalle del distrito + enrichment. Retorna null si no configurado o no existe. */
export async function fetchDistritoDetail(
  idDistrito: number,
  opts?: { simplify?: 0 | 0.001 | 0.002 | 0.005 | 0.01; anio?: number },
): Promise<DistritoDetail | null> {
  const params = new URLSearchParams();
  if (opts?.simplify !== undefined) params.set("simplify", String(opts.simplify));
  if (opts?.anio) params.set("anio", String(opts.anio));
  const qs = params.toString() ? `?${params}` : "";
  try {
    return await api<DistritoDetail>(`/api/geo/distrito/${idDistrito}${qs}`);
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 404) return null;
    throw e;
  }
}

/** Fetch FeatureCollection de los distritos de una provincia. */
export async function fetchProvinciaDistritos(
  idProvincia: number,
  opts?: { simplify?: 0.001 | 0.002 | 0.005 | 0.01 },
): Promise<ProvinciaDistritos | null> {
  const params = new URLSearchParams();
  if (opts?.simplify !== undefined) params.set("simplify", String(opts.simplify));
  const qs = params.toString() ? `?${params}` : "";
  try {
    return await api<ProvinciaDistritos>(`/api/geo/provincia/${idProvincia}/distritos${qs}`);
  } catch (e: any) {
    if (e?.status === 503 || e?.status === 404) return null;
    throw e;
  }
}

/** Helper: formato Soles peruanos. */
export function formatSoles(value: number | string | null): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  // Soles: "S/ 169.4 M" para millones, "S/ 1.2 B" para billones
  if (n >= 1e9) return `S/ ${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `S/ ${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `S/ ${(n / 1e3).toFixed(0)} K`;
  return `S/ ${n.toFixed(0)}`;
}

/** Helper: formato número con separadores de miles. */
export function formatNumero(value: number | string | null): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-PE");
}
