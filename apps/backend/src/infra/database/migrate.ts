/**
 * Simple SQL migration runner.
 * Reads .sql files from /migrations, tracks applied in _migrations table.
 * Usage: bun run src/infra/database/migrate.ts
 */
import "dotenv/config";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";

import { getEnv } from "../../config/env";

async function migrate() {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = join(import.meta.dir, "../../../migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await pool.query("SELECT name FROM _migrations");
    const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

    let appliedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  SKIP: ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await pool.query("COMMIT");
        console.log(`  APPLIED: ${file}`);
        appliedCount++;
      } catch (error) {
        await pool.query("ROLLBACK");
        console.error(`  FAILED: ${file}`, error);
        throw error;
      }
    }

    console.log(appliedCount > 0 ? `\nMigrations complete. Applied ${appliedCount} new.` : "\nNo new migrations to apply.");
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
