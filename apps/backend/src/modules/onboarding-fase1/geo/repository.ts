/**
 * Geo repository — lee geografia_politica.* de `onboarding_fase1`.
 *
 * Todos los métodos retornan datos listos para frontend / maplibre:
 * - GeoJSON serializado (Polygon/MultiPolygon, SRID 4326)
 * - Centroides como [lng, lat] para mapbox/maplibre
 * - BBox como [minLng, minLat, maxLng, maxLat]
 *
 * Simplificación adaptativa según contexto:
 * - `tolerance=0` (default cuando se ve 1 solo distrito): geometría completa
 * - `tolerance=0.002` (~220m): para vistas provinciales (mostrar distritos vecinos)
 * - `tolerance=0.005` (~550m): para vistas nacionales o departamentales
 */
import { getOnboardingPool } from "../../../db";

export type DistritoDetail = {
  id: number;
  distrito: string;
  id_provincia: number;
  provincia: string;
  id_departamento: number;
  departamento: string;
  poblacion_total_2025: number;
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  centroid: [number, number];                       // [lng, lat]
  bbox: [number, number, number, number];           // [minLng, minLat, maxLng, maxLat]
  area_km2: number;
};

export async function getDistrito(idDistrito: number, tolerance = 0): Promise<DistritoDetail | null> {
  const pool = getOnboardingPool();
  const geomExpr = tolerance > 0
    ? `ST_SimplifyPreserveTopology(d.geom, ${tolerance})`
    : "d.geom";

  const { rows } = await pool.query<{
    id: number;
    distrito: string;
    id_provincia: number;
    provincia: string;
    id_departamento: number;
    departamento: string;
    poblacion_total_2025: number;
    geojson: string;
    centroid: string;                          // GeoJSON Point string
    bbox_min_x: number; bbox_min_y: number; bbox_max_x: number; bbox_max_y: number;
    area_km2: string;
  }>(
    `SELECT
       d.id,
       d.distrito,
       d.id_provincia,
       p.provincia,
       p.id_departamento,
       dep.departamento,
       d.poblacion_total_2025,
       ST_AsGeoJSON(${geomExpr})::text AS geojson,
       ST_AsGeoJSON(ST_Centroid(d.geom))::text AS centroid,
       ST_XMin(d.geom) AS bbox_min_x, ST_YMin(d.geom) AS bbox_min_y,
       ST_XMax(d.geom) AS bbox_max_x, ST_YMax(d.geom) AS bbox_max_y,
       (ST_Area(d.geom::geography) / 1e6)::numeric(12,2) AS area_km2
     FROM geografia_politica.peru_distritos d
     JOIN geografia_politica.peru_provincias p   ON p.id = d.id_provincia
     JOIN geografia_politica.peru_departamentos dep ON dep.id = p.id_departamento
     WHERE d.id = $1`,
    [idDistrito],
  );

  const r = rows[0];
  if (!r) return null;

  const centroidGeom = JSON.parse(r.centroid) as GeoJSON.Point;
  return {
    id: r.id,
    distrito: r.distrito,
    id_provincia: r.id_provincia,
    provincia: r.provincia,
    id_departamento: r.id_departamento,
    departamento: r.departamento,
    poblacion_total_2025: r.poblacion_total_2025,
    geojson: JSON.parse(r.geojson),
    centroid: centroidGeom.coordinates as [number, number],
    bbox: [r.bbox_min_x, r.bbox_min_y, r.bbox_max_x, r.bbox_max_y],
    area_km2: Number(r.area_km2),
  };
}

/**
 * Distritos de la misma provincia (incluye el target).
 * Para vista coropleta provincial.
 */
export async function getDistritosByProvincia(
  idProvincia: number,
  tolerance = 0.002,
): Promise<Array<{
  id: number;
  distrito: string;
  poblacion_total_2025: number;
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  area_km2: number;
}>> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<{
    id: number; distrito: string; poblacion_total_2025: number;
    geojson: string; area_km2: string;
  }>(
    `SELECT d.id, d.distrito, d.poblacion_total_2025,
            ST_AsGeoJSON(ST_SimplifyPreserveTopology(d.geom, $2))::text AS geojson,
            (ST_Area(d.geom::geography) / 1e6)::numeric(12,2) AS area_km2
       FROM geografia_politica.peru_distritos d
      WHERE d.id_provincia = $1
      ORDER BY d.poblacion_total_2025 DESC`,
    [idProvincia, tolerance],
  );
  return rows.map((r) => ({
    id: r.id,
    distrito: r.distrito,
    poblacion_total_2025: r.poblacion_total_2025,
    geojson: JSON.parse(r.geojson),
    area_km2: Number(r.area_km2),
  }));
}

/** Ranking nacional del distrito por PIM del año dado. */
export async function getRankingPimDistrito(
  idDistrito: number,
  anio: number,
): Promise<{ posicion: number; total: number; pim: number | null } | null> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<{ posicion: string; total: string; pim: string | null }>(
    `WITH ranked AS (
       SELECT id_distrito, pim,
              RANK() OVER (ORDER BY pim DESC NULLS LAST) AS pos,
              COUNT(*) OVER () AS total
         FROM datos_externos.presupuesto_municipal
        WHERE anio = $2 AND pim IS NOT NULL
     )
     SELECT pos AS posicion, total, pim
       FROM ranked
      WHERE id_distrito = $1`,
    [idDistrito, anio],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    posicion: Number(r.posicion),
    total: Number(r.total),
    pim: r.pim ? Number(r.pim) : null,
  };
}

/** Último corte de padrón electoral para un distrito (por fecha_corte DESC). */
export async function getUltimoPadron(idDistrito: number): Promise<{
  id_eleccion: number; eleccion_codigo: string; eleccion_nombre: string;
  fuente: string; fecha_corte: string | null;
  poblacion_electoral: number | null; votos_emitidos: number | null;
} | null> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<{
    id_eleccion: number; eleccion_codigo: string; eleccion_nombre: string;
    fuente: string; fecha_corte: string | null;
    poblacion_electoral: number | null; votos_emitidos: number | null;
  }>(
    `SELECT p.id_eleccion, e.codigo AS eleccion_codigo, e.nombre AS eleccion_nombre,
            p.fuente, p.fecha_corte::text,
            p.poblacion_electoral, p.votos_emitidos
       FROM datos_externos.padron_electoral p
       JOIN datos_externos.eleccion e ON e.id = p.id_eleccion
      WHERE p.id_distrito = $1
      ORDER BY p.fecha_corte DESC NULLS LAST, p.ingestado_en DESC
      LIMIT 1`,
    [idDistrito],
  );
  return rows[0] ?? null;
}

/** Presupuesto municipal de un distrito en un año dado. */
export async function getPresupuesto(idDistrito: number, anio: number) {
  const pool = getOnboardingPool();
  const { rows } = await pool.query(
    `SELECT pia, pim, certificacion, compromiso, devengado, girado,
            nombre_entidad, codigo_pliego, codigo_unidad_ejecutora,
            fuente, fuente_url, fecha_corte::text
       FROM datos_externos.presupuesto_municipal
      WHERE id_distrito = $1 AND anio = $2
      ORDER BY pim DESC NULLS LAST
      LIMIT 1`,
    [idDistrito, anio],
  );
  return rows[0] ?? null;
}
