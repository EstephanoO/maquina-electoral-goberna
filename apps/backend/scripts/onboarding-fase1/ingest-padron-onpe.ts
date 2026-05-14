/**
 * Ingest de padrón electoral histórico hacia
 * `onboarding_fase1.datos_externos.padron_electoral`.
 *
 * Append-only: cada corrida AGREGA filas, no sobrescribe. Si por error
 * cargás dos veces el mismo corte, borralo con:
 *
 *   DELETE FROM datos_externos.padron_electoral
 *   WHERE id_eleccion = (SELECT id FROM datos_externos.eleccion WHERE codigo='EG2021_2V')
 *     AND fuente = 'ONPE'
 *     AND ingestado_en > now() - interval '10 minutes';
 *
 * Usage:
 *   ONBOARDING_DATABASE_URL=... bun scripts/onboarding-fase1/ingest-padron-onpe.ts \
 *     --file ./data/padron-onpe-2021-2v.csv \
 *     --eleccion EG2021_2V \
 *     --fuente ONPE \
 *     [--fuente-url "https://..."] \
 *     [--fecha-corte 2021-06-06] \
 *     [--dry-run]
 *
 * Formato CSV (headers exactos):
 *
 *   ambito,nombre,provincia,departamento,poblacion_total,poblacion_electoral,votos_emitidos
 *
 * - `ambito` ∈ {distrito, provincia, departamento}
 * - `nombre` = nombre del distrito/provincia/departamento (case+tilde-insensitive)
 * - `provincia` y `departamento` opcionales (ayudan a desambiguar)
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

import { getEnv } from "../../src/config/env";
import { parseArgs, parseCSV, parseInt0 } from "./_lib/csv";
import { resolveDepartamentoId, resolveDistritoId, resolveProvinciaId } from "./_lib/geo-lookup";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file as string | undefined;
  const eleccionCodigo = args.eleccion as string | undefined;
  const fuente = (args.fuente as string | undefined) ?? "ONPE";
  const fuenteUrl = (args["fuente-url"] as string | undefined) ?? null;
  const fechaCorte = (args["fecha-corte"] as string | undefined) ?? null;
  const dryRun = !!args["dry-run"];

  if (!file || !eleccionCodigo) {
    console.error("usage: bun scripts/onboarding-fase1/ingest-padron-onpe.ts --file <csv> --eleccion <codigo> [--fuente ONPE] [--fuente-url ...] [--fecha-corte YYYY-MM-DD] [--dry-run]");
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
  console.log(`[padron] ${rows.length} filas · eleccion=${eleccionCodigo} fuente=${fuente}`);

  const pool = new Pool({ connectionString: env.onboardingDatabaseUrl });

  try {
    const { rows: el } = await pool.query<{ id: number }>(
      `SELECT id FROM datos_externos.eleccion WHERE codigo = $1`,
      [eleccionCodigo],
    );
    if (!el[0]) {
      console.error(`[padron] elección '${eleccionCodigo}' no existe en datos_externos.eleccion. Seedeala primero con seed-elecciones.ts.`);
      process.exit(1);
    }
    const idEleccion = el[0].id;

    let inserted = 0;
    let unmatched = 0;
    let skipped = 0;

    for (const r of rows) {
      const ambito = (r.ambito ?? "").toLowerCase().trim();
      const nombre = (r.nombre ?? "").trim();
      const prov = (r.provincia ?? "").trim() || undefined;
      const dep = (r.departamento ?? "").trim() || undefined;

      if (!nombre) { skipped++; continue; }

      let idDep: number | null = null, idProv: number | null = null, idDist: number | null = null;

      if (ambito === "distrito") {
        const m = await resolveDistritoId(pool, nombre, prov, dep);
        if (!m) { unmatched++; if (unmatched <= 10) console.warn(`[padron] no matcheado distrito: ${nombre}/${prov ?? "-"}`); continue; }
        idDist = m.id;
      } else if (ambito === "provincia") {
        const id = await resolveProvinciaId(pool, nombre, dep);
        if (!id) { unmatched++; if (unmatched <= 10) console.warn(`[padron] no matcheado provincia: ${nombre}/${dep ?? "-"}`); continue; }
        idProv = id;
      } else if (ambito === "departamento") {
        const id = await resolveDepartamentoId(pool, nombre);
        if (!id) { unmatched++; if (unmatched <= 10) console.warn(`[padron] no matcheado departamento: ${nombre}`); continue; }
        idDep = id;
      } else {
        skipped++;
        if (skipped <= 5) console.warn(`[padron] ámbito inválido: '${ambito}'`);
        continue;
      }

      if (dryRun) { inserted++; continue; }

      await pool.query(
        `INSERT INTO datos_externos.padron_electoral
          (id_departamento, id_provincia, id_distrito,
           id_eleccion, fuente, fuente_url, fecha_corte,
           poblacion_total, poblacion_electoral, votos_emitidos)
         VALUES ($1,$2,$3, $4,$5,$6,$7, $8,$9,$10)`,
        [
          idDep, idProv, idDist,
          idEleccion, fuente, fuenteUrl, fechaCorte,
          parseInt0(r.poblacion_total),
          parseInt0(r.poblacion_electoral),
          parseInt0(r.votos_emitidos),
        ],
      );
      inserted++;
    }

    console.log(`[padron] OK · insert=${inserted} unmatched=${unmatched} skip=${skipped} ${dryRun ? "(DRY RUN)" : ""}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[padron] FAIL", e);
  process.exit(1);
});
