/**
 * seed-geografia-pe.ts
 *
 * Lee un geojson de distritos INEI/IGN (formato con properties UBIGEO,
 * CODDEP, DEPARTAMEN, CODPROV, PROVINCIA, CODDIST, DISTRITO, CAPITAL) y
 * popula `geografia_politica.{departamento, provincia, distrito}`.
 *
 * Usage:
 *   bun scripts/seed-geografia-pe.ts <path-to-distritos.geojson>
 *
 * El path es CLI arg (ej. ../../../locales-votacion/distritos.geojson).
 * El script es idempotente: usa ON CONFLICT (id) DO NOTHING.
 *
 * Dependencias DB: corrió migration 061 (geografia_politica.* + FKs).
 */
import "dotenv/config";

import { readFileSync } from "node:fs";

import { Pool } from "pg";

import { getEnv } from "../src/config/env";

type DistritoFeature = {
  type: "Feature";
  properties: {
    UBIGEO?: string;
    CODDEP?: string;
    DEPARTAMEN?: string;
    CODPROV?: string;
    PROVINCIA?: string;
    CODDIST?: string;
    DISTRITO?: string;
    CAPITAL?: string;
  };
};

type GeoJson = {
  type: "FeatureCollection";
  features: DistritoFeature[];
};

const path = process.argv[2];
if (!path) {
  console.error("Usage: bun scripts/seed-geografia-pe.ts <path-to-distritos.geojson>");
  process.exit(1);
}

const env = getEnv();
const pool = new Pool({ connectionString: env.databaseUrl });

async function seed() {
  const raw = readFileSync(path!, "utf-8");
  const data = JSON.parse(raw) as GeoJson;
  if (data.type !== "FeatureCollection") {
    throw new Error(`No es un FeatureCollection: ${path}`);
  }

  // Resolver id_pais (Perú).
  const { rows: paisRows } = await pool.query<{ id: number }>(
    "SELECT id FROM catalogos.pais WHERE iso2 = 'PE'",
  );
  const idPais = paisRows[0]?.id;
  if (!idPais) throw new Error("catalogos.pais con iso2='PE' no existe — correr migration 056 primero");

  // Aggregate por dep/prov a partir de las features de distrito.
  const departamentos = new Map<string, { id: number; codigo: string; nombre: string }>();
  const provincias = new Map<string, { id: number; id_departamento: number; codigo: string; nombre: string }>();
  const distritos = new Map<string, { id: number; id_provincia: number; ubigeo: string; nombre: string; capital: string | null }>();

  for (const f of data.features) {
    const ubigeo = f.properties.UBIGEO?.trim() ?? "";
    const coddep = f.properties.CODDEP?.trim() ?? "";
    const codprov = f.properties.CODPROV?.trim() ?? "";
    const coddist = f.properties.CODDIST?.trim() ?? "";
    if (!ubigeo || !coddep || !codprov || !coddist) continue;

    const departamentoNombre = (f.properties.DEPARTAMEN ?? "").trim();
    const provinciaNombre = (f.properties.PROVINCIA ?? "").trim();
    const distritoNombre = (f.properties.DISTRITO ?? "").trim();
    const capital = (f.properties.CAPITAL ?? "").trim() || null;

    const idDep = parseInt(coddep, 10);
    const idProv = parseInt(coddep + codprov, 10);
    const idDist = parseInt(ubigeo, 10);
    if (Number.isNaN(idDep) || Number.isNaN(idProv) || Number.isNaN(idDist)) continue;

    if (!departamentos.has(coddep)) {
      departamentos.set(coddep, { id: idDep, codigo: coddep, nombre: departamentoNombre });
    }
    const provKey = coddep + codprov;
    if (!provincias.has(provKey)) {
      provincias.set(provKey, { id: idProv, id_departamento: idDep, codigo: provKey, nombre: provinciaNombre });
    }
    if (!distritos.has(ubigeo)) {
      distritos.set(ubigeo, { id: idDist, id_provincia: idProv, ubigeo, nombre: distritoNombre, capital });
    }
  }

  console.log(`Parsed ${departamentos.size} dep / ${provincias.size} prov / ${distritos.size} dist desde ${path}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const d of departamentos.values()) {
      await client.query(
        `INSERT INTO geografia_politica.departamento (id, id_pais, codigo, nombre)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
        [d.id, idPais, d.codigo, d.nombre],
      );
    }
    for (const p of provincias.values()) {
      await client.query(
        `INSERT INTO geografia_politica.provincia (id, id_departamento, codigo, nombre)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
        [p.id, p.id_departamento, p.codigo, p.nombre],
      );
    }
    for (const d of distritos.values()) {
      await client.query(
        `INSERT INTO geografia_politica.distrito (id, id_provincia, ubigeo, nombre, capital)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, capital = EXCLUDED.capital`,
        [d.id, d.id_provincia, d.ubigeo, d.nombre, d.capital],
      );
    }

    await client.query("COMMIT");
    console.log("Seed completo.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
