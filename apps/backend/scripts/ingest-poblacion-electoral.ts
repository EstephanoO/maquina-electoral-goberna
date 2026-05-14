/**
 * ingest-poblacion-electoral.ts
 *
 * Agrega un corte histórico de población electoral a
 * `datos_externos.poblacion_electoral`. Cada corrida del script con un
 * CSV diferente AGREGA filas — no sobrescribe, así se preserva el
 * historial de cómo fue cambiando el padrón.
 *
 * Usage:
 *   bun scripts/ingest-poblacion-electoral.ts \
 *     --file ./data/padron-onpe-2021.csv \
 *     --anio 2021 \
 *     --fuente "ONPE" \
 *     [--tipo-eleccion "general"] \
 *     [--fuente-url "https://onpe.gob.pe/..."] \
 *     [--fecha-corte 2021-04-11] \
 *     [--dry-run]
 *
 * Formato CSV (headers exactos):
 *
 *   ambito,ubigeo,nombre,poblacion_total,poblacion_electoral,votos_emitidos
 *   distrito,150106,CARABAYLLO,344362,231482,168329
 *   provincia,1501,LIMA,9485405,7012345,5234567
 *   departamento,15,LIMA,11200000,8345678,...
 *
 * - `ambito` ∈ {distrito, provincia, departamento}
 * - `ubigeo`:
 *     - distrito   → 6 dígitos (matchea distrito.id)
 *     - provincia  → 4 dígitos (matchea provincia.id, ej "1501")
 *     - departamento → 1-2 dígitos (matchea departamento.id, ej "15")
 *   Si no tenés UBIGEO, podés usar la columna `nombre` para lookup
 *   case-insensitive contra geografia_politica.*.nombre.
 * - Campos numéricos vacíos → NULL.
 * - El script NO deduplica por (geo, año, fuente) — el user es responsable
 *   de no cargar dos veces el mismo corte.
 *
 * Dependencias DB: corrió migration 072.
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

import { getEnv } from "../src/config/env";

function parseCSV(text: string): Array<Record<string, string>> {
  // Mismo parser que ingest-mef (CSV con quoted fields). Duplicación
  // intencional para mantener scripts standalone — si crece, mover a
  // scripts/_lib/csv.ts.
  const lines: string[] = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuote && text[i + 1] === '"') {
        buf += '"';
        i++;
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

function parseInt0(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,_\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isInteger(n) ? n : null;
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

type Ambito = "distrito" | "provincia" | "departamento";

async function resolveGeoId(
  pool: Pool,
  ambito: Ambito,
  ubigeo: string,
  nombre: string,
): Promise<number | null> {
  // Intento 1: matchear por UBIGEO (id numérico)
  if (ubigeo) {
    const idNum = Number(ubigeo);
    if (Number.isInteger(idNum) && idNum > 0) {
      const table =
        ambito === "distrito" ? "geografia_politica.distrito"
        : ambito === "provincia" ? "geografia_politica.provincia"
        : "geografia_politica.departamento";
      const { rows } = await pool.query<{ id: number }>(
        `SELECT id FROM ${table} WHERE id = $1`,
        [idNum],
      );
      if (rows[0]) return rows[0].id;
    }
  }
  // Intento 2: matchear por nombre case-insensitive
  if (nombre) {
    const table =
      ambito === "distrito" ? "geografia_politica.distrito"
      : ambito === "provincia" ? "geografia_politica.provincia"
      : "geografia_politica.departamento";
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE lower(nombre) = lower($1) LIMIT 1`,
      [nombre],
    );
    if (rows[0]) return rows[0].id;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const file = args.file as string | undefined;
  const anio = args.anio ? Number(args.anio) : undefined;
  const fuente = args.fuente as string | undefined;
  const tipoEleccion = (args["tipo-eleccion"] as string | undefined) ?? null;
  const fuenteUrl = (args["fuente-url"] as string | undefined) ?? null;
  const fechaCorte = (args["fecha-corte"] as string | undefined) ?? null;
  const dryRun = !!args["dry-run"];

  if (!file || !anio || !fuente) {
    console.error(
      "usage: bun scripts/ingest-poblacion-electoral.ts --file <csv> --anio <YYYY> --fuente <ONPE|JNE|RENIEC|INEI> [--tipo-eleccion ...] [--fuente-url ...] [--fecha-corte YYYY-MM-DD] [--dry-run]",
    );
    process.exit(1);
  }

  const path = resolve(process.cwd(), file);
  const text = readFileSync(path, "utf8");
  const rows = parseCSV(text);
  console.log(`[poblacion] ${rows.length} filas en ${path} · fuente=${fuente} anio=${anio}`);

  const env = getEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });

  let inserted = 0;
  let unmatched = 0;

  try {
    for (const r of rows) {
      const ambitoRaw = (r.ambito ?? "").toLowerCase().trim();
      if (!["distrito", "provincia", "departamento"].includes(ambitoRaw)) {
        unmatched++;
        if (unmatched <= 5) console.warn(`[poblacion] ámbito inválido: '${ambitoRaw}'`);
        continue;
      }
      const ambito = ambitoRaw as Ambito;
      const ubigeo = r.ubigeo ?? "";
      const nombre = r.nombre ?? "";

      const geoId = await resolveGeoId(pool, ambito, ubigeo, nombre);
      if (!geoId) {
        unmatched++;
        if (unmatched <= 5) console.warn(`[poblacion] no matcheado: ${ambito}=${ubigeo}/${nombre}`);
        continue;
      }

      if (dryRun) {
        inserted++;
        continue;
      }

      const idDep      = ambito === "departamento" ? geoId : null;
      const idProv     = ambito === "provincia"    ? geoId : null;
      const idDist     = ambito === "distrito"     ? geoId : null;

      await pool.query(
        `INSERT INTO datos_externos.poblacion_electoral
          (id_departamento, id_provincia, id_distrito,
           anio, fecha_corte, fuente, fuente_url, tipo_eleccion,
           poblacion_total, poblacion_electoral, votos_emitidos)
         VALUES ($1,$2,$3, $4,$5,$6,$7,$8, $9,$10,$11)`,
        [
          idDep, idProv, idDist,
          anio, fechaCorte, fuente, fuenteUrl, tipoEleccion,
          parseInt0(r.poblacion_total),
          parseInt0(r.poblacion_electoral),
          parseInt0(r.votos_emitidos),
        ],
      );
      inserted++;
    }

    console.log(`[poblacion] OK · insert=${inserted} unmatched=${unmatched} ${dryRun ? "(DRY RUN)" : ""}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[poblacion] FAIL", e);
  process.exit(1);
});
