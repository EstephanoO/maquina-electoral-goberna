/**
 * Ingest del CSV del MEF Transparencia Económica
 * (https://apps5.mineco.gob.pe/transparencia/Navegador/default.aspx)
 * hacia `onboarding_fase1.datos_externos.presupuesto_municipal`.
 *
 * UPSERT por (id_distrito, anio, codigo_unidad_ejecutora). Re-correrlo
 * con el CSV actualizado refleja las modificaciones presupuestales del año.
 *
 * IMPORTANTE: peru_distritos.id en la DB del geógrafo NO es UBIGEO (es
 * secuencial 1..1891). Por eso resolvemos el id_distrito por NOMBRE
 * + PROVINCIA, no por código pliego directo.
 *
 * Usage:
 *   ONBOARDING_DATABASE_URL=postgres://... bun scripts/onboarding-fase1/ingest-mef-presupuesto.ts \
 *     --file ./data/mef-2026-distritos.csv \
 *     --anio 2026 \
 *     [--fuente-url "https://..."] \
 *     [--dry-run]
 *
 * Formato CSV esperado (headers exactos):
 *
 *   codigo_pliego,codigo_unidad_ejecutora,nombre_entidad,provincia,departamento,pia,pim,certificacion,compromiso,devengado,girado
 *
 * - `nombre_entidad` típicamente "MUNICIPALIDAD DISTRITAL DE CARABAYLLO" —
 *   se extrae el nombre del distrito (después de "DISTRITAL DE ").
 * - `provincia` y `departamento` son OPCIONALES pero ayudan a resolver
 *   ambigüedades (e.g. "SANTIAGO" existe en varios departamentos).
 * - Si `nombre_entidad` no parsea, intenta con `codigo_pliego` (no funciona
 *   con la DB actual del geógrafo, pero queda en stderr para debug).
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

import { getEnv } from "../../src/config/env";
import { parseArgs, parseCSV, parseMoney } from "./_lib/csv";
import { resolveDistritoId } from "./_lib/geo-lookup";

function extractDistritoFromEntidad(nombreEntidad: string): string | null {
  // "MUNICIPALIDAD DISTRITAL DE CARABAYLLO" → "CARABAYLLO"
  // "MUNICIPALIDAD PROVINCIAL DE LIMA"      → null (es provincial, no distrital)
  const m = nombreEntidad.match(/MUNICIPALIDAD\s+DISTRITAL\s+DE\s+(.+?)$/i);
  return m ? m[1]!.trim() : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file as string | undefined;
  const anio = args.anio ? Number(args.anio) : undefined;
  const fuenteUrl = (args["fuente-url"] as string | undefined) ?? null;
  const dryRun = !!args["dry-run"];

  if (!file || !anio || !Number.isInteger(anio)) {
    console.error("usage: bun scripts/onboarding-fase1/ingest-mef-presupuesto.ts --file <csv> --anio <YYYY> [--fuente-url url] [--dry-run]");
    process.exit(1);
  }

  const env = getEnv();
  if (!env.onboardingDatabaseUrl) {
    console.error("ONBOARDING_DATABASE_URL no configurada");
    process.exit(1);
  }

  const path = resolve(process.cwd(), file);
  const text = readFileSync(path, "utf8");
  const rows = parseCSV(text);
  console.log(`[mef] ${rows.length} filas en ${path}`);

  const pool = new Pool({ connectionString: env.onboardingDatabaseUrl });

  let upserted = 0;
  let skipped = 0;
  let unmatched = 0;
  const fechaCorte = new Date().toISOString().slice(0, 10);

  try {
    for (const r of rows) {
      const codigoPliego = (r.codigo_pliego ?? "").trim();
      const codigoUe = (r.codigo_unidad_ejecutora ?? "").trim();
      const nombre = (r.nombre_entidad ?? "").trim();
      const provincia = (r.provincia ?? "").trim() || undefined;
      const departamento = (r.departamento ?? "").trim() || undefined;

      const distritoName = extractDistritoFromEntidad(nombre);
      if (!distritoName) {
        skipped++;
        if (skipped <= 5) {
          console.warn(`[mef] sin distrito en nombre: '${nombre}' (pliego ${codigoPliego})`);
        }
        continue;
      }

      const match = await resolveDistritoId(pool, distritoName, provincia, departamento);
      if (!match) {
        unmatched++;
        if (unmatched <= 10) {
          console.warn(`[mef] no matcheado: ${distritoName} / ${provincia ?? "-"} / ${departamento ?? "-"}`);
        }
        continue;
      }

      if (dryRun) { upserted++; continue; }

      await pool.query(
        `INSERT INTO datos_externos.presupuesto_municipal
          (id_distrito, anio, codigo_pliego, codigo_unidad_ejecutora,
           nombre_entidad, pia, pim, certificacion, compromiso, devengado, girado,
           fuente, fuente_url, fecha_corte)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id_distrito, anio, codigo_unidad_ejecutora) DO UPDATE SET
           nombre_entidad = EXCLUDED.nombre_entidad,
           pia            = EXCLUDED.pia,
           pim            = EXCLUDED.pim,
           certificacion  = EXCLUDED.certificacion,
           compromiso     = EXCLUDED.compromiso,
           devengado      = EXCLUDED.devengado,
           girado         = EXCLUDED.girado,
           fuente_url     = EXCLUDED.fuente_url,
           fecha_corte    = EXCLUDED.fecha_corte,
           ingestado_en   = now()`,
        [
          match.id, anio, codigoPliego || null, codigoUe || null,
          nombre,
          parseMoney(r.pia), parseMoney(r.pim), parseMoney(r.certificacion),
          parseMoney(r.compromiso), parseMoney(r.devengado), parseMoney(r.girado),
          "MEF Transparencia Económica", fuenteUrl, fechaCorte,
        ],
      );
      upserted++;
    }

    console.log(`[mef] OK · upsert=${upserted} skip=${skipped} unmatched=${unmatched} ${dryRun ? "(DRY RUN)" : ""}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[mef] FAIL", e);
  process.exit(1);
});
