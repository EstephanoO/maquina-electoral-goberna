/**
 * migrate-neon-to-vps.ts
 *
 * Reads the Neon database export (234 form records) and generates a SQL
 * migration file with INSERT statements for the VPS PostgreSQL database.
 *
 * Usage: bun run scripts/migrate-neon-to-vps.ts
 */

import { resolve } from "path";

const INPUT_FILE = resolve(
  process.env.HOME!,
  ".local/share/opencode/tool-output/tool_c6ccbae6000198zLkdE0CiYdnO"
);
const OUTPUT_FILE = resolve(import.meta.dir, "migration.sql");

// Campaign ID mapping
const CAMPAIGN_MAP: Record<string, string> = {
  rocio: "00f81464-350d-4a01-9d63-98461613a894",
  "Rocio Porras": "00f81464-350d-4a01-9d63-98461613a894",
  "Giovanna Castagnino": "27b0f27f-23fc-4382-b9f2-53db1bb83a5d",
  "Guillermo Aliaga": "c72e7b14-a796-4853-86f8-e97de2c3cc24",
  Guillermo: "c72e7b14-a796-4853-86f8-e97de2c3cc24",
};

interface NeonRecord {
  id: string;
  nombre: string;
  telefono: string;
  fecha: string;
  x: number;
  y: number;
  zona: string;
  candidate: string;
  encuestador: string;
  encuestador_id: string;
  candidato_preferido: string;
  client_id: string | null;
  created_at: string;
  home_maps_url: string | null;
  polling_place_url: string | null;
  comentarios: string | null;
}

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function sqlString(value: string | null): string {
  if (value === null || value === undefined) return "NULL";
  return `'${escapeSQL(value)}'`;
}

function sqlNumber(value: number | null): string {
  if (value === null || value === undefined) return "NULL";
  return String(value);
}

async function main() {
  // Read and parse the input file
  const raw = await Bun.file(INPUT_FILE).text();
  const parsed = JSON.parse(raw);
  const records: NeonRecord[] = parsed[0].json_agg;

  console.log(`Read ${records.length} records from Neon export`);

  const columns = [
    "id",
    "nombre",
    "telefono",
    "fecha",
    "x",
    "y",
    "zona",
    "candidate",
    "encuestador",
    "encuestador_id",
    "candidato_preferido",
    "client_id",
    "created_at",
    "home_maps_url",
    "polling_place_url",
    "comentarios",
    "campaign_id",
    "form_definition_id",
    "meet_id",
  ];

  const lines: string[] = [
    "-- Migration: Neon forms → VPS PostgreSQL",
    `-- Generated: ${new Date().toISOString()}`,
    `-- Records: ${records.length}`,
    "",
    "BEGIN;",
    "",
  ];

  let unmappedCandidates = 0;

  for (const r of records) {
    const campaignId = CAMPAIGN_MAP[r.candidate];
    if (!campaignId) {
      console.warn(`  WARNING: Unknown candidate "${r.candidate}" for record ${r.id}`);
      unmappedCandidates++;
    }

    // Generate client_id for null values
    const clientId = r.client_id ?? `migrated-${r.id.slice(0, 8)}`;

    const values = [
      sqlString(r.id),                    // id
      sqlString(r.nombre),                // nombre
      sqlString(r.telefono),              // telefono
      sqlString(r.fecha),                 // fecha
      sqlNumber(r.x),                     // x
      sqlNumber(r.y),                     // y
      sqlString(r.zona),                  // zona
      sqlString(r.candidate),             // candidate
      sqlString(r.encuestador),           // encuestador
      sqlString(r.encuestador_id),        // encuestador_id
      sqlString(r.candidato_preferido),   // candidato_preferido
      sqlString(clientId),                // client_id
      sqlString(r.created_at),            // created_at
      sqlString(r.home_maps_url),         // home_maps_url (NULL if null)
      sqlString(r.polling_place_url),     // polling_place_url (NULL if null)
      sqlString(r.comentarios),           // comentarios (NULL if null)
      campaignId ? sqlString(campaignId) : "NULL", // campaign_id
      "NULL",                             // form_definition_id
      "NULL",                             // meet_id
    ];

    lines.push(
      `INSERT INTO forms (${columns.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  lines.push("");
  lines.push("COMMIT;");
  lines.push("");

  const sql = lines.join("\n");

  await Bun.write(OUTPUT_FILE, sql);

  console.log(`\nGenerated: ${OUTPUT_FILE}`);
  console.log(`  Total INSERT statements: ${records.length}`);
  console.log(`  Null client_ids patched: ${records.filter((r) => !r.client_id).length}`);
  if (unmappedCandidates > 0) {
    console.log(`  WARNING: ${unmappedCandidates} records with unmapped candidates`);
  } else {
    console.log(`  All candidates mapped successfully`);
  }
}

main().catch((err) => {
  console.error("Migration script failed:", err);
  process.exit(1);
});
