/**
 * Dev seed script: creates admin, candidate campaigns, and candidate users.
 * Idempotent — safe to run multiple times (uses ON CONFLICT).
 * Usage: bun run seed
 */
import "dotenv/config";

import bcrypt from "bcryptjs";
import { Pool } from "pg";

import { getEnv } from "../src/config/env";

/* ─── Data ────────────────────────────────────────────────────────────── */

const ADMIN = {
  email: "admin@goberna.pe",
  password: "Admin1234!",
  full_name: "Administrador GOBERNA",
  role: "admin",
  status: "active",
} as const;

const CANDIDATES = [
  {
    name: "Guillermo Aliaga",
    slug: "guillermo-aliaga",
    cargo: "Senador Nacional",
    numero: 1,
    partido: "Somos Peru",
    foto_url: "/uploads/candidates/guillermo-aliaga.jpg",
    config: { 
      modules: ["tierra", "digital"],
      color_primario: "#1e40af",
      color_secundario: "#fbbf24",
    },
    user: {
      email: "guillermo@goberna.pe",
      password: "Gx7kM2nP",
      full_name: "Guillermo Aliaga",
      role: "candidato" as const,
    },
  },
  {
    name: "Rocio Porras",
    slug: "rocio-porras",
    cargo: "Senadora Nacional",
    numero: 4,
    partido: "Somos Peru",
    foto_url: "/uploads/candidates/rocio-porras.jpg",
    config: { 
      modules: ["tierra", "digital"],
      color_primario: "#dc2626",
      color_secundario: "#ffffff",
    },
    user: {
      email: "rocio@goberna.pe",
      password: "Rp3vL8wQ",
      full_name: "Rocio Porras",
      role: "candidato" as const,
    },
  },
  {
    name: "Giovanna Castagnino",
    slug: "giovanna-castagnino",
    cargo: "Senadora Nacional",
    numero: 12,
    partido: "Somos Peru",
    foto_url: "/uploads/candidates/giovanna-castagnino.jpg",
    config: { 
      modules: ["tierra", "digital"],
      color_primario: "#1e40af",
      color_secundario: "#ef4444",
    },
    user: {
      email: "giovanna@goberna.pe",
      password: "Gn5tK9xJ",
      full_name: "Giovanna Castagnino",
      role: "candidato" as const,
    },
  },
] as const;

/** Default form schema for new candidates */
const DEFAULT_FORM_SCHEMA = {
  version: "1.0",
  fields: [
    {
      id: "nombre",
      type: "text",
      label: "Nombre completo",
      placeholder: "Ingresa nombre y apellidos",
      required: true,
      validation: { min: 3, maxLength: 100 },
    },
    {
      id: "telefono",
      type: "phone",
      label: "Telefono",
      placeholder: "999 888 777",
      required: true,
      validation: { pattern: "^[0-9]{9}$" },
    },
    {
      id: "ubicacion",
      type: "location",
      label: "Ubicacion GPS",
      required: true,
    },
    {
      id: "distrito",
      type: "text",
      label: "Distrito",
      placeholder: "Ej: San Isidro",
      required: false,
    },
    {
      id: "comentarios",
      type: "textarea",
      label: "Comentarios",
      placeholder: "Observaciones adicionales",
      required: false,
      validation: { maxLength: 500 },
    },
  ],
};

/* ─── Seed ────────────────────────────────────────────────────────────── */

