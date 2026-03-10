/**
 * provision-vasquez-operators.ts
 *
 * Crea cuentas de operador digital SOLO para la campaña César Vásquez.
 * Idempotente — seguro de correr múltiples veces (usa ON CONFLICT).
 *
 * Uso desde el VPS:
 *   cd /srv/app && bun run apps/backend/scripts/provision-vasquez-operators.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { getEnv } from "../src/config/env";

const CAMPAIGN_ID = "eece49d5-a315-4764-83f9-681cabae5c51"; // César Vásquez

/* ─── Operadores a provisionar ─────────────────────────────────────────── */

const OPERATORS = [
  { full_name: "Alessandro Matías Rodríguez Sánchez",  email: "alessandro@goberna.pe",  password: "Alessandro1234!"  },
  { full_name: "Johan Joaquin Sanchez Sanchez",         email: "johan@goberna.pe",        password: "Johan1234!"        },
  { full_name: "Jorge Johan Sánchez Villavicencio",     email: "jorge@goberna.pe",        password: "Jorge1234!"        },
  { full_name: "Juan Diego Luna Gonzales",              email: "juandiego@goberna.pe",    password: "Juandiego1234!"    },
  { full_name: "Juana Marylin Rodríguez Palomino",      email: "juana@goberna.pe",        password: "Juana1234!"        },
  { full_name: "Luz Maria Meingochea Valencia",         email: "luz@goberna.pe",          password: "Luz1234!"          },
  { full_name: "Manuel Ricardo Vásquez Ojeda",          email: "manuel@goberna.pe",       password: "Manuel1234!"       },
  { full_name: "María Esther Colonia Cordova",          email: "maria@goberna.pe",        password: "Maria1234!"        },
  { full_name: "Maryori Ramos Aranguren",               email: "maryori@goberna.pe",      password: "Maryori1234!"      },
  { full_name: "Milagros Lisset Pereyra Rojas",         email: "milagros@goberna.pe",     password: "Milagros1234!"     },
  { full_name: "Nilson Rojas Huaman",                   email: "nilson@goberna.pe",       password: "Nilson1234!"       },
  { full_name: "Renso Evelio Ramirez Garcia",           email: "renso@goberna.pe",        password: "Renso1234!"        },
] as const;

/* ─── Main ──────────────────────────────────────────────────────────────── */

async function provision() {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });

  try {
    console.log("\n  Provisionando operadores digitales para César Vásquez…\n");

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

      await pool.query(
        `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital)
         VALUES ($1, $2, 'agente_digital', 'active', false, true)
         ON CONFLICT (user_id, campaign_id)
           DO UPDATE SET
             role         = 'agente_digital',
             status       = 'active',
             perm_tierra  = false,
             perm_digital = true`,
        [user.id, CAMPAIGN_ID],
      );
      console.log(`    → Asignado a: César Vásquez`);
    }

    console.log("\n  ╔════════════════════════════════════════════════════════════════════════╗");
    console.log("  ║  Operadores César Vásquez                                              ║");
    console.log("  ╠════════════════════════════════════════════════════════════════════════╣");
    for (const op of OPERATORS) {
      const padName  = op.full_name.padEnd(38);
      const padEmail = op.email.padEnd(26);
      console.log(`  ║  ${padName} ${padEmail} ║`);
    }
    console.log("  ╚════════════════════════════════════════════════════════════════════════╝\n");

  } finally {
    await pool.end();
  }
}

provision().catch((err) => {
  console.error("  ✗ Provisioning failed:", err);
  process.exit(1);
});
