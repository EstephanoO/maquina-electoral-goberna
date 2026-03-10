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
    foto_url: "/uploads/candidates/guillermo-aliaga-7479fa57-e702-480c-a5f8-6dfcc3acfdfa.jpg",
    config: { 
      modules: ["tierra", "digital"],
      color_primario: "#1e40af",
      color_secundario: "#fbbf24",
      meta_datos: 10000,
      meta_votos: 6000,
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
    foto_url: "/uploads/candidates/rocio-porras-31576e65-3e45-4685-8af0-48fa2a84b47f.jpg",
    config: { 
      modules: ["tierra", "digital"],
      color_primario: "#dc2626",
      color_secundario: "#ffffff",
      meta_datos: 8000,
      meta_votos: 5000,
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
    foto_url: "/uploads/candidates/giovanna-castagnino-513f74a9-289f-4834-adae-cb8d903c4d74.jpg",
    config: { 
      modules: ["tierra", "digital"],
      color_primario: "#1e40af",
      color_secundario: "#ef4444",
      meta_datos: 7000,
      meta_votos: 4500,
    },
    user: {
      email: "giovanna@goberna.pe",
      password: "Gn5tK9xJ",
      full_name: "Giovanna Castagnino",
      role: "candidato" as const,
    },
  },
  {
    name: "Rosangella Barbarán",
    slug: "rosangella-barbaran",
    cargo: "Senadora Nacional",
    numero: 15,
    partido: "Somos Peru",
    foto_url: "/uploads/candidates/rosangella-barbaran-181d4efe-107c-43f4-a5a7-9726dce16717.png",
    config: { 
      modules: ["tierra", "digital"],
      color_primario: "#7c3aed",
      color_secundario: "#fbbf24",
      meta_datos: 5000,
      meta_votos: 3500,
    },
    user: {
      email: "rosangella@goberna.pe",
      password: "Rb4wN6mT",
      full_name: "Rosangella Barbarán",
      role: "candidato" as const,
    },
  },
  {
    name: "Ernesto Bustamante",
    slug: "ernesto-bustamante",
    cargo: "Senador Nacional",
    numero: 7,
    partido: "Fuerza Popular",
    foto_url: "/uploads/candidates/ernesto-bustamante-946cacc9-5add-44da-81bb-31814e5b6db7.jpg",
    config: {
      modules: ["tierra", "digital"],
      color_primario: "#ea580c",
      color_secundario: "#ffffff",
      meta_datos: 8000,
      meta_votos: 5000,
    },
    user: {
      email: "ernesto@goberna.pe",
      password: "Eb9kT4mW",
      full_name: "Ernesto Bustamante",
      role: "candidato" as const,
    },
  },
  {
    name: "Fernando Rospigliosi",
    slug: "fernando-rospigliosi",
    cargo: "Senador Nacional",
    numero: 3,
    partido: "Fuerza Popular",
    foto_url: "/uploads/candidates/fernando-rospigliosi-c2eceee5-2064-4d98-b222-cac763cdacf4.jpg",
    config: {
      modules: ["tierra", "digital"],
      color_primario: "#0369a1",
      color_secundario: "#f97316",
      meta_datos: 6000,
      meta_votos: 4000,
    },
    user: {
      email: "fernando@goberna.pe",
      password: "Fr6nP8xQ",
      full_name: "Fernando Rospigliosi",
      role: "candidato" as const,
    },
  },
  {
    name: "Fuerza Popular",
    slug: "fuerza-popular",
    cargo: "Candidato",
    numero: 2,
    partido: "Fuerza Popular",
    foto_url: "/uploads/candidates/fuerza-popular-8ab1e7c5-3018-43e5-b83c-f25712b87049.png",
    config: {
      modules: ["tierra", "digital"],
      color_primario: "#163960",
      color_secundario: "#fbbf24",
      meta_datos: 5000,
      meta_votos: 3500,
    },
    user: {
      email: "fuerzapopular@goberna.us",
      password: "Fp7kN3mT",
      full_name: "Fuerza Popular",
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

    // ── 6. Reusable campaign data seeder ────────────────────────────
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
    const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

    // Ensure form_validations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_validations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id TEXT NOT NULL, campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        nombre TEXT NOT NULL DEFAULT '', telefono TEXT NOT NULL DEFAULT '',
        encuestador TEXT NOT NULL DEFAULT '', zona TEXT NOT NULL DEFAULT '',
        form_created_at TIMESTAMPTZ NOT NULL DEFAULT now(), status TEXT NOT NULL DEFAULT 'pendiente',
        notes TEXT, claimed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`);
    await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE form_validations ADD COLUMN IF NOT EXISTS vote_class TEXT NOT NULL DEFAULT ''`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_form_validations_phone_campaign ON form_validations (telefono, campaign_id)`);

    type TeamMember = { email: string; password: string; full_name: string; role: string; region: string; phone: string };
    type ZoneDef = { name: string; lat: number; lng: number; radius: number; color: string; assignIdx: number };
    type MeetDef = { title: string; location: string; lat: number; lng: number; status: string; type: string; daysBack: number; leaderIdx: number; zoneIdx: number | null; target: number | null };
    type ContactDef = { nombre: string; telefono: string; distrito: string; lat: number; lng: number; submitterIdx: number; daysBack: number };
    type ValDef = { idx: number; status: string; vote_class: string; claimerIdx: number | null };

    async function seedCampaignData(
      campaignId: string, slug: string, label: string,
      team: TeamMember[], zones: ZoneDef[], meets: MeetDef[],
      contacts: ContactDef[], validations: ValDef[],
    ) {
      console.log(`\n  Seeding data for ${label}…\n`);
      const teamIds: string[] = [];

      // Team
      for (const m of team) {
        const h = await bcrypt.hash(m.password, env.bcryptRounds);
        const { rows } = await pool.query(
          `INSERT INTO users (email,password_hash,full_name,role,status,phone,region) VALUES ($1,$2,$3,$4,'active',$5,$6)
           ON CONFLICT ((lower(email))) DO UPDATE SET password_hash=EXCLUDED.password_hash,full_name=EXCLUDED.full_name,role=EXCLUDED.role,status='active',phone=EXCLUDED.phone,region=EXCLUDED.region
           RETURNING id`, [m.email, h, m.full_name, m.role, m.phone, m.region]);
        teamIds.push(rows[0]!.id);
        const pt = m.role !== "agente_digital", pd = m.role === "agente_digital" || m.role === "brigadista_zonal";
        await pool.query(
          `INSERT INTO user_campaigns (user_id,campaign_id,role,status,perm_tierra,perm_digital,region) VALUES ($1,$2,$3,'active',$4,$5,$6)
           ON CONFLICT (user_id,campaign_id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,perm_tierra=EXCLUDED.perm_tierra,perm_digital=EXCLUDED.perm_digital,region=EXCLUDED.region`,
          [rows[0]!.id, campaignId, m.role, pt, pd, m.region]);
      }
      console.log(`  Team: ${team.length} members`);

      // Zones
      const zoneIds: string[] = [];
      for (const z of zones) {
        const { rows } = await pool.query(
          `INSERT INTO zones (campaign_id,name,center_lat,center_lng,radius_meters,color,assigned_to) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
          [campaignId, z.name, z.lat, z.lng, z.radius, z.color, teamIds[z.assignIdx] ?? null]);
        zoneIds.push(rows[0]?.id ?? "");
      }
      console.log(`  Zones: ${zones.length}`);

      // Meets
      const meetIds: string[] = [];
      for (const m of meets) {
        const s = m.daysBack >= 0 ? daysAgo(m.daysBack) : daysFromNow(-m.daysBack);
        const e = m.status === "completed" ? s : null;
        const { rows } = await pool.query(
          `INSERT INTO meets (campaign_id,title,location_name,lat,lng,status,meet_type,starts_at,ends_at,leader_id,zone_id,target_forms,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$10) ON CONFLICT DO NOTHING RETURNING id`,
          [campaignId, m.title, m.location, m.lat, m.lng, m.status, m.type, s, e, teamIds[m.leaderIdx] ?? null, m.zoneIdx !== null ? zoneIds[m.zoneIdx] : null, m.target]);
        meetIds.push(rows[0]?.id ?? "");
      }
      console.log(`  Meets: ${meets.length}`);

      // Form definition
      const { rows: fdR } = await pool.query(`SELECT id FROM form_definitions WHERE campaign_id=$1 AND slug='formulario-principal' LIMIT 1`, [campaignId]);
      const fdId = fdR[0]?.id ?? null;

      // Form submissions — spread across time for charts
      for (const c of contacts) {
        const cid = `seed-${slug}-${c.telefono}`;
        const ca = daysAgo(c.daysBack);
        const d = JSON.stringify({ nombre: c.nombre, telefono: c.telefono, ubicacion: { lat: c.lat, lng: c.lng }, distrito: c.distrito, comentarios: "" });
        await pool.query(
          `INSERT INTO form_submissions (form_definition_id,campaign_id,submitted_by,data,lat,lng,client_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (client_id) DO NOTHING`,
          [fdId, campaignId, teamIds[c.submitterIdx] ?? null, d, c.lat, c.lng, cid, ca]);
      }
      console.log(`  Submissions: ${contacts.length}`);

      // Validations
      for (const v of validations) {
        const c = contacts[v.idx]!;
        const cb = v.claimerIdx !== null ? teamIds[v.claimerIdx] : null;
        await pool.query(
          `INSERT INTO form_validations (form_id,campaign_id,nombre,telefono,encuestador,zona,status,vote_class,claimed_by,form_created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (telefono,campaign_id) DO UPDATE SET status=EXCLUDED.status,vote_class=EXCLUDED.vote_class,claimed_by=EXCLUDED.claimed_by,updated_at=now()`,
          [`seed-${c.telefono}`, campaignId, c.nombre, c.telefono, team[c.submitterIdx]?.full_name ?? "", c.distrito, v.status, v.vote_class, cb, daysAgo(c.daysBack)]);
      }
      console.log(`  Validations: ${validations.length}`);
    }

    /* ═══════════════════════════════════════════════════════════════════
     *  ROSANGELLA BARBARÁN — ~4000 submissions across Peru, 25 team, 15 zones
     *  Flagship demo campaign — impressive nationwide coverage
     * ═══════════════════════════════════════════════════════════════════ */
    const rbTeam: TeamMember[] = [
      // Brigadistas zonales (6 — one per macro-region)
      { email: "carlos.quispe.rb@goberna.pe",   password: "Cq8mT3nP", full_name: "Carlos Quispe",    role: "brigadista_zonal", region: "LIMA",       phone: "912345001" },
      { email: "maria.huaman.rb@goberna.pe",    password: "Mh5kR7wJ", full_name: "Maria Huaman",     role: "brigadista_zonal", region: "CALLAO",     phone: "912345002" },
      { email: "javier.mamani.rb@goberna.pe",   password: "Jm6nT4xQ", full_name: "Javier Mamani",    role: "brigadista_zonal", region: "AREQUIPA",   phone: "912345020" },
      { email: "rosa.ccama.rb@goberna.pe",      password: "Rc3wP8mT", full_name: "Rosa Ccama",       role: "brigadista_zonal", region: "CUSCO",      phone: "912345021" },
      { email: "walter.silva.rb@goberna.pe",    password: "Ws7kR5nJ", full_name: "Walter Silva",     role: "brigadista_zonal", region: "LA LIBERTAD",phone: "912345022" },
      { email: "nelly.paredes.rb@goberna.pe",   password: "Np4tM9xQ", full_name: "Nelly Paredes",    role: "brigadista_zonal", region: "PIURA",      phone: "912345023" },
      // Agentes campo (12 — spread across regions)
      { email: "jose.condori.rb@goberna.pe",    password: "Jc4nL9xQ", full_name: "Jose Condori",     role: "agente_campo",     region: "LIMA",       phone: "912345003" },
      { email: "ana.flores.rb@goberna.pe",      password: "Af6tK2mR", full_name: "Ana Flores",       role: "agente_campo",     region: "LIMA",       phone: "912345004" },
      { email: "luis.mamani.rb@goberna.pe",     password: "Lm3wP8nT", full_name: "Luis Mamani",      role: "agente_campo",     region: "CALLAO",     phone: "912345005" },
      { email: "rosa.torres.rb@goberna.pe",     password: "Rt7kM4xJ", full_name: "Rosa Torres",      role: "agente_campo",     region: "LIMA",       phone: "912345006" },
      { email: "miguel.rojas.rb@goberna.pe",    password: "Mr5nT9wQ", full_name: "Miguel Rojas",     role: "agente_campo",     region: "LIMA",       phone: "912345007" },
      { email: "flor.apaza.rb@goberna.pe",      password: "Fa8mT3kP", full_name: "Flor Apaza",       role: "agente_campo",     region: "AREQUIPA",   phone: "912345024" },
      { email: "edgar.quispe.rb@goberna.pe",    password: "Eq5nR7wJ", full_name: "Edgar Quispe",     role: "agente_campo",     region: "CUSCO",      phone: "912345025" },
      { email: "sonia.cruz.rb@goberna.pe",      password: "Sc6tK4mR", full_name: "Sonia Cruz",       role: "agente_campo",     region: "CUSCO",      phone: "912345026" },
      { email: "marco.leon.rb@goberna.pe",      password: "Ml3wP9nT", full_name: "Marco Leon",       role: "agente_campo",     region: "LA LIBERTAD",phone: "912345027" },
      { email: "gloria.ramos.rb@goberna.pe",    password: "Gr7kM4xJ", full_name: "Gloria Ramos",     role: "agente_campo",     region: "PIURA",      phone: "912345028" },
      { email: "renzo.vargas.rb@goberna.pe",    password: "Rv5nT9wQ", full_name: "Renzo Vargas",     role: "agente_campo",     region: "LAMBAYEQUE", phone: "912345029" },
      { email: "yolanda.taype.rb@goberna.pe",   password: "Yt8mR3kP", full_name: "Yolanda Taype",    role: "agente_campo",     region: "JUNIN",      phone: "912345030" },
      // Agentes digitales (7)
      { email: "carmen.diaz.rb@goberna.pe",     password: "Cd8mR3kP", full_name: "Carmen Diaz",      role: "agente_digital",   region: "LIMA",       phone: "912345008" },
      { email: "pedro.silva.rb@goberna.pe",     password: "Ps6wK7nT", full_name: "Pedro Silva",      role: "agente_digital",   region: "CALLAO",     phone: "912345009" },
      { email: "lucia.vargas.rb@goberna.pe",    password: "Lv4tM2xJ", full_name: "Lucia Vargas",     role: "agente_digital",   region: "LIMA",       phone: "912345010" },
      { email: "daniela.paz.rb@goberna.pe",     password: "Dp7kR5nT", full_name: "Daniela Paz",      role: "agente_digital",   region: "AREQUIPA",   phone: "912345031" },
      { email: "oscar.huanca.rb@goberna.pe",    password: "Oh3tM8xQ", full_name: "Oscar Huanca",     role: "agente_digital",   region: "CUSCO",      phone: "912345032" },
      { email: "natalia.campos.rb@goberna.pe",  password: "Nc6wP4mJ", full_name: "Natalia Campos",   role: "agente_digital",   region: "LA LIBERTAD",phone: "912345033" },
      { email: "ivan.ticona.rb@goberna.pe",     password: "It9kR7nT", full_name: "Ivan Ticona",      role: "agente_digital",   region: "PIURA",      phone: "912345034" },
    ];
    const rbZones: ZoneDef[] = [
      // Lima (5 zones)
      { name: "San Juan de Lurigancho", lat: -11.9692, lng: -76.9983, radius: 2000, color: "#3b82f6", assignIdx: 0 },
      { name: "Villa El Salvador",      lat: -12.2125, lng: -76.9416, radius: 1500, color: "#10b981", assignIdx: 0 },
      { name: "Comas",                  lat: -11.9458, lng: -77.0486, radius: 1800, color: "#f59e0b", assignIdx: 0 },
      { name: "San Martin de Porres",   lat: -12.0084, lng: -77.0561, radius: 1600, color: "#8b5cf6", assignIdx: 0 },
      { name: "Callao Centro",          lat: -12.0565, lng: -77.1186, radius: 1200, color: "#ef4444", assignIdx: 1 },
      // Arequipa (2)
      { name: "Arequipa Cercado",       lat: -16.3989, lng: -71.5370, radius: 2500, color: "#06b6d4", assignIdx: 2 },
      { name: "Cayma",                  lat: -16.3756, lng: -71.5546, radius: 1600, color: "#14b8a6", assignIdx: 2 },
      // Cusco (2)
      { name: "Cusco Centro",           lat: -13.5319, lng: -71.9675, radius: 2000, color: "#f97316", assignIdx: 3 },
      { name: "Wanchaq",                lat: -13.5250, lng: -71.9537, radius: 1400, color: "#a855f7", assignIdx: 3 },
      // La Libertad (2)
      { name: "Trujillo Centro",        lat: -8.1116, lng: -79.0288, radius: 2200, color: "#ec4899", assignIdx: 4 },
      { name: "La Esperanza",           lat: -8.0783, lng: -79.0439, radius: 1800, color: "#84cc16", assignIdx: 4 },
      // Piura (2)
      { name: "Piura Centro",           lat: -5.1945, lng: -80.6328, radius: 2000, color: "#eab308", assignIdx: 5 },
      { name: "Castilla",               lat: -5.1890, lng: -80.6510, radius: 1500, color: "#0ea5e9", assignIdx: 5 },
      // Other (2)
      { name: "Chiclayo Centro",        lat: -6.7714, lng: -79.8409, radius: 2000, color: "#d946ef", assignIdx: 5 },
      { name: "Huancayo Centro",        lat: -12.0651, lng: -75.2049, radius: 1800, color: "#f43f5e", assignIdx: 0 },
    ];
    const rbMeets: MeetDef[] = [
      { title: "Recoleccion SJL Norte",     location: "Parque Zarate",         lat: -11.965,  lng: -76.995,  status: "completed", type: "recoleccion",  daysBack: 12, leaderIdx: 0, zoneIdx: 0,  target: 200 },
      { title: "Recoleccion Comas",         location: "Mercado Unicachi",      lat: -11.940,  lng: -77.050,  status: "completed", type: "recoleccion",  daysBack: 10, leaderIdx: 0, zoneIdx: 2,  target: 150 },
      { title: "Recoleccion VES",           location: "Plaza VES",             lat: -12.210,  lng: -76.940,  status: "completed", type: "recoleccion",  daysBack: 8,  leaderIdx: 0, zoneIdx: 1,  target: 180 },
      { title: "Recoleccion SMP",           location: "Mercado Caqueta",       lat: -12.008,  lng: -77.056,  status: "completed", type: "recoleccion",  daysBack: 7,  leaderIdx: 1, zoneIdx: 3,  target: 160 },
      { title: "Recoleccion Callao",        location: "Plaza Grau Callao",     lat: -12.056,  lng: -77.118,  status: "completed", type: "recoleccion",  daysBack: 6,  leaderIdx: 1, zoneIdx: 4,  target: 120 },
      { title: "Recoleccion Arequipa",      location: "Plaza de Armas AQP",    lat: -16.399,  lng: -71.537,  status: "completed", type: "recoleccion",  daysBack: 5,  leaderIdx: 2, zoneIdx: 5,  target: 200 },
      { title: "Recoleccion Cusco",         location: "Plaza de Armas Cusco",  lat: -13.532,  lng: -71.968,  status: "completed", type: "recoleccion",  daysBack: 4,  leaderIdx: 3, zoneIdx: 7,  target: 180 },
      { title: "Recoleccion Trujillo",      location: "Plaza de Armas Trujillo", lat: -8.112, lng: -79.029,  status: "completed", type: "recoleccion",  daysBack: 3,  leaderIdx: 4, zoneIdx: 9,  target: 160 },
      { title: "Recoleccion Piura",         location: "Plaza de Armas Piura",  lat: -5.195,   lng: -80.633,  status: "completed", type: "recoleccion",  daysBack: 2,  leaderIdx: 5, zoneIdx: 11, target: 140 },
      { title: "Recoleccion Chiclayo",      location: "Parque Principal",      lat: -6.771,   lng: -79.841,  status: "completed", type: "recoleccion",  daysBack: 1,  leaderIdx: 5, zoneIdx: 13, target: 120 },
      { title: "Recoleccion SJL Sur",       location: "Mercado SJL",           lat: -11.972,  lng: -76.996,  status: "active",    type: "recoleccion",  daysBack: 0,  leaderIdx: 0, zoneIdx: 0,  target: 250 },
      { title: "Recoleccion Huancayo",      location: "Plaza Constitucion",    lat: -12.065,  lng: -75.205,  status: "active",    type: "recoleccion",  daysBack: 0,  leaderIdx: 0, zoneIdx: 14, target: 100 },
      { title: "Reunion Nacional",          location: "Oficina Lima",          lat: -12.046,  lng: -77.031,  status: "scheduled", type: "reunion",      daysBack: -2, leaderIdx: 0, zoneIdx: null, target: null },
      { title: "Recoleccion Wanchaq",       location: "Mercado Wanchaq",       lat: -13.525,  lng: -71.954,  status: "scheduled", type: "recoleccion",  daysBack: -3, leaderIdx: 3, zoneIdx: 8,  target: 120 },
    ];

    // ── Generate ~4000 contacts spread across Peru ──────────────────
    const TOTAL_RB = 4000;
    // Peru regions with center coords, weight (how many contacts), and districts
    const peruRegions = [
      { region: "Lima",          distritos: ["SJL","Comas","VES","SMP","Ate","Los Olivos","Puente Piedra","Carabayllo","Lurin","Chorrillos","La Victoria","Rimac","Breña","Independencia","El Agustino"], center: [-12.0464, -77.0428], spread: 0.08, weight: 0.35 },
      { region: "Callao",        distritos: ["Callao","Ventanilla","Bellavista","La Perla","Carmen de la Legua"], center: [-12.0565, -77.1186], spread: 0.03, weight: 0.08 },
      { region: "Arequipa",      distritos: ["Cercado","Cayma","Cerro Colorado","Socabaya","Paucarpata","Jose Luis Bustamante","Miraflores AQP","Mariano Melgar"], center: [-16.3989, -71.537], spread: 0.05, weight: 0.12 },
      { region: "Cusco",         distritos: ["Cusco","Wanchaq","Santiago","San Sebastian","San Jeronimo"], center: [-13.5319, -71.9675], spread: 0.04, weight: 0.10 },
      { region: "La Libertad",   distritos: ["Trujillo","La Esperanza","El Porvenir","Florencia de Mora","Laredo","Victor Larco"], center: [-8.1116, -79.0288], spread: 0.04, weight: 0.10 },
      { region: "Piura",         distritos: ["Piura","Castilla","Catacaos","Sullana","Talara","Paita"], center: [-5.1945, -80.6328], spread: 0.05, weight: 0.08 },
      { region: "Lambayeque",    distritos: ["Chiclayo","Jose Leonardo Ortiz","La Victoria Chiclayo","Lambayeque","Ferreñafe"], center: [-6.7714, -79.8409], spread: 0.04, weight: 0.06 },
      { region: "Junin",         distritos: ["Huancayo","El Tambo","Chilca","Tarma","La Oroya"], center: [-12.0651, -75.2049], spread: 0.04, weight: 0.05 },
      { region: "Ancash",        distritos: ["Huaraz","Independencia Huaraz","Chimbote","Nuevo Chimbote"], center: [-9.5279, -77.5278], spread: 0.04, weight: 0.03 },
      { region: "Loreto",        distritos: ["Iquitos","Punchana","San Juan Bautista","Belen"], center: [-3.7491, -73.2538], spread: 0.03, weight: 0.03 },
    ];

    // Name pools for generation
    const firstNames = ["Juan","Maria","Pedro","Carmen","Roberto","Luisa","Alberto","Sofia","Diego","Patricia","Fernando","Elena","Ricardo","Gladys","Victor","Norma","Raul","Isabel","Cesar","Teresa","Alfredo","Bertha","Hector","Margarita","Oscar","Pilar","Gustavo","Angela","Eduardo","Yolanda","Marco","Silvia","Arturo","Beatriz","Julio","Sandra","Jose","Luz","Rolando","Doris","Carlos","Rosa","Miguel","Ana","Luis","Flor","Edgar","Sonia","Walter","Nelly","Renzo","Gloria","Ivan","Daniela","Natalia","Oscar","Pablo","Monica","Leonardo","Karen","Andres","Claudia","Felipe","Valeria","Sergio","Lorena","Hugo","Catalina","Dante","Priscila","Alexis","Gina","Ronald","Evelyn","Franco","Jimena","Erick","Milagros","Anthony","Lucero","Williams","Deysi"];
    const lastNames = ["Perez","Lopez","Gutierrez","Ruiz","Mendoza","Fernandez","Castillo","Ramirez","Torres","Morales","Chavez","Paredes","Salazar","Espinoza","Herrera","Zarate","Benites","Ponce","Villanueva","Aguilar","Ramos","Soto","Vega","Cruz","Luna","Nuñez","Medina","Rivera","Paz","Castro","Delgado","Ochoa","Figueroa","Campos","Vera","Palacios","Ibarra","Montoya","Acosta","Valdivia","Quispe","Mamani","Condori","Huaman","Flores","Diaz","Rojas","Vargas","Silva","Leon","Pacheco","Navarro","Cordova","Ortiz","Suarez","Tapia","Caceres","Zapata","Pardo","Gallegos","Cano","Romero","Salinas","Mejia","Contreras","Alarcon","Palomino","Yaranga","Olaya","Ccorimanya","Huarcaya","Roque","Ticona","Apaza","Ccama","Taype","Huanca","Pariona","Ordoñez","Santillan"];

    // Deterministic pseudo-random using seed
    let _seed = 42;
    function seededRandom() { _seed = (_seed * 16807 + 0) % 2147483647; return (_seed - 1) / 2147483646; }

    const rbContacts: ContactDef[] = [];
    let contactIdx = 0;
    for (const reg of peruRegions) {
      const count = Math.round(TOTAL_RB * reg.weight);
      for (let j = 0; j < count; j++) {
        const fn = firstNames[Math.floor(seededRandom() * firstNames.length)]!;
        const ln = lastNames[Math.floor(seededRandom() * lastNames.length)]!;
        const di = reg.distritos[Math.floor(seededRandom() * reg.distritos.length)]!;
        const lat = reg.center[0]! + (seededRandom() - 0.5) * reg.spread * 2;
        const lng = reg.center[1]! + (seededRandom() - 0.5) * reg.spread * 2;
        // Spread submissions across 14 days with heavier weight on recent days
        const r = seededRandom();
        const db = r < 0.20 ? 0 : r < 0.35 ? 1 : r < 0.50 ? 2 : r < 0.62 ? 3 : r < 0.72 ? 4 : r < 0.80 ? 5 : r < 0.86 ? 6 : r < 0.90 ? 7 : r < 0.93 ? 8 : r < 0.95 ? 9 : r < 0.97 ? 10 : r < 0.98 ? 11 : r < 0.99 ? 12 : 13;
        // submitterIdx: campo agents are indices 6-17 in rbTeam
        rbContacts.push({ nombre: `${fn} ${ln}`, telefono: `9${String(100000 + contactIdx).padStart(8,"0")}`, distrito: di, lat, lng, submitterIdx: 6 + (contactIdx % 12), daysBack: db });
        contactIdx++;
      }
    }
    console.log(`  Generated ${rbContacts.length} contacts for Rosangella across ${peruRegions.length} regions`);

    // Validation distribution: ~30% pendiente, ~15% contactado, ~40% respondido, ~15% invalido
    const rbVals: ValDef[] = [];
    for (let i = 0; i < rbContacts.length; i++) {
      const r = seededRandom();
      if (r < 0.30) rbVals.push({ idx: i, status: "pendiente", vote_class: "", claimerIdx: null });
      else if (r < 0.45) rbVals.push({ idx: i, status: "contactado", vote_class: "", claimerIdx: 18 + (i % 7) }); // digital agents 18-24
      else if (r < 0.85) {
        const vc = seededRandom() < 0.45 ? "duro" : seededRandom() < 0.65 ? "blando" : "flotante";
        rbVals.push({ idx: i, status: "respondido", vote_class: vc, claimerIdx: 18 + (i % 7) });
      }
      else rbVals.push({ idx: i, status: "invalido", vote_class: "", claimerIdx: 18 + (i % 7) });
    }
    if (campaignIds["rosangella-barbaran"]) {
      await seedCampaignData(campaignIds["rosangella-barbaran"]!, "rosangella-barbaran", "Rosangella Barbarán", rbTeam, rbZones, rbMeets, rbContacts, rbVals);
    }

    /* ═══════════════════════════════════════════════════════════════════
     *  ERNESTO BUSTAMANTE — 80 submissions, 15 team, 6 zones
     *  Campaña más grande, más avanzada (impresiona con progress bars)
     * ═══════════════════════════════════════════════════════════════════ */
    const ebTeam: TeamMember[] = [
      { email: "raul.pacheco@goberna.pe",     password: "Rp7kW3mT", full_name: "Raul Pacheco",      role: "brigadista_zonal", region: "LIMA",       phone: "913001001" },
      { email: "diana.leon@goberna.pe",       password: "Dl5nT8xQ", full_name: "Diana Leon",        role: "brigadista_zonal", region: "LIMA",       phone: "913001002" },
      { email: "jorge.paredes@goberna.pe",    password: "Jp4mR6wK", full_name: "Jorge Paredes",     role: "brigadista_zonal", region: "AREQUIPA",   phone: "913001003" },
      { email: "gabriela.castro@goberna.pe",  password: "Gc9kT2nP", full_name: "Gabriela Castro",   role: "agente_campo",     region: "LIMA",       phone: "913001004" },
      { email: "andres.vega@goberna.pe",      password: "Av3wM7xJ", full_name: "Andres Vega",       role: "agente_campo",     region: "LIMA",       phone: "913001005" },
      { email: "claudia.rios@goberna.pe",     password: "Cr6nP4mT", full_name: "Claudia Rios",      role: "agente_campo",     region: "LIMA",       phone: "913001006" },
      { email: "marco.suarez@goberna.pe",     password: "Ms8kT5wQ", full_name: "Marco Suarez",      role: "agente_campo",     region: "AREQUIPA",   phone: "913001007" },
      { email: "valeria.mendez@goberna.pe",   password: "Vm4nR9xK", full_name: "Valeria Mendez",    role: "agente_campo",     region: "LIMA",       phone: "913001008" },
      { email: "felipe.herrera@goberna.pe",   password: "Fh7mT3wP", full_name: "Felipe Herrera",    role: "agente_campo",     region: "LIMA",       phone: "913001009" },
      { email: "natalia.ortiz@goberna.pe",    password: "No5kR8nJ", full_name: "Natalia Ortiz",     role: "agente_campo",     region: "AREQUIPA",   phone: "913001010" },
      { email: "roberto.luna@goberna.pe",     password: "Rl6wT4mQ", full_name: "Roberto Luna",      role: "agente_campo",     region: "LIMA",       phone: "913001011" },
      { email: "karen.figueroa@goberna.pe",   password: "Kf3nP7xT", full_name: "Karen Figueroa",    role: "agente_digital",   region: "LIMA",       phone: "913001012" },
      { email: "oscar.navarro@goberna.pe",    password: "On8mR5wK", full_name: "Oscar Navarro",     role: "agente_digital",   region: "LIMA",       phone: "913001013" },
      { email: "pamela.quiroz@goberna.pe",    password: "Pq4kT9nJ", full_name: "Pamela Quiroz",     role: "agente_digital",   region: "AREQUIPA",   phone: "913001014" },
      { email: "ivan.cordova@goberna.pe",     password: "Ic7wR3mP", full_name: "Ivan Cordova",      role: "agente_digital",   region: "LIMA",       phone: "913001015" },
    ];
    const ebZones: ZoneDef[] = [
      { name: "Miraflores",       lat: -12.1175, lng: -77.0468, radius: 1500, color: "#3b82f6", assignIdx: 0 },
      { name: "San Isidro",       lat: -12.0977, lng: -77.0365, radius: 1200, color: "#10b981", assignIdx: 0 },
      { name: "Surco",            lat: -12.1466, lng: -76.9917, radius: 2000, color: "#f59e0b", assignIdx: 1 },
      { name: "La Molina",        lat: -12.0833, lng: -76.9353, radius: 1800, color: "#8b5cf6", assignIdx: 1 },
      { name: "Arequipa Centro",  lat: -16.3989, lng: -71.5370, radius: 2500, color: "#ef4444", assignIdx: 2 },
      { name: "Cayma",            lat: -16.3756, lng: -71.5546, radius: 1600, color: "#06b6d4", assignIdx: 2 },
    ];
    const ebMeets: MeetDef[] = [
      { title: "Recoleccion Miraflores",     location: "Parque Kennedy",       lat: -12.1195, lng: -77.0297, status: "completed", type: "recoleccion",  daysBack: 6, leaderIdx: 0, zoneIdx: 0, target: 30 },
      { title: "Recoleccion San Isidro",     location: "Parque El Olivar",     lat: -12.0970, lng: -77.0364, status: "completed", type: "recoleccion",  daysBack: 4, leaderIdx: 0, zoneIdx: 1, target: 25 },
      { title: "Recoleccion Surco",          location: "Jockey Plaza",         lat: -12.1085, lng: -76.9767, status: "completed", type: "recoleccion",  daysBack: 3, leaderIdx: 1, zoneIdx: 2, target: 35 },
      { title: "Recoleccion Arequipa",       location: "Plaza de Armas",       lat: -16.3989, lng: -71.5370, status: "completed", type: "recoleccion",  daysBack: 2, leaderIdx: 2, zoneIdx: 4, target: 20 },
      { title: "Recoleccion La Molina",      location: "Plaza Camacho",        lat: -12.0831, lng: -76.9570, status: "active",    type: "recoleccion",  daysBack: 0, leaderIdx: 1, zoneIdx: 3, target: 40 },
      { title: "Capacitacion Digital",       location: "Oficina Miraflores",   lat: -12.1188, lng: -77.0380, status: "completed", type: "capacitacion", daysBack: 5, leaderIdx: 0, zoneIdx: null, target: null },
      { title: "Recoleccion Cayma",          location: "Mall Aventura AQP",    lat: -16.3756, lng: -71.5546, status: "scheduled", type: "recoleccion",  daysBack: -3, leaderIdx: 2, zoneIdx: 5, target: 30 },
    ];
    // 80 contacts across Lima (Miraflores,San Isidro,Surco,La Molina) + Arequipa
    const ebDistritos = ["Miraflores","San Isidro","Surco","La Molina","Arequipa","Cayma"];
    const ebCenters = [[-12.1175,-77.0468],[-12.0977,-77.0365],[-12.1466,-76.9917],[-12.0833,-76.9353],[-16.3989,-71.537],[-16.3756,-71.5546]];
    const ebNames = ["Adrian Solis","Beatriz Luna","Carlos Montoya","Daniela Reyes","Eduardo Pinto","Fabiola Ramos","Gonzalo Ruiz","Helena Vargas","Ignacio Campos","Julia Medina","Kevin Ochoa","Laura Paz","Manuel Delgado","Nadia Herrera","Omar Figueroa","Paula Castillo","Rodrigo Vega","Sandra Navarro","Tomas Espinoza","Ursula Cordova","Vicente Aguilar","Wendy Salazar","Xavier Torres","Yolanda Paredes","Zacarias Morales","Alicia Gutierrez","Benjamin Flores","Carolina Diaz","Diego Mendoza","Elena Quispe","Francisco Mamani","Gisela Condori","Hugo Fernandez","Irene Chavez","Jaime Ramirez","Karina Lopez","Leonardo Perez","Monica Garcia","Nicolas Huaman","Olga Villanueva","Pablo Benites","Quena Ponce","Ricardo Acosta","Sofia Valdivia","Teodoro Ibarra","Uriel Montoya","Victoria Ochoa","Walter Nuñez","Ximena Rivera","Yuri Palacios","Adriana Castro","Bruno Vera","Cecilia Cruz","Dante Zarate","Estela Ramos","Fabio Soto","Graciela Luna","Humberto Medina","Irma Delgado","Julian Figueroa","Karla Herrera","Luis Castillo","Milagros Vega","Norberto Navarro","Olinda Espinoza","Percy Cordova","Rosa Aguilar","Samuel Salazar","Tatiana Torres","Ulises Paredes","Violeta Morales","Wilson Gutierrez","Yesenia Flores","Alfredo Diaz","Brenda Mendoza","Cristian Quispe","Dalila Mamani","Emilio Condori","Flor Fernandez","Gloria Rojas"];
    const ebContacts: ContactDef[] = [];
    for (let i = 0; i < 80; i++) {
      const di = i % 6;
      // Spread: 15 today, 15 yesterday, 15 day3, 15 day4, 10 day5, 10 day6
      const db = i < 15 ? 0 : i < 30 ? 1 : i < 45 ? 3 : i < 60 ? 4 : i < 70 ? 5 : 6;
      ebContacts.push({ nombre: ebNames[i]!, telefono: `976001${String(i+1).padStart(3,"0")}`, distrito: ebDistritos[di]!, lat: ebCenters[di]![0]! + (Math.random()-0.5)*0.012, lng: ebCenters[di]![1]! + (Math.random()-0.5)*0.012, submitterIdx: 3 + (i % 8), daysBack: db });
    }
    // 80 validations: 20 pendiente, 15 contactado, 35 respondido, 10 invalido
    const ebVals: ValDef[] = [];
    for (let i = 0; i < 80; i++) {
      if (i < 20) ebVals.push({ idx: i, status: "pendiente", vote_class: "", claimerIdx: null });
      else if (i < 35) ebVals.push({ idx: i, status: "contactado", vote_class: "", claimerIdx: 11 + (i % 4) });
      else if (i < 70) { const vc = ["duro","duro","blando","duro","flotante","duro","blando","duro","duro","flotante","blando","duro","duro","blando","flotante","duro","blando","duro","flotante","duro","duro","blando","duro","flotante","duro","duro","blando","duro","flotante","duro","blando","duro","duro","flotante","duro"][i-35]!; ebVals.push({ idx: i, status: "respondido", vote_class: vc, claimerIdx: 11 + (i % 4) }); }
      else ebVals.push({ idx: i, status: "invalido", vote_class: "", claimerIdx: 11 + (i % 4) });
    }
    if (campaignIds["ernesto-bustamante"]) {
      await seedCampaignData(campaignIds["ernesto-bustamante"]!, "ernesto-bustamante", "Ernesto Bustamante", ebTeam, ebZones, ebMeets, ebContacts, ebVals);
    }

    /* ═══════════════════════════════════════════════════════════════════
     *  FERNANDO ROSPIGLIOSI — 60 submissions, 12 team, 5 zones
     *  Enfocado en Lima Norte — perfil diferenciado
     * ═══════════════════════════════════════════════════════════════════ */
    const frTeam: TeamMember[] = [
      { email: "sergio.tapia@goberna.pe",     password: "St7kW4mT", full_name: "Sergio Tapia",      role: "brigadista_zonal", region: "LIMA",   phone: "914001001" },
      { email: "lorena.caceres@goberna.pe",   password: "Lc5nT9xQ", full_name: "Lorena Caceres",    role: "brigadista_zonal", region: "LIMA",   phone: "914001002" },
      { email: "hugo.zapata@goberna.pe",      password: "Hz4mR7wK", full_name: "Hugo Zapata",       role: "agente_campo",     region: "LIMA",   phone: "914001003" },
      { email: "catalina.vera@goberna.pe",    password: "Cv9kT3nP", full_name: "Catalina Vera",     role: "agente_campo",     region: "LIMA",   phone: "914001004" },
      { email: "renzo.pardo@goberna.pe",      password: "Rp3wM8xJ", full_name: "Renzo Pardo",       role: "agente_campo",     region: "LIMA",   phone: "914001005" },
      { email: "marisol.acuña@goberna.pe",    password: "Ma6nP5mT", full_name: "Marisol Acuña",     role: "agente_campo",     region: "LIMA",   phone: "914001006" },
      { email: "dante.gallegos@goberna.pe",   password: "Dg8kT6wQ", full_name: "Dante Gallegos",    role: "agente_campo",     region: "LIMA",   phone: "914001007" },
      { email: "priscila.cano@goberna.pe",    password: "Pc4nR2xK", full_name: "Priscila Cano",     role: "agente_campo",     region: "LIMA",   phone: "914001008" },
      { email: "alexis.romero@goberna.pe",    password: "Ar7mT4wP", full_name: "Alexis Romero",     role: "agente_campo",     region: "LIMA",   phone: "914001009" },
      { email: "gina.salinas@goberna.pe",     password: "Gs5kR9nJ", full_name: "Gina Salinas",      role: "agente_digital",   region: "LIMA",   phone: "914001010" },
      { email: "ronald.mejia@goberna.pe",     password: "Rm6wT5mQ", full_name: "Ronald Mejia",      role: "agente_digital",   region: "LIMA",   phone: "914001011" },
      { email: "evelyn.contreras@goberna.pe", password: "Ec3nP8xT", full_name: "Evelyn Contreras",  role: "agente_digital",   region: "LIMA",   phone: "914001012" },
    ];
    const frZones: ZoneDef[] = [
      { name: "Los Olivos",          lat: -11.9550, lng: -77.0717, radius: 1800, color: "#3b82f6", assignIdx: 0 },
      { name: "Independencia",       lat: -11.9862, lng: -77.0503, radius: 1500, color: "#10b981", assignIdx: 0 },
      { name: "Puente Piedra",       lat: -11.8623, lng: -77.0742, radius: 2200, color: "#f59e0b", assignIdx: 1 },
      { name: "Carabayllo",          lat: -11.8541, lng: -77.0341, radius: 2000, color: "#ef4444", assignIdx: 1 },
      { name: "Rimac",               lat: -12.0221, lng: -77.0327, radius: 1200, color: "#8b5cf6", assignIdx: 0 },
    ];
    const frMeets: MeetDef[] = [
      { title: "Recoleccion Los Olivos",    location: "Metro Los Olivos",     lat: -11.9550, lng: -77.0717, status: "completed", type: "recoleccion",  daysBack: 5, leaderIdx: 0, zoneIdx: 0, target: 30 },
      { title: "Recoleccion Independencia", location: "Plaza Norte",          lat: -11.9862, lng: -77.0503, status: "completed", type: "recoleccion",  daysBack: 3, leaderIdx: 0, zoneIdx: 1, target: 25 },
      { title: "Recoleccion Puente Piedra", location: "Mercado Huamantanga",  lat: -11.8623, lng: -77.0742, status: "completed", type: "recoleccion",  daysBack: 1, leaderIdx: 1, zoneIdx: 2, target: 35 },
      { title: "Recoleccion Rimac",         location: "Alameda de los Descalzos", lat: -12.0221, lng: -77.0327, status: "active", type: "recoleccion", daysBack: 0, leaderIdx: 0, zoneIdx: 4, target: 25 },
      { title: "Recoleccion Carabayllo",    location: "Plaza Carabayllo",     lat: -11.8541, lng: -77.0341, status: "scheduled", type: "recoleccion",  daysBack: -2, leaderIdx: 1, zoneIdx: 3, target: 30 },
    ];
    const frDistritos = ["Los Olivos","Independencia","Puente Piedra","Carabayllo","Rimac"];
    const frCenters = [[-11.955,-77.0717],[-11.9862,-77.0503],[-11.8623,-77.0742],[-11.8541,-77.0341],[-12.0221,-77.0327]];
    const frNames = ["Abel Quispe","Blanca Huaman","Cesar Mamani","Delia Condori","Efrain Flores","Fiorella Diaz","German Mendoza","Haydee Torres","Ivan Morales","Janet Chavez","Kevin Silva","Lourdes Ramirez","Martin Lopez","Nelly Garcia","Orlando Perez","Pilar Gutierrez","Quique Fernandez","Rosario Castillo","Saul Vargas","Teresa Ramos","Ubaldo Paredes","Vilma Salazar","Wilson Espinoza","Ximena Herrera","Yuri Figueroa","Zoila Nuñez","Aldo Rivera","Berta Paz","Claudio Castro","Dora Soto","Emilio Vega","Flor Luna","Gerardo Medina","Hilda Delgado","Isidro Ochoa","Juana Montoya","Klaus Navarro","Lilia Cordova","Miguel Aguilar","Nancy Valdivia","Osvaldo Ibarra","Penelope Ponce","Ramon Acosta","Sonia Palacios","Tomas Vera","Ursula Cruz","Victor Zarate","Wanda Benites","Xavier Ramos","Yesenia Solis","Abel Torres","Bianca Flores","Celso Diaz","Diana Mendoza","Enrique Quispe","Fanny Mamani","Guillermo Condori","Helena Fernandez","Ismael Chavez","Josefina Ramirez"];
    const frContacts: ContactDef[] = [];
    for (let i = 0; i < 60; i++) {
      const di = i % 5;
      const db = i < 12 ? 0 : i < 24 ? 1 : i < 36 ? 3 : i < 48 ? 5 : 6;
      frContacts.push({ nombre: frNames[i]!, telefono: `965001${String(i+1).padStart(3,"0")}`, distrito: frDistritos[di]!, lat: frCenters[di]![0]! + (Math.random()-0.5)*0.01, lng: frCenters[di]![1]! + (Math.random()-0.5)*0.01, submitterIdx: 2 + (i % 7), daysBack: db });
    }
    // 60 validations: 15 pendiente, 12 contactado, 25 respondido, 8 invalido
    const frVals: ValDef[] = [];
    for (let i = 0; i < 60; i++) {
      if (i < 15) frVals.push({ idx: i, status: "pendiente", vote_class: "", claimerIdx: null });
      else if (i < 27) frVals.push({ idx: i, status: "contactado", vote_class: "", claimerIdx: 9 + (i % 3) });
      else if (i < 52) { const vc = ["duro","blando","duro","flotante","duro","duro","blando","duro","flotante","duro","blando","duro","duro","flotante","blando","duro","duro","blando","flotante","duro","duro","blando","duro","flotante","duro"][i-27]!; frVals.push({ idx: i, status: "respondido", vote_class: vc, claimerIdx: 9 + (i % 3) }); }
      else frVals.push({ idx: i, status: "invalido", vote_class: "", claimerIdx: 9 + (i % 3) });
    }
    if (campaignIds["fernando-rospigliosi"]) {
      await seedCampaignData(campaignIds["fernando-rospigliosi"]!, "fernando-rospigliosi", "Fernando Rospigliosi", frTeam, frZones, frMeets, frContacts, frVals);
    }

    /* ═══════════════════════════════════════════════════════════════════
     *  FUERZA POPULAR — ~4000 submissions, Lima only
     *  Partido-level campaign — focused on Lima Metropolitana + Callao
     * ═══════════════════════════════════════════════════════════════════ */

    // Clean old FP seeded data first (zones/meets use ON CONFLICT DO NOTHING so old ones linger)
    if (campaignIds["fuerza-popular"]) {
      const fpCid = campaignIds["fuerza-popular"]!;
      await pool.query(`DELETE FROM form_validations WHERE campaign_id = $1`, [fpCid]);
      await pool.query(`DELETE FROM form_submissions WHERE campaign_id = $1 AND client_id LIKE 'seed-%'`, [fpCid]);
      await pool.query(`DELETE FROM meets WHERE campaign_id = $1`, [fpCid]);
      await pool.query(`DELETE FROM zones WHERE campaign_id = $1`, [fpCid]);
      console.log(`\n  Cleaned old FP seeded data`);
    }

    const fpTeam: TeamMember[] = [
      // Brigadistas zonales (4 — Lima zones)
      { email: "raul.ticona.fp@goberna.pe",      password: "Rt8mW3nP", full_name: "Raul Ticona",       role: "brigadista_zonal", region: "LIMA",   phone: "915001001" },
      { email: "martha.gallegos.fp@goberna.pe",  password: "Mg5kT7xQ", full_name: "Martha Gallegos",   role: "brigadista_zonal", region: "LIMA",   phone: "915001002" },
      { email: "julio.huanca.fp@goberna.pe",     password: "Jh4nR9wK", full_name: "Julio Huanca",      role: "brigadista_zonal", region: "LIMA",   phone: "915001003" },
      { email: "carmen.choque.fp@goberna.pe",    password: "Cc9kM2nP", full_name: "Carmen Choque",     role: "brigadista_zonal", region: "CALLAO", phone: "915001004" },
      // Agentes campo (12 — all Lima/Callao)
      { email: "patricia.roque.fp@goberna.pe",   password: "Pr6nP4mT", full_name: "Patricia Roque",    role: "agente_campo",     region: "LIMA",   phone: "915001006" },
      { email: "enrique.cusi.fp@goberna.pe",     password: "Ec8kT5wQ", full_name: "Enrique Cusi",      role: "agente_campo",     region: "LIMA",   phone: "915001007" },
      { email: "gladys.apaza.fp@goberna.pe",     password: "Ga4nR9xK", full_name: "Gladys Apaza",      role: "agente_campo",     region: "LIMA",   phone: "915001008" },
      { email: "victor.ccama.fp@goberna.pe",     password: "Vc7mT3wP", full_name: "Victor Ccama",      role: "agente_campo",     region: "CALLAO", phone: "915001009" },
      { email: "yolanda.suca.fp@goberna.pe",     password: "Ys5kR8nJ", full_name: "Yolanda Suca",      role: "agente_campo",     region: "LIMA",   phone: "915001010" },
      { email: "cesar.colque.fp@goberna.pe",     password: "Cc6wT4mQ", full_name: "Cesar Colque",      role: "agente_campo",     region: "LIMA",   phone: "915001011" },
      { email: "nilda.huaman.fp@goberna.pe",     password: "Nh3nP7xT", full_name: "Nilda Huaman",      role: "agente_campo",     region: "LIMA",   phone: "915001012" },
      { email: "felix.condori.fp@goberna.pe",    password: "Fc8mR5wK", full_name: "Felix Condori",     role: "agente_campo",     region: "LIMA",   phone: "915001013" },
      { email: "rosa.quispe.fp@goberna.pe",      password: "Rq4kT9nJ", full_name: "Rosa Quispe",       role: "agente_campo",     region: "LIMA",   phone: "915001014" },
      { email: "manuel.taype.fp@goberna.pe",     password: "Mt7wR3mP", full_name: "Manuel Taype",      role: "agente_campo",     region: "LIMA",   phone: "915001015" },
      { email: "sandro.puma.fp@goberna.pe",      password: "Sp4nR8xK", full_name: "Sandro Puma",       role: "agente_campo",     region: "CALLAO", phone: "915001021" },
      { email: "maribel.inca.fp@goberna.pe",     password: "Mi7mT3wP", full_name: "Maribel Inca",      role: "agente_campo",     region: "LIMA",   phone: "915001022" },
      // Agentes digitales (4 — all Lima)
      { email: "lorena.sulla.fp@goberna.pe",     password: "Ls6nT4xQ", full_name: "Lorena Sulla",      role: "agente_digital",   region: "LIMA",   phone: "915001016" },
      { email: "ricardo.mamani.fp@goberna.pe",   password: "Rm8kW5mT", full_name: "Ricardo Mamani",    role: "agente_digital",   region: "LIMA",   phone: "915001017" },
      { email: "silvia.flores.fp@goberna.pe",    password: "Sf3nR7xJ", full_name: "Silvia Flores",     role: "agente_digital",   region: "LIMA",   phone: "915001018" },
      { email: "edgar.vargas.fp@goberna.pe",     password: "Ev9mT2wP", full_name: "Edgar Vargas",      role: "agente_digital",   region: "LIMA",   phone: "915001019" },
    ];
    const fpZones: ZoneDef[] = [
      // Lima Norte (3)
      { name: "Los Olivos",             lat: -11.9550, lng: -77.0717, radius: 1800, color: "#1e3a5f", assignIdx: 0 },
      { name: "Comas",                  lat: -11.9458, lng: -77.0486, radius: 2000, color: "#2563eb", assignIdx: 0 },
      { name: "Independencia",          lat: -11.9862, lng: -77.0503, radius: 1500, color: "#3b82f6", assignIdx: 0 },
      // Lima Centro (3)
      { name: "Lima Cercado",           lat: -12.0464, lng: -77.0428, radius: 1500, color: "#dc2626", assignIdx: 1 },
      { name: "La Victoria",            lat: -12.0730, lng: -77.0200, radius: 1200, color: "#ef4444", assignIdx: 1 },
      { name: "Rimac",                  lat: -12.0221, lng: -77.0327, radius: 1200, color: "#f97316", assignIdx: 1 },
      // Lima Este (3)
      { name: "San Juan de Lurigancho", lat: -11.9692, lng: -76.9983, radius: 2500, color: "#f59e0b", assignIdx: 2 },
      { name: "Ate Vitarte",            lat: -12.0268, lng: -76.9186, radius: 2000, color: "#eab308", assignIdx: 2 },
      { name: "El Agustino",            lat: -12.0440, lng: -76.9930, radius: 1200, color: "#fbbf24", assignIdx: 2 },
      // Lima Sur (3)
      { name: "Villa El Salvador",      lat: -12.2125, lng: -76.9416, radius: 2000, color: "#10b981", assignIdx: 2 },
      { name: "San Juan de Miraflores", lat: -12.1625, lng: -76.9716, radius: 1500, color: "#34d399", assignIdx: 2 },
      { name: "Villa Maria del Triunfo",lat: -12.1667, lng: -76.9420, radius: 1800, color: "#6ee7b7", assignIdx: 2 },
      // Callao (2)
      { name: "Callao Centro",          lat: -12.0565, lng: -77.1186, radius: 1500, color: "#8b5cf6", assignIdx: 3 },
      { name: "Ventanilla",             lat: -11.8718, lng: -77.1282, radius: 2000, color: "#a855f7", assignIdx: 3 },
    ];
    const fpMeets: MeetDef[] = [
      { title: "Recoleccion SJL Masiva",    location: "Mercado Canto Grande",    lat: -11.969, lng: -76.998, status: "completed", type: "recoleccion",  daysBack: 12, leaderIdx: 2, zoneIdx: 6,  target: 300 },
      { title: "Recoleccion Comas",         location: "Mercado Unicachi",        lat: -11.940, lng: -77.050, status: "completed", type: "recoleccion",  daysBack: 10, leaderIdx: 0, zoneIdx: 1,  target: 250 },
      { title: "Recoleccion Los Olivos",    location: "Metro Los Olivos",        lat: -11.955, lng: -77.072, status: "completed", type: "recoleccion",  daysBack: 9,  leaderIdx: 0, zoneIdx: 0,  target: 200 },
      { title: "Recoleccion VES",           location: "Plaza VES",               lat: -12.213, lng: -76.941, status: "completed", type: "recoleccion",  daysBack: 7,  leaderIdx: 2, zoneIdx: 9,  target: 280 },
      { title: "Recoleccion Lima Centro",   location: "Plaza San Martin",        lat: -12.051, lng: -77.035, status: "completed", type: "recoleccion",  daysBack: 6,  leaderIdx: 1, zoneIdx: 3,  target: 200 },
      { title: "Recoleccion Ate",           location: "Mall Santa Anita",        lat: -12.043, lng: -76.971, status: "completed", type: "recoleccion",  daysBack: 5,  leaderIdx: 2, zoneIdx: 7,  target: 220 },
      { title: "Recoleccion La Victoria",   location: "Gamarra",                 lat: -12.070, lng: -77.017, status: "completed", type: "recoleccion",  daysBack: 4,  leaderIdx: 1, zoneIdx: 4,  target: 180 },
      { title: "Recoleccion Callao",        location: "Plaza Grau Callao",       lat: -12.056, lng: -77.118, status: "completed", type: "recoleccion",  daysBack: 3,  leaderIdx: 3, zoneIdx: 12, target: 150 },
      { title: "Recoleccion VMT",           location: "Mercado Nueva Esperanza", lat: -12.167, lng: -76.942, status: "completed", type: "recoleccion",  daysBack: 2,  leaderIdx: 2, zoneIdx: 11, target: 200 },
      { title: "Recoleccion Independencia", location: "Plaza Norte",             lat: -11.986, lng: -77.050, status: "completed", type: "recoleccion",  daysBack: 1,  leaderIdx: 0, zoneIdx: 2,  target: 250 },
      { title: "Recoleccion SJM",           location: "Mercado Ciudad de Dios",  lat: -12.163, lng: -76.972, status: "active",    type: "recoleccion",  daysBack: 0,  leaderIdx: 2, zoneIdx: 10, target: 300 },
      { title: "Recoleccion SJL Hoy",       location: "Parque Zarate",           lat: -11.965, lng: -76.995, status: "active",    type: "recoleccion",  daysBack: 0,  leaderIdx: 2, zoneIdx: 6,  target: 300 },
      { title: "Capacitacion Operativa",    location: "Sede Central FP Lima",    lat: -12.090, lng: -77.020, status: "completed", type: "capacitacion", daysBack: 8,  leaderIdx: 0, zoneIdx: null, target: null },
      { title: "Recoleccion Ventanilla",    location: "Mercado Ventanilla",      lat: -11.872, lng: -77.128, status: "scheduled", type: "recoleccion",  daysBack: -2, leaderIdx: 3, zoneIdx: 13, target: 200 },
      { title: "Recoleccion Rimac",         location: "Alameda de los Descalzos",lat: -12.022, lng: -77.033, status: "scheduled", type: "recoleccion",  daysBack: -3, leaderIdx: 1, zoneIdx: 5,  target: 150 },
    ];

    // ── Generate ~4000 contacts — Lima Metropolitana + Callao only ──
    const TOTAL_FP = 4000;
    const fpDistritos = [
      // Lima Norte (~25%)
      { name: "San Juan de Lurigancho", center: [-11.9692, -76.9983], spread: 0.025, weight: 0.14 },
      { name: "Comas",                  center: [-11.9458, -77.0486], spread: 0.018, weight: 0.07 },
      { name: "Los Olivos",             center: [-11.9550, -77.0717], spread: 0.015, weight: 0.06 },
      { name: "Independencia",          center: [-11.9862, -77.0503], spread: 0.012, weight: 0.04 },
      { name: "Carabayllo",             center: [-11.8541, -77.0341], spread: 0.020, weight: 0.03 },
      { name: "Puente Piedra",          center: [-11.8623, -77.0742], spread: 0.018, weight: 0.03 },
      { name: "San Martin de Porres",   center: [-12.0084, -77.0561], spread: 0.015, weight: 0.05 },
      // Lima Centro (~12%)
      { name: "Lima Cercado",           center: [-12.0464, -77.0428], spread: 0.010, weight: 0.04 },
      { name: "La Victoria",            center: [-12.0730, -77.0200], spread: 0.010, weight: 0.04 },
      { name: "Rimac",                  center: [-12.0221, -77.0327], spread: 0.008, weight: 0.02 },
      { name: "Breña",                  center: [-12.0586, -77.0535], spread: 0.006, weight: 0.02 },
      // Lima Este (~18%)
      { name: "Ate Vitarte",            center: [-12.0268, -76.9186], spread: 0.020, weight: 0.06 },
      { name: "El Agustino",            center: [-12.0440, -76.9930], spread: 0.010, weight: 0.03 },
      { name: "Santa Anita",            center: [-12.0430, -76.9710], spread: 0.010, weight: 0.03 },
      { name: "Lurigancho-Chosica",     center: [-11.9540, -76.7050], spread: 0.025, weight: 0.03 },
      { name: "Chaclacayo",             center: [-11.9730, -76.7680], spread: 0.010, weight: 0.02 },
      { name: "La Molina",              center: [-12.0833, -76.9353], spread: 0.015, weight: 0.01 },
      // Lima Sur (~22%)
      { name: "Villa El Salvador",      center: [-12.2125, -76.9416], spread: 0.018, weight: 0.07 },
      { name: "San Juan de Miraflores", center: [-12.1625, -76.9716], spread: 0.015, weight: 0.05 },
      { name: "Villa Maria del Triunfo",center: [-12.1667, -76.9420], spread: 0.018, weight: 0.05 },
      { name: "Chorrillos",             center: [-12.1716, -77.0152], spread: 0.015, weight: 0.03 },
      { name: "Lurin",                  center: [-12.2790, -76.8690], spread: 0.015, weight: 0.02 },
      // Callao (~10%)
      { name: "Callao",                 center: [-12.0565, -77.1186], spread: 0.012, weight: 0.04 },
      { name: "Ventanilla",             center: [-11.8718, -77.1282], spread: 0.018, weight: 0.03 },
      { name: "Bellavista",             center: [-12.0600, -77.0700], spread: 0.008, weight: 0.02 },
      { name: "Carmen de la Legua",     center: [-12.0450, -77.0950], spread: 0.006, weight: 0.01 },
    ];

    const fpFirstNames = ["Juan","Maria","Pedro","Carmen","Roberto","Luisa","Alberto","Sofia","Diego","Patricia","Fernando","Elena","Ricardo","Gladys","Victor","Norma","Raul","Isabel","Cesar","Teresa","Alfredo","Bertha","Hector","Margarita","Oscar","Pilar","Gustavo","Angela","Eduardo","Yolanda","Marco","Silvia","Arturo","Beatriz","Julio","Sandra","Jose","Luz","Carlos","Rosa","Miguel","Ana","Luis","Flor","Edgar","Sonia","Walter","Nelly","Renzo","Gloria","Ivan","Daniela","Natalia","Pablo","Monica","Leonardo","Karen","Andres","Claudia","Felipe","Valeria","Sergio","Lorena","Hugo","Catalina","Dante","Priscila","Alexis","Gina","Ronald","Evelyn","Franco","Jimena","Erick","Milagros","Anthony","Lucero","Williams","Deysi","Rolando","Doris"];
    const fpLastNames = ["Perez","Lopez","Gutierrez","Ruiz","Mendoza","Fernandez","Castillo","Ramirez","Torres","Morales","Chavez","Paredes","Salazar","Espinoza","Herrera","Zarate","Benites","Ponce","Villanueva","Aguilar","Ramos","Soto","Vega","Cruz","Luna","Nuñez","Medina","Rivera","Paz","Castro","Delgado","Ochoa","Figueroa","Campos","Vera","Palacios","Ibarra","Montoya","Acosta","Valdivia","Quispe","Mamani","Condori","Huaman","Flores","Diaz","Rojas","Vargas","Silva","Leon","Pacheco","Navarro","Cordova","Ortiz","Suarez","Tapia","Caceres","Zapata","Pardo","Gallegos","Cano","Romero","Salinas","Mejia","Contreras","Alarcon","Palomino","Yaranga","Olaya","Ccorimanya","Huarcaya","Roque","Ticona","Apaza","Ccama","Taype","Huanca","Pariona","Ordoñez","Santillan"];

    let _seedFP = 137;
    function seededRandomFP() { _seedFP = (_seedFP * 16807 + 0) % 2147483647; return (_seedFP - 1) / 2147483646; }

    const fpContacts: ContactDef[] = [];
    let fpIdx = 0;
    for (const dist of fpDistritos) {
      const count = Math.round(TOTAL_FP * dist.weight);
      for (let j = 0; j < count; j++) {
        const fn = fpFirstNames[Math.floor(seededRandomFP() * fpFirstNames.length)]!;
        const ln = fpLastNames[Math.floor(seededRandomFP() * fpLastNames.length)]!;
        const lat = dist.center[0]! + (seededRandomFP() - 0.5) * dist.spread * 2;
        const lng = dist.center[1]! + (seededRandomFP() - 0.5) * dist.spread * 2;
        const r = seededRandomFP();
        const db = r < 0.18 ? 0 : r < 0.32 ? 1 : r < 0.46 ? 2 : r < 0.58 ? 3 : r < 0.68 ? 4 : r < 0.76 ? 5 : r < 0.82 ? 6 : r < 0.87 ? 7 : r < 0.91 ? 8 : r < 0.94 ? 9 : r < 0.96 ? 10 : r < 0.98 ? 11 : r < 0.99 ? 12 : 13;
        // campo agents are indices 4-15 in fpTeam
        fpContacts.push({ nombre: `${fn} ${ln}`, telefono: `9${String(200000 + fpIdx).padStart(8,"0")}`, distrito: dist.name, lat, lng, submitterIdx: 4 + (fpIdx % 12), daysBack: db });
        fpIdx++;
      }
    }
    console.log(`  Generated ${fpContacts.length} contacts for Fuerza Popular across Lima/Callao (${fpDistritos.length} distritos)`);

    // Validation distribution: ~25% pendiente, ~18% contactado, ~42% respondido, ~15% invalido
    const fpVals: ValDef[] = [];
    for (let i = 0; i < fpContacts.length; i++) {
      const r = seededRandomFP();
      if (r < 0.25) fpVals.push({ idx: i, status: "pendiente", vote_class: "", claimerIdx: null });
      else if (r < 0.43) fpVals.push({ idx: i, status: "contactado", vote_class: "", claimerIdx: 16 + (i % 4) }); // digital agents 16-19
      else if (r < 0.85) {
        const vc = seededRandomFP() < 0.50 ? "duro" : seededRandomFP() < 0.60 ? "blando" : "flotante";
        fpVals.push({ idx: i, status: "respondido", vote_class: vc, claimerIdx: 16 + (i % 4) });
      }
      else fpVals.push({ idx: i, status: "invalido", vote_class: "", claimerIdx: 16 + (i % 4) });
    }
    if (campaignIds["fuerza-popular"]) {
      await seedCampaignData(campaignIds["fuerza-popular"]!, "fuerza-popular", "Fuerza Popular", fpTeam, fpZones, fpMeets, fpContacts, fpVals);
    }

    // ── Voluntarios for all campaigns ────────────────────────────────
    const volData = [
      { slug: "rosangella-barbaran", vols: [
        { n: "Alejandra Rios",     t: "956001001", d: "LIMA",       p: "Lima",       dt: "San Isidro",     e: "26-35" },
        { n: "Daniel Huanca",      t: "956001002", d: "LIMA",       p: "Lima",       dt: "Miraflores",     e: "18-25" },
        { n: "Valentina Perea",    t: "956001003", d: "CALLAO",     p: "Callao",     dt: "Callao",         e: "26-35" },
        { n: "Bruno Santillan",    t: "956001004", d: "LIMA",       p: "Lima",       dt: "SJL",            e: "36-45" },
        { n: "Camila Ordoñez",     t: "956001005", d: "LIMA",       p: "Lima",       dt: "Comas",          e: "18-25" },
        { n: "Gonzalo Pariona",    t: "956001006", d: "LIMA",       p: "Lima",       dt: "VES",            e: "26-35" },
        { n: "Natalia Cespedes",   t: "956001007", d: "CALLAO",     p: "Callao",     dt: "Ventanilla",     e: "18-25" },
        { n: "Sebastian Arce",     t: "956001008", d: "LIMA",       p: "Lima",       dt: "SMP",            e: "36-45" },
        { n: "Raquel Mamani",      t: "956001009", d: "AREQUIPA",   p: "Arequipa",   dt: "Cercado",        e: "26-35" },
        { n: "Jhonatan Ccama",     t: "956001010", d: "CUSCO",      p: "Cusco",      dt: "Cusco",          e: "18-25" },
        { n: "Milagros Vasquez",   t: "956001011", d: "LA LIBERTAD",p: "La Libertad",dt: "Trujillo",       e: "26-35" },
        { n: "Brayan Oliva",       t: "956001012", d: "PIURA",      p: "Piura",      dt: "Piura",          e: "18-25" },
        { n: "Yuliana Ticona",     t: "956001013", d: "LAMBAYEQUE", p: "Lambayeque", dt: "Chiclayo",       e: "36-45" },
        { n: "Kevin Choque",       t: "956001014", d: "JUNIN",      p: "Junin",      dt: "Huancayo",       e: "18-25" },
        { n: "Dina Pacompia",      t: "956001015", d: "AREQUIPA",   p: "Arequipa",   dt: "Cayma",          e: "26-35" },
      ]},
      { slug: "ernesto-bustamante", vols: [
        { n: "Renato Ibarra",   t: "956002001", d: "LIMA",     p: "Lima",     dt: "Miraflores",   e: "26-35" },
        { n: "Luciana Prado",   t: "956002002", d: "LIMA",     p: "Lima",     dt: "San Isidro",   e: "18-25" },
        { n: "Mauricio Oviedo", t: "956002003", d: "LIMA",     p: "Lima",     dt: "Surco",        e: "36-45" },
        { n: "Carla Benavides", t: "956002004", d: "LIMA",     p: "Lima",     dt: "La Molina",    e: "26-35" },
        { n: "Rodrigo Meza",    t: "956002005", d: "AREQUIPA", p: "Arequipa", dt: "Arequipa",     e: "18-25" },
        { n: "Patricia Orosco", t: "956002006", d: "AREQUIPA", p: "Arequipa", dt: "Cayma",        e: "26-35" },
        { n: "Emiliano Cornejo",t: "956002007", d: "LIMA",     p: "Lima",     dt: "Miraflores",   e: "18-25" },
        { n: "Isabella Fuentes",t: "956002008", d: "LIMA",     p: "Lima",     dt: "Surco",        e: "36-45" },
        { n: "Santiago Alcazar",t: "956002009", d: "AREQUIPA", p: "Arequipa", dt: "Cayma",        e: "26-35" },
        { n: "Mariana Toledo",  t: "956002010", d: "LIMA",     p: "Lima",     dt: "San Isidro",   e: "18-25" },
      ]},
      { slug: "fernando-rospigliosi", vols: [
        { n: "Franco Alarcon",  t: "956003001", d: "LIMA", p: "Lima", dt: "Los Olivos",     e: "26-35" },
        { n: "Jimena Palomino", t: "956003002", d: "LIMA", p: "Lima", dt: "Independencia",  e: "18-25" },
        { n: "Erick Bustamante",t: "956003003", d: "LIMA", p: "Lima", dt: "Puente Piedra",  e: "36-45" },
        { n: "Milagros Yaranga",t: "956003004", d: "LIMA", p: "Lima", dt: "Carabayllo",     e: "18-25" },
        { n: "Cristhian Olaya", t: "956003005", d: "LIMA", p: "Lima", dt: "Rimac",          e: "26-35" },
        { n: "Deysi Ccorimanya",t: "956003006", d: "LIMA", p: "Lima", dt: "Los Olivos",     e: "36-45" },
        { n: "Anthony Quispe",  t: "956003007", d: "LIMA", p: "Lima", dt: "Independencia",  e: "18-25" },
        { n: "Lucero Huarcaya", t: "956003008", d: "LIMA", p: "Lima", dt: "Puente Piedra",  e: "26-35" },
        { n: "Williams Roque",  t: "956003009", d: "LIMA", p: "Lima", dt: "Carabayllo",     e: "18-25" },
      ]},
      { slug: "fuerza-popular", vols: [
        { n: "Rodrigo Puma",       t: "956004001", d: "LIMA",   p: "Lima",   dt: "SJL",                    e: "18-25" },
        { n: "Kiara Ochoa",        t: "956004002", d: "LIMA",   p: "Lima",   dt: "Comas",                  e: "26-35" },
        { n: "Fabian Quispe",      t: "956004003", d: "LIMA",   p: "Lima",   dt: "Los Olivos",             e: "18-25" },
        { n: "Andrea Vilca",       t: "956004004", d: "CALLAO", p: "Callao", dt: "Callao",                 e: "36-45" },
        { n: "Jhon Sulla",         t: "956004005", d: "LIMA",   p: "Lima",   dt: "Ate Vitarte",            e: "26-35" },
        { n: "Mariela Ccorimanya", t: "956004006", d: "LIMA",   p: "Lima",   dt: "Villa El Salvador",      e: "18-25" },
        { n: "Bryan Condori",      t: "956004007", d: "LIMA",   p: "Lima",   dt: "San Martin de Porres",   e: "26-35" },
        { n: "Luz Mamani",         t: "956004008", d: "CALLAO", p: "Callao", dt: "Ventanilla",             e: "36-45" },
        { n: "Cristopher Leon",    t: "956004009", d: "LIMA",   p: "Lima",   dt: "La Victoria",            e: "18-25" },
        { n: "Estefania Ramos",    t: "956004010", d: "LIMA",   p: "Lima",   dt: "San Juan de Miraflores", e: "26-35" },
        { n: "Piero Huanca",       t: "956004011", d: "LIMA",   p: "Lima",   dt: "Independencia",          e: "18-25" },
        { n: "Yasmin Taype",       t: "956004012", d: "LIMA",   p: "Lima",   dt: "Villa Maria del Triunfo",e: "26-35" },
      ]},
    ];
    for (const { slug: s, vols } of volData) {
      const cid = campaignIds[s];
      if (!cid) continue;
      for (const v of vols) {
        await pool.query(
          `INSERT INTO voluntarios (nombre_completo,telefono,departamento,provincia,distrito,rango_edad,candidato_id,candidato_slug) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [v.n, v.t, v.d, v.p, v.dt, v.e, cid, s]);
      }
      console.log(`  Voluntarios ${s}: ${vols.length}`);
    }

    console.log("\n  ═══════════════════════════════════════════════════════════════");
    console.log("  RESUMEN DATA SIMULADA");
    console.log("  ═══════════════════════════════════════════════════════════════");
    console.log("  Rosangella Barbarán:  25 team, 15 zones, 14 meets, ~4000 submissions, ~4000 validations, 15 voluntarios");
    console.log("  Ernesto Bustamante:   15 team, 6 zones, 7 meets, 80 submissions, 80 validations, 10 voluntarios");
    console.log("  Fernando Rospigliosi: 12 team, 5 zones, 5 meets, 60 submissions, 60 validations, 9 voluntarios");
    console.log("  Fuerza Popular:       20 team, 14 zones, 15 meets, ~4000 submissions, ~4000 validations, 12 voluntarios (Lima/Callao only)");
    console.log("  ═══════════════════════════════════════════════════════════════\n");

    // ── 7. Summary ───────────────────────────────────────────────────
    console.log("\n  Seed complete!\n");
    console.log("  ╔════════════════════════════════════════════════════════════════╗");
    console.log("  ║  GOBERNA — Credenciales de desarrollo                         ║");
    console.log("  ╠════════════════════════════════════════════════════════════════╣");
    console.log(`  ║  Admin:     ${ADMIN.email.padEnd(30)} ${ADMIN.password.padEnd(15)} ║`);
    console.log("  ╠════════════════════════════════════════════════════════════════╣");
    for (const c of CANDIDATES) {
      console.log(
        `  ║  ${c.user.full_name.padEnd(24)} ${c.user.email.padEnd(26)} ${c.user.password.padEnd(8)} ║`,
      );
    }
    console.log("  ╚════════════════════════════════════════════════════════════════╝\n");
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