async function seed() {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });

  try {
    console.log("\n  Seeding GOBERNA dev data…\n");

    // ── 1. Create campaigns ──────────────────────────────────────────
    const campaignIds: Record<string, string> = {};

    for (const c of CANDIDATES) {
      const { rows } = await pool.query(
        `INSERT INTO campaigns (name, slug, cargo, numero, partido, foto_url, config, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
         ON CONFLICT (slug) DO UPDATE SET
           name      = EXCLUDED.name,
           cargo     = EXCLUDED.cargo,
           numero    = EXCLUDED.numero,
           partido   = EXCLUDED.partido,
           foto_url  = EXCLUDED.foto_url,
           config    = EXCLUDED.config
         RETURNING id, name, slug`,
        [
          c.name,
          c.slug,
          c.cargo,
          c.numero,
          c.partido,
          c.foto_url,
          JSON.stringify(c.config),
        ],
      );
      const campaign = rows[0]!;
      campaignIds[c.slug] = campaign.id;
      console.log(`  Campaign: ${campaign.slug} → ${campaign.id}`);
    }

    // ── 2. Create admin user ─────────────────────────────────────────
    const adminHash = await bcrypt.hash(ADMIN.password, env.bcryptRounds);
    const { rows: adminRows } = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ((lower(email)))
         DO UPDATE SET password_hash = EXCLUDED.password_hash,
                       full_name     = EXCLUDED.full_name,
                       role          = EXCLUDED.role,
                       status        = EXCLUDED.status
       RETURNING id, email`,
      [ADMIN.email, adminHash, ADMIN.full_name, ADMIN.role, ADMIN.status],
    );
    const admin = adminRows[0]!;
    console.log(`  Admin:    ${admin.email} → ${admin.id}`);

    // ── 3. Assign admin to ALL campaigns ─────────────────────────────
    for (const slug of Object.keys(campaignIds)) {
      await pool.query(
        `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital)
         VALUES ($1, $2, 'admin', 'active', true, true)
         ON CONFLICT (user_id, campaign_id)
           DO UPDATE SET role         = EXCLUDED.role,
                         status       = EXCLUDED.status,
                         perm_tierra  = EXCLUDED.perm_tierra,
                         perm_digital = EXCLUDED.perm_digital`,
        [admin.id, campaignIds[slug]],
      );
    }
    console.log(`  Admin assigned to ${Object.keys(campaignIds).length} campaigns`);

    // ── 4. Create default form definitions for each campaign ──────────
    for (const c of CANDIDATES) {
      const campaignId = campaignIds[c.slug];
      await pool.query(
        `INSERT INTO form_definitions (campaign_id, name, slug, description, schema, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         ON CONFLICT (campaign_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           schema = EXCLUDED.schema,
           status = 'active'`,
        [
          campaignId,
          `Formulario ${c.name}`,
          "formulario-principal",
          `Formulario principal de captura para ${c.name}`,
          JSON.stringify(DEFAULT_FORM_SCHEMA),
        ],
      );
      console.log(`  Form:     ${c.slug} → formulario-principal (active)`);
    }

    // ── 5. Create candidate users & assign to their campaign ─────────
    for (const c of CANDIDATES) {
      const hash = await bcrypt.hash(c.user.password, env.bcryptRounds);
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT ((lower(email)))
           DO UPDATE SET password_hash = EXCLUDED.password_hash,
                         full_name     = EXCLUDED.full_name,
                         role          = EXCLUDED.role,
                         status        = 'active'
         RETURNING id, email`,
        [c.user.email, hash, c.user.full_name, c.user.role],
      );
      const user = rows[0]!;

      await pool.query(
         `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital)
         VALUES ($1, $2, 'candidato', 'active', true, true)
         ON CONFLICT (user_id, campaign_id)
           DO UPDATE SET role         = EXCLUDED.role,
                         status       = EXCLUDED.status,
                         perm_tierra  = EXCLUDED.perm_tierra,
                         perm_digital = EXCLUDED.perm_digital`,
        [user.id, campaignIds[c.slug]],
      );

      console.log(`  User:     ${user.email} → ${user.id} (${c.slug})`);
    }

    // ── 6. Summary ───────────────────────────────────────────────────
    console.log("\n  Seed complete!\n");
    console.log("  ╔═══════════════════════════════════════════════════════════╗");
    console.log("  ║  GOBERNA — Credenciales de desarrollo                    ║");
    console.log("  ╠═══════════════════════════════════════════════════════════╣");
    console.log(`  ║  Admin:     ${ADMIN.email.padEnd(30)} ${ADMIN.password.padEnd(12)} ║`);
    console.log("  ╠═══════════════════════════════════════════════════════════╣");
    for (const c of CANDIDATES) {
      console.log(
        `  ║  ${c.user.full_name.padEnd(22)} ${c.user.email.padEnd(24)} ${c.user.password.padEnd(8)} ║`,
      );
    }
    console.log("  ╚═══════════════════════════════════════════════════════════╝\n");
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
