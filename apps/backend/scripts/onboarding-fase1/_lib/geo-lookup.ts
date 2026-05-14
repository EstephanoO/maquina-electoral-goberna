/**
 * Lookup UBIGEO ↔ peru_distritos.id en `onboarding_fase1`.
 *
 * Las tablas del geógrafo NO tienen columna `ubigeo` — el `id` es
 * secuencial (1..1891). Para matchear data externa que viene indexada
 * por UBIGEO (CSV del MEF, ONPE, etc.), resolvemos por nombre + provincia.
 *
 * Estrategia (best effort):
 *   1) Match exacto (case+tilde-insensitive) por nombre del distrito
 *      DENTRO de la provincia indicada (si tenemos código de provincia).
 *   2) Match exacto por nombre del distrito a nivel nacional → si hay
 *      ambigüedad, devolver null + warn.
 *   3) Si no, null + warn.
 *
 * Se cachea en memoria por sesión del script (1891 filas, despreciable).
 */
import { Pool } from "pg";

import { normalizeName } from "./csv";

type DistritoRow = { id: number; distrito_norm: string; id_provincia: number; provincia_norm: string; departamento_norm: string };

let cache: DistritoRow[] | null = null;

async function loadCache(pool: Pool): Promise<DistritoRow[]> {
  if (cache) return cache;
  const { rows } = await pool.query<{
    id: number; distrito: string; id_provincia: number;
    provincia: string; departamento: string;
  }>(`
    SELECT d.id, d.distrito, d.id_provincia,
           p.provincia, dep.departamento
      FROM geografia_politica.peru_distritos d
      JOIN geografia_politica.peru_provincias p   ON p.id = d.id_provincia
      JOIN geografia_politica.peru_departamentos dep ON dep.id = p.id_departamento
  `);
  cache = rows.map((r) => ({
    id: r.id,
    distrito_norm: normalizeName(r.distrito),
    id_provincia: r.id_provincia,
    provincia_norm: normalizeName(r.provincia),
    departamento_norm: normalizeName(r.departamento),
  }));
  return cache;
}

export async function resolveDistritoId(
  pool: Pool,
  distritoName: string,
  provinciaName?: string,
  departamentoName?: string,
): Promise<{ id: number; provincia_id: number } | null> {
  const all = await loadCache(pool);
  const dn = normalizeName(distritoName);
  const pn = provinciaName ? normalizeName(provinciaName) : null;
  const den = departamentoName ? normalizeName(departamentoName) : null;

  let matches = all.filter((r) => r.distrito_norm === dn);
  if (matches.length === 0) return null;

  if (matches.length > 1 && pn) {
    matches = matches.filter((r) => r.provincia_norm === pn);
  }
  if (matches.length > 1 && den) {
    matches = matches.filter((r) => r.departamento_norm === den);
  }

  if (matches.length === 1) return { id: matches[0]!.id, provincia_id: matches[0]!.id_provincia };
  if (matches.length === 0) return null;

  console.warn(`[geo-lookup] AMBIGUO '${distritoName}'/'${provinciaName ?? "-"}': ${matches.length} matches (${matches.map((m) => m.id).join(",")})`);
  return null;
}

export async function resolveProvinciaId(
  pool: Pool,
  provinciaName: string,
  departamentoName?: string,
): Promise<number | null> {
  const all = await loadCache(pool);
  const pn = normalizeName(provinciaName);
  const den = departamentoName ? normalizeName(departamentoName) : null;
  let matches = all.filter((r) => r.provincia_norm === pn);
  if (matches.length === 0) return null;
  if (matches.length > 1 && den) matches = matches.filter((r) => r.departamento_norm === den);
  // todos los distritos de una provincia comparten id_provincia
  const uniqueProv = Array.from(new Set(matches.map((m) => m.id_provincia)));
  if (uniqueProv.length === 1) return uniqueProv[0]!;
  return null;
}

export async function resolveDepartamentoId(
  pool: Pool,
  departamentoName: string,
): Promise<number | null> {
  const den = normalizeName(departamentoName);
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM geografia_politica.peru_departamentos
      WHERE lower(unaccent(departamento)) = $1
        OR lower(departamento) = $1
      LIMIT 1`,
    [den],
  ).catch(async () => {
    // Si unaccent no está disponible, fallback a comparación simple
    return pool.query<{ id: number }>(
      `SELECT id FROM geografia_politica.peru_departamentos
        WHERE lower(departamento) = $1 LIMIT 1`,
      [den],
    );
  });
  return rows[0]?.id ?? null;
}
