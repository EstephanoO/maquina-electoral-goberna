/**
 * Seed inicial de `datos_externos.eleccion` con los procesos electorales
 * que más usan los scripts de ingest (padrón ONPE, resultados JNE).
 *
 * Idempotente — usa ON CONFLICT (codigo) DO NOTHING.
 *
 * Usage:
 *   ONBOARDING_DATABASE_URL=... bun scripts/onboarding-fase1/seed-elecciones.ts
 */
import "dotenv/config";

import { Pool } from "pg";

import { getEnv } from "../../src/config/env";

const ELECCIONES = [
  { codigo: "EG2021_1V", nombre: "Elecciones Generales 2021 — 1ra vuelta",       tipo: "general",            fecha_eleccion: "2021-04-11", ambito: "nacional" },
  { codigo: "EG2021_2V", nombre: "Elecciones Generales 2021 — 2da vuelta",       tipo: "general",            fecha_eleccion: "2021-06-06", ambito: "nacional" },
  { codigo: "ERM2022",   nombre: "Elecciones Regionales y Municipales 2022",     tipo: "regional_municipal", fecha_eleccion: "2022-10-02", ambito: "mixta" },
  { codigo: "ERM2026",   nombre: "Elecciones Regionales y Municipales 2026",     tipo: "regional_municipal", fecha_eleccion: "2026-04-10", ambito: "mixta" },
  { codigo: "EG2026",    nombre: "Elecciones Generales 2026",                    tipo: "general",            fecha_eleccion: "2026-04-12", ambito: "nacional" },
];

async function main() {
  const env = getEnv();
  if (!env.onboardingDatabaseUrl) {
    console.error("ONBOARDING_DATABASE_URL no configurada");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: env.onboardingDatabaseUrl });
  try {
    for (const e of ELECCIONES) {
      await pool.query(
        `INSERT INTO datos_externos.eleccion (codigo, nombre, tipo, fecha_eleccion, ambito)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (codigo) DO NOTHING`,
        [e.codigo, e.nombre, e.tipo, e.fecha_eleccion, e.ambito],
      );
    }
    const { rows } = await pool.query<{ codigo: string; nombre: string }>(
      `SELECT codigo, nombre FROM datos_externos.eleccion ORDER BY fecha_eleccion`,
    );
    console.log(`[seed-elecciones] OK · ${rows.length} elecciones:`);
    rows.forEach((r) => console.log(`  ${r.codigo}\t${r.nombre}`));
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error("[seed-elecciones] FAIL", e); process.exit(1); });
