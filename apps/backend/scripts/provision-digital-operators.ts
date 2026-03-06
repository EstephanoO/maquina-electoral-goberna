/**
 * provision-digital-operators.ts
 *
 * Crea cuentas de operador digital y las asigna a TODAS las campañas activas.
 * Idempotente — seguro de correr múltiples veces (usa ON CONFLICT).
 *
 * Uso:
 *   DATABASE_URL=<prod_url> bun run scripts/provision-digital-operators.ts
 *
 * o desde el VPS:
 *   cd /srv/app && bun run apps/backend/scripts/provision-digital-operators.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { getEnv } from "../src/config/env";

/* ─── Operadores a provisionar ─────────────────────────────────────────── */

const OPERATORS = [
  { full_name: "Paloma Ramos Gonzales",    email: "paloma@goberna.pe",  password: "Paloma1234!" },
  { full_name: "Dafer Quispe Durand",      email: "dafer@goberna.pe",   password: "Dafer1234!"  },
  { full_name: "Aaron Yasser Vega Pajuelo",email: "aaron@goberna.pe",   password: "Aaron1234!" },
] as const;

// Victor Miranda Acosta — ya tiene cuenta, skip

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function provision() {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });

  try {
    console.log("\n  Provisionando operadores digitales…\n");

    // 1. Obtener todas las campañas activas
    const { rows: campaigns } = await pool.query<{ id: string; slug: string; name: string }>(
      `SELECT id, slug, name FROM campaigns WHERE status = 'active' ORDER BY name`,
    );

    if (campaigns.length === 0) {
      console.error("  ✗ No hay campañas activas en la base de datos.");
      process.exit(1);
    }

    console.log(`  Campañas activas (${campaigns.length}):`);
    for (const c of campaigns) {
      console.log(`    · ${c.name} (${c.slug})`);
    }
    console.log();

    // 2. Crear usuarios e asignar a todas las campañas
    for (const op of OPERATORS) {
      const hash = await bcrypt.hash(op.password, env.bcryptRounds);

      const { rows } = await pool.query<{ id: string; email: string }>(
        `INSERT INTO users (email, password_hash, full_name, role, status)
         VALUES ($1, $2, $3, 'agente_digital', 'active')
         ON CONFLICT ((lower(email)))
           DO UPDATE SET
             password_hash = EXCLUDED.password_hash,
             full_name     = EXCLUDED.full_name,
             role          = 'agente_digital',
             status        = 'active'
         RETURNING id, email`,
        [op.email, hash, op.full_name],
      );

      const user = rows[0]!;
      console.log(`  ✓ Usuario: ${user.email} → ${user.id}`);

      for (const campaign of campaigns) {
        await pool.query(
          `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital)
           VALUES ($1, $2, 'agente_digital', 'active', false, true)
           ON CONFLICT (user_id, campaign_id)
             DO UPDATE SET
               role         = 'agente_digital',
               status       = 'active',
               perm_tierra  = false,
               perm_digital = true`,
          [user.id, campaign.id],
        );
        console.log(`    → Asignado a: ${campaign.name}`);
      }
    }

    // 3. Resumen
    console.log("\n  ╔═══════════════════════════════════════════════════════════════╗");
    console.log("  ║  Operadores digitales provisionados                           ║");
    console.log("  ╠═══════════════════════════════════════════════════════════════╣");
    for (const op of OPERATORS) {
      const padName = op.full_name.padEnd(28);
      const padEmail = op.email.padEnd(24);
      console.log(`  ║  ${padName} ${padEmail} ║`);
    }
    console.log("  ╚═══════════════════════════════════════════════════════════════╝\n");

  } finally {
    await pool.end();
  }
}

provision().catch((err) => {
  console.error("  ✗ Provisioning failed:", err);
  process.exit(1);
});
