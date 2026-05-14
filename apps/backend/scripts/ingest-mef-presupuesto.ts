/**
 * ingest-mef-presupuesto.ts
 *
 * Carga presupuesto municipal (PIM/PIA + ejecución) a `datos_externos.
 * presupuesto_municipal` desde un CSV que vos descargás manualmente del
 * portal MEF Transparencia Económica
 * (https://apps5.mineco.gob.pe/transparencia/Navegador/default.aspx).
 *
 * UPSERT por (id_distrito, anio, codigo_unidad_ejecutora) — re-correrlo
 * con el CSV actualizado reemplaza los montos del PIM/devengado/etc, lo
 * cual refleja correctamente las modificaciones presupuestales del año.
 *
 * Usage:
 *   bun scripts/ingest-mef-presupuesto.ts \
 *     --file ./data/mef-2026-distritos.csv \
 *     --anio 2026 \
 *     [--fuente-url "https://apps5.mineco.gob.pe/..."] \
 *     [--dry-run]
 *
 * Formato CSV esperado (headers exactos en la primera línea):
 *
 *   codigo_pliego,codigo_unidad_ejecutora,nombre_entidad,pia,pim,certificacion,compromiso,devengado,girado
 *   150106,301255,MUNICIPALIDAD DISTRITAL DE CARABAYLLO,148417544,169439642,99644000,93011000,87234000,84567000
 *   ...
 *
 * - `codigo_pliego` debe ser UBIGEO 6 dígitos (matcheable contra
 *   geografia_politica.distrito.id).
 * - Montos en Soles enteros o decimales; comas de miles toleradas.
 * - Columnas faltantes → NULL.
 *
 * Si el portal MEF te da el CSV con columnas distintas, mapealo con
 * `head -1`, renombrá las columnas en el header al formato esperado y
 * volvé a correr.
 *
 * Dependencias DB: corrió migration 072 (datos_externos.*).
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

import { getEnv } from "../src/config/env";

// ── CSV parser mínimo (handles quoted fields + escaped quotes) ──────
function parseCSV(text: string): Array<Record<string, string>> {
  const lines: string[] = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuote && text[i + 1] === '"') {
        buf += '"';
        i++; // escaped
      } else {
        inQuote = !inQuote;
      }
    } else if (c === "\n" && !inQuote) {
      lines.push(buf);
      buf = "";
    } else if (c !== "\r" || inQuote) {
      buf += c;
    }
  }
  if (buf.length > 0) lines.push(buf);

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === "," && !inQ) {
        cells.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    cells.push(cur);
    return cells.map((s) => s.trim());
  };

  if (lines.length === 0) return [];
  const headers = parseLine(lines[0]!).map((h) => h.toLowerCase().trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const cells = parseLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (cells[j] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// ── Helpers ─────────────────────────────────────────────────────────
function parseMoney(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,_\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const file = args.file as string | undefined;
  const anio = args.anio ? Number(args.anio) : undefined;
  const fuenteUrl = (args["fuente-url"] as string | undefined) ?? null;
  const dryRun = !!args["dry-run"];

  if (!file || !anio || !Number.isInteger(anio)) {
    console.error("usage: bun scripts/ingest-mef-presupuesto.ts --file <csv> --anio <YYYY> [--fuente-url url] [--dry-run]");
    process.exit(1);
  }

  const path = resolve(process.cwd(), file);
  const text = readFileSync(path, "utf8");
  const rows = parseCSV(text);
  console.log(`[mef] ${rows.length} filas en ${path}`);

  const env = getEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });

  let inserted = 0;
  let skipped = 0;
  let unmatched = 0;
  const fechaCorte = new Date().toISOString().slice(0, 10);

  try {
    for (const r of rows) {
      const codigoPliego = (r.codigo_pliego ?? "").padStart(6, "0");
      const codigoUe = r.codigo_unidad_ejecutora ?? "";
      const nombre = r.nombre_entidad ?? "";

      // codigo_pliego (6 dígitos UBIGEO) debe matchear distrito.id
      const idDistrito = Number(codigoPliego);
      if (!Number.isInteger(idDistrito) || idDistrito <= 0) {
        skipped++;
        continue;
      }

      // Confirmar que el distrito existe (evita FK error masivo)
      const exists = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM geografia_politica.distrito WHERE id = $1) AS exists",
        [idDistrito],
      );
      if (!exists.rows[0]?.exists) {
        unmatched++;
        if (unmatched <= 5) {
          console.warn(`[mef] distrito no encontrado: ${codigoPliego} (${nombre})`);
        }
        continue;
      }

      if (dryRun) {
        inserted++;
        continue;
      }

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
          idDistrito,
          anio,
          codigoPliego,
          codigoUe,
          nombre,
          parseMoney(r.pia),
          parseMoney(r.pim),
          parseMoney(r.certificacion),
          parseMoney(r.compromiso),
          parseMoney(r.devengado),
          parseMoney(r.girado),
          "MEF Transparencia Económica",
          fuenteUrl,
          fechaCorte,
        ],
      );
      inserted++;
    }

    console.log(`[mef] OK · upsert=${inserted} skip=${skipped} unmatched=${unmatched} ${dryRun ? "(DRY RUN)" : ""}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[mef] FAIL", e);
  process.exit(1);
});
