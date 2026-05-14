/**
 * SQL migration runner para la DB `onboarding_fase1` (source of truth del
 * CRM de candidatos + catálogos del geógrafo + datos externos).
 *
 * Lee .sql de /migrations-onboarding, tracking en
 * `onboarding_fase1.public._migrations_onboarding` para no chocar con el
 * `_migrations` que pueda haber ahí.
 *
 * Importante: NO toca las tablas existentes del geógrafo (fase_1.*,
 * geografia_politica.*). Solo agrega schemas paralelos.
 *
 * Usage: bun run src/infra/database/migrate-onboarding.ts
 */
import "dotenv/config";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";

import { getEnv } from "../../config/env";

async function migrate() {
  const env = getEnv();
  if (!env.onboardingDatabaseUrl) {
    throw new Error("ONBOARDING_DATABASE_URL no configurada");
  }
  const pool = new Pool({ connectionString: env.onboardingDatabaseUrl });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public._migrations_onboarding (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = join(import.meta.dir, "../../../migrations-onboarding");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await pool.query(
      "SELECT name FROM public._migrations_onboarding",
    );
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
        await pool.query(
          "INSERT INTO public._migrations_onboarding (name) VALUES ($1)",
          [file],
        );
        await pool.query("COMMIT");
        console.log(`  APPLIED: ${file}`);
        appliedCount++;
      } catch (error) {
        await pool.query("ROLLBACK");
        console.error(`  FAILED: ${file}`, error);
        throw error;
      }
    }

    console.log(
      appliedCount > 0
        ? `\nOnboarding migrations complete. Applied ${appliedCount} new.`
        : "\nNo new onboarding migrations to apply.",
    );
  } finally {
    await pool.end();
  }
}

migrate().catch((e) => {
  console.error("Onboarding migration failed:", e);
  process.exit(1);
});
