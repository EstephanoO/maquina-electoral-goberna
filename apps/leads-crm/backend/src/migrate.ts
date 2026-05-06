/**
 * Simple migration runner. Applies any *.sql file in ./migrations whose
 * numeric prefix is greater than the highest applied version.
 *
 * Run with: `npm run migrate`
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./sql.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

type Migration = { version: number; name: string; sqlText: string };

function loadMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const m = f.match(/^(\d+)_(.+)\.sql$/);
      if (!m) throw new Error(`Bad migration filename: ${f} (expected NNN_name.sql)`);
      return {
        version: Number(m[1]),
        name: m[2],
        sqlText: readFileSync(join(MIGRATIONS_DIR, f), "utf8"),
      };
    })
    .sort((a, b) => a.version - b.version);
}

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     INTEGER     PRIMARY KEY,
      name        TEXT        NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function getApplied(): Promise<Set<number>> {
  const rows = await sql<{ version: number }[]>`SELECT version FROM _migrations`;
  return new Set(rows.map((r) => r.version));
}

export async function migrate() {
  await ensureMigrationsTable();
  const applied = await getApplied();
  const migrations = loadMigrations();
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    console.log("[migrate] ✓ up to date (", migrations.length, "migrations)");
    return;
  }

  for (const m of pending) {
    console.log(`[migrate] applying ${m.version} — ${m.name}…`);
    await sql.begin(async (tx) => {
      await tx.unsafe(m.sqlText);
      await tx`INSERT INTO _migrations (version, name) VALUES (${m.version}, ${m.name})`;
    });
  }
  console.log(`[migrate] ✓ applied ${pending.length} migration(s)`);
}

// CLI entry: only run if executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => sql.end())
    .catch((err) => {
      console.error("[migrate] FAILED", err);
      process.exit(1);
    });
}
