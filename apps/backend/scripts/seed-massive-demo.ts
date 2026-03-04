/**
 * seed-massive-demo.ts
 *
 * Genera datos simulados realistas para demo de campaña política peruana:
 * - 50 brigadistas de campo distribuidos por 12 regiones del Perú
 * - 6 operadoras CMS (WhatsApp)
 * - 6 dispositivos WA con sesiones activas e históricas
 * - 15.000 form_submissions con datos ricos (edad, género, ocupación, candidato, etc.)
 * - Estados CMS variados con atribución real por celular
 * - Distribución temporal realista (últimos 5 meses)
 *
 * Uso: bun --env-file=.env.local scripts/seed-massive-demo.ts
 */

import { pool } from "../src/db";
import bcrypt from "bcryptjs";

// ── Config ───────────────────────────────────────────────────────────────────

const CAMPAIGN_ID  = "a474f37b-8422-4deb-a645-ec15aa6963b4"; // Guillermo Aliaga
const TOTAL_SUBS   = 15_000;
const BATCH_SIZE   = 300;

// ── Datos peruanos ────────────────────────────────────────────────────────────

const NOM_M = [
  "Carlos","Miguel","José","Luis","Jorge","Marco","Pedro","Roberto","Fernando",
  "Ricardo","Alejandro","Diego","Andrés","Pablo","Héctor","Raúl","Víctor","César",
  "Eduardo","Gonzalo","Arturo","Manuel","Óscar","Hugo","Daniel","Sergio","Javier",
  "Wilmer","Jhon","Fredy","Roger","Elder","Noel","Deyvis","Yonatan","Erick","Renzo",
];

const NOM_F = [
  "María","Ana","Rosa","Carmen","Patricia","Sandra","Claudia","Gabriela","Lucía",
  "Mónica","Verónica","Silvia","Beatriz","Elena","Teresa","Natalia","Valeria",
  "Sofía","Pamela","Carla","Jessica","Diana","Lorena","Miriam","Yolanda","Sonia",
  "Fiorella","Milagros","Karina","Vanessa","Lisset","Roxana","Maribel","Flor",
];

const APELLIDOS = [
  "García","López","Martínez","Rodríguez","González","Pérez","Torres","Flores",
  "Rivera","Mendoza","Herrera","Díaz","Morales","Vargas","Quispe","Mamani","Huanca",
  "Ccopa","Condori","Apaza","Chuquimia","Layme","Choque","Puma","Ramos","Sánchez",
  "Castro","Reyes","Ortiz","Ruiz","Muñoz","Alvarado","Rojas","Gutiérrez","Castillo",
  "Paredes","Vásquez","Pacheco","Salazar","Espinoza","Lozano","Cruz","Medina",
  "Huamán","Ccallo","Ttito","Pilco","Ccorimanya","Anco","Llactahuamán","Hancco",
];

const OCUPACIONES = [
  "Comerciante","Agricultora","Trabajadora del hogar","Transportista","Docente",
  "Estudiante","Obrero","Enfermera","Técnico","Vendedor ambulante","Taxista",
  "Mecánico","Cocinera","Albañil","Electricista","Emprendedora","Ingeniero",
  "Abogado","Secretaria","Mototaxista","Pescador","Ganadero","Artesano",
];

const COMENTARIOS_CAMPO = [
  "Muy interesado en las propuestas de seguridad",
  "Preguntó por el programa de vivienda",
  "Vota seguro, comprometido con el partido",
  "Tiene dudas, necesita seguimiento",
  "Apoya pero no confirma voto",
  "Líder de su cuadra, influye en vecinos",
  "Trabaja en el mercado central",
  "Tiene negocio propio, preocupado por impuestos",
  "Le interesa el plan de salud",
  "Familia numerosa, preocupado por educación",
  "Ex votante de Fuerza Popular, ahora indeciso",
  "Muy crítico del gobierno actual",
  "Participó en reunión zonal el mes pasado",
  "Referido por vecina del barrio",
  "Quiere hablar con el candidato directamente",
  "Pide información sobre el plan de agua potable",
  "Trabaja en construcción, preocupado por empleo",
  "Profesora jubilada, muy activa políticamente",
  "Joven universitario, primera vez que vota",
  "No quiso dar más información",
  "",
  "",
  "", // más probabilidad de vacío
];

// ── Regiones del Perú (12) ────────────────────────────────────────────────────

interface Region {
  departamento: string;
  distritos: string[];
  lat_base: number;
  lng_base: number;
  /** Peso relativo de submissions (más peso = más actividad de campo) */
  peso: number;
}

const REGIONES: Region[] = [
  {
    departamento: "Lima",
    distritos: [
      "San Juan de Lurigancho","Villa El Salvador","Ate","Comas","Los Olivos",
      "San Martín de Porres","Villa María del Triunfo","Chorrillos","San Juan de Miraflores",
      "Carabayllo","Puente Piedra","Rimac","Independencia","El Agustino","Pachacamac",
      "Santa Anita","San Luis","Surco","Miraflores","Barranco",
    ],
    lat_base: -12.05, lng_base: -77.03, peso: 0.32,
  },
  {
    departamento: "La Libertad",
    distritos: [
      "Trujillo","El Porvenir","La Esperanza","Florencia de Mora",
      "Víctor Larco Herrera","Huanchaco","Moche","Salaverry","Simbal","Poroto",
      "Ascope","Chepén","Pacasmayo","Otuzco","Santiago de Chuco",
    ],
    lat_base: -8.11, lng_base: -79.02, peso: 0.12,
  },
  {
    departamento: "Piura",
    distritos: [
      "Piura","Castilla","Veintiséis de Octubre","Catacaos",
      "La Unión","Tambogrande","Las Lomas","Sechura","Paita","Sullana",
      "Talara","Ayabaca","Morropón","Chulucanas","Huancabamba",
    ],
    lat_base: -5.19, lng_base: -80.63, peso: 0.10,
  },
  {
    departamento: "Arequipa",
    distritos: [
      "Arequipa","Cayma","Cerro Colorado","Paucarpata","Mariano Melgar",
      "José Luis Bustamante","Hunter","Sachaca","Miraflores","Socabaya",
      "Camaná","Mollendo","Cotahuasi","Chivay","La Joya",
    ],
    lat_base: -16.4, lng_base: -71.53, peso: 0.09,
  },
  {
    departamento: "Cusco",
    distritos: [
      "Cusco","San Jerónimo","San Sebastián","Santiago","Wanchaq",
      "Poroy","Saylla","Urubamba","Ollantaytambo","Pisac",
      "Sicuani","Espinar","Quillabamba","Calca","Anta",
    ],
    lat_base: -13.53, lng_base: -71.97, peso: 0.07,
  },
  {
    departamento: "Junín",
    distritos: [
      "Huancayo","El Tambo","Chilca","Sicaya","Huancán",
      "Pilcomayo","San Agustín de Cajas","Jauja","Tarma","La Oroya",
      "Satipo","Chanchamayo","Concepción","Chupaca","Junín",
    ],
    lat_base: -12.07, lng_base: -75.20, peso: 0.07,
  },
  {
    departamento: "Lambayeque",
    distritos: [
      "Chiclayo","José Leonardo Ortiz","La Victoria","Pimentel",
      "Monsefú","Reque","Eten","Santa Rosa","Pomalca","Tumán",
      "Ferreñafe","Lambayeque","Olmos","Motupe","Jayanca",
    ],
    lat_base: -6.77, lng_base: -79.84, peso: 0.07,
  },
  {
    departamento: "Ica",
    distritos: [
      "Ica","Parcona","Subtanjalla","Los Aquijes","Salas","Ocucaje",
      "Nasca","Marcona","Pisco","Paracas","Chincha Alta","El Carmen","Palpa",
    ],
    lat_base: -14.07, lng_base: -75.73, peso: 0.05,
  },
  {
    departamento: "Ancash",
    distritos: [
      "Huaraz","Independencia","Carhuaz","Yungay","Caraz",
      "Chimbote","Nuevo Chimbote","Santa","Casma","Huarmey",
      "Recuay","Bolognesi","Sihuas","Mariscal Luzuriaga",
    ],
    lat_base: -9.53, lng_base: -77.53, peso: 0.04,
  },
  {
    departamento: "San Martín",
    distritos: [
      "Tarapoto","Morales","La Banda de Shilcayo","San Antonio","Cacatachi",
      "Moyobamba","Rioja","Juanjuí","Tocache","Bellavista","Saposoa",
    ],
    lat_base: -6.49, lng_base: -76.36, peso: 0.03,
  },
  {
    departamento: "Cajamarca",
    distritos: [
      "Cajamarca","Los Baños del Inca","Jesús","Llacanora","La Encañada",
      "Jaén","San Ignacio","Cutervo","Chota","Celendín","Bambamarca",
    ],
    lat_base: -7.16, lng_base: -78.51, peso: 0.02,
  },
  {
    departamento: "Loreto",
    distritos: [
      "Iquitos","Punchana","Belén","San Juan Bautista","Nauta",
      "Yurimaguas","Requena","Contamana","Caballococha",
    ],
    lat_base: -3.74, lng_base: -73.25, peso: 0.02,
  },
];

// ── Candidatos con distribución realista ──────────────────────────────────────

const CANDIDATOS: Array<{ nombre: string; peso: number }> = [
  { nombre: "Guillermo Aliaga",   peso: 0.28 }, // propio candidato
  { nombre: "Ahora Nación",       peso: 0.17 },
  { nombre: "País para Todos",    peso: 0.14 },
  { nombre: "Perú Primero",       peso: 0.13 },
  { nombre: "Renovación Popular", peso: 0.12 },
  { nombre: "Fuerza Popular",     peso: 0.10 },
  { nombre: "Otro",               peso: 0.04 },
  { nombre: "Ninguno",            peso: 0.02 },
];

// ── 50 Brigadistas por región ──────────────────────────────────────────────────

interface Brigadista {
  nombre: string;
  email: string;
  region: string;
}

const BRIGADISTAS: Brigadista[] = [
  // Lima (14 brigadistas — región más grande)
  { nombre: "Yolanda Quispe Mamani",     email: "yolanda.quispe@campo.pe",    region: "Lima" },
  { nombre: "José Condori Apaza",        email: "jose.condori@campo.pe",      region: "Lima" },
  { nombre: "Rosa Huanca Choque",        email: "rosa.huanca@campo.pe",       region: "Lima" },
  { nombre: "Marco Layme Puma",          email: "marco.layme@campo.pe",       region: "Lima" },
  { nombre: "Carmen Ccopa Mamani",       email: "carmen.ccopa@campo.pe",      region: "Lima" },
  { nombre: "Luis Paredes Torres",       email: "luis.paredes@campo.pe",      region: "Lima" },
  { nombre: "Sandra Vargas Espinoza",    email: "sandra.vargas@campo.pe",     region: "Lima" },
  { nombre: "Pedro Rojas Castillo",      email: "pedro.rojas@campo.pe",       region: "Lima" },
  { nombre: "Miriam Lozano Cruz",        email: "miriam.lozano@campo.pe",     region: "Lima" },
  { nombre: "Héctor Medina Gutiérrez",   email: "hector.medina@campo.pe",     region: "Lima" },
  { nombre: "Patricia Salazar Ortiz",    email: "patricia.salazar@campo.pe",  region: "Lima" },
  { nombre: "Gonzalo Flores Rivera",     email: "gonzalo.flores@campo.pe",    region: "Lima" },
  { nombre: "Verónica Castro Reyes",     email: "veronica.castro@campo.pe",   region: "Lima" },
  { nombre: "Diego Muñoz Alvarado",      email: "diego.munoz@campo.pe",       region: "Lima" },
  // La Libertad (6)
  { nombre: "Claudia Morales Herrera",   email: "claudia.morales@campo.pe",   region: "La Libertad" },
  { nombre: "Wilmer Rodríguez García",   email: "wilmer.rodriguez@campo.pe",  region: "La Libertad" },
  { nombre: "Flor Sánchez Pérez",        email: "flor.sanchez@campo.pe",      region: "La Libertad" },
  { nombre: "Elder Vásquez Mendoza",     email: "elder.vasquez@campo.pe",     region: "La Libertad" },
  { nombre: "Karina Torres López",       email: "karina.torres@campo.pe",     region: "La Libertad" },
  { nombre: "Renzo Gutiérrez Díaz",      email: "renzo.gutierrez@campo.pe",   region: "La Libertad" },
  // Piura (5)
  { nombre: "Maribel Espinoza Ruiz",     email: "maribel.espinoza@campo.pe",  region: "Piura" },
  { nombre: "Jhon Alvarado Pacheco",     email: "jhon.alvarado@campo.pe",     region: "Piura" },
  { nombre: "Lisset Ramos Herrera",      email: "lisset.ramos@campo.pe",      region: "Piura" },
  { nombre: "Erick Castillo Flores",     email: "erick.castillo@campo.pe",    region: "Piura" },
  { nombre: "Vanessa Cruz Medina",       email: "vanessa.cruz@campo.pe",      region: "Piura" },
  // Arequipa (5)
  { nombre: "Fredy Apaza Condori",       email: "fredy.apaza@campo.pe",       region: "Arequipa" },
  { nombre: "Roxana Pilco Ttito",        email: "roxana.pilco@campo.pe",      region: "Arequipa" },
  { nombre: "Roger Hancco Anco",         email: "roger.hancco@campo.pe",      region: "Arequipa" },
  { nombre: "Milagros Ccallo García",    email: "milagros.ccallo@campo.pe",   region: "Arequipa" },
  { nombre: "Noel Huamán Ccorimanya",    email: "noel.huaman@campo.pe",       region: "Arequipa" },
  // Cusco (4)
  { nombre: "Deyvis Quispe Llactahuamán", email: "deyvis.quispe@campo.pe",   region: "Cusco" },
  { nombre: "Fiorella Mamani Chuquimia", email: "fiorella.mamani@campo.pe",  region: "Cusco" },
  { nombre: "Yonatan Choque Layme",      email: "yonatan.choque@campo.pe",   region: "Cusco" },
  { nombre: "Silvia Ccopa Apaza",        email: "silvia.ccopa@campo.pe",     region: "Cusco" },
  // Junín (4)
  { nombre: "Hugo Mendoza Vargas",       email: "hugo.mendoza@campo.pe",      region: "Junín" },
  { nombre: "Diana López Morales",       email: "diana.lopez@campo.pe",       region: "Junín" },
  { nombre: "Arturo González Rivera",    email: "arturo.gonzalez@campo.pe",   region: "Junín" },
  { nombre: "Teresa Pérez Rojas",        email: "teresa.perez@campo.pe",      region: "Junín" },
  // Lambayeque (4)
  { nombre: "Pamela Ortiz Sánchez",      email: "pamela.ortiz@campo.pe",      region: "Lambayeque" },
  { nombre: "Daniel Reyes Castro",       email: "daniel.reyes@campo.pe",      region: "Lambayeque" },
  { nombre: "Lorena Díaz González",      email: "lorena.diaz@campo.pe",       region: "Lambayeque" },
  { nombre: "Sergio Flores Martínez",    email: "sergio.flores@campo.pe",     region: "Lambayeque" },
  // Ica (2)
  { nombre: "Carla Ruiz Espinoza",       email: "carla.ruiz@campo.pe",        region: "Ica" },
  { nombre: "Fernando Lozano Paredes",   email: "fernando.lozano@campo.pe",   region: "Ica" },
  // Ancash (2)
  { nombre: "Natalia Gutiérrez Herrera", email: "natalia.gutierrez@campo.pe", region: "Ancash" },
  { nombre: "Eduardo Salazar Vásquez",   email: "eduardo.salazar@campo.pe",   region: "Ancash" },
  // San Martín (2)
  { nombre: "Sofía Pacheco Alvarado",    email: "sofia.pacheco@campo.pe",     region: "San Martín" },
  { nombre: "Víctor Castillo Rojas",     email: "victor.castillo@campo.pe",   region: "San Martín" },
  // Cajamarca (1)
  { nombre: "Gabriela Medina Cruz",      email: "gabriela.medina@campo.pe",   region: "Cajamarca" },
  // Loreto (1)
  { nombre: "Raúl Torres García",        email: "raul.torres@campo.pe",       region: "Loreto" },
];

// ── Operadoras CMS (WhatsApp) ─────────────────────────────────────────────────

const OPERADORAS = [
  { nombre: "Ana Gómez Ruiz",        email: "ana.gomez@ops.pe",       wa: "51906218514" },
  { nombre: "Lucía Torres Díaz",     email: "lucia.torres@ops.pe",    wa: "51906175778" },
  { nombre: "Mónica Ramos García",   email: "monica.ramos@ops.pe",    wa: "51930700661" },
  { nombre: "Beatriz Sánchez López", email: "beatriz.sanchez@ops.pe", wa: "51901938157" },
  { nombre: "Elena Mendoza Pérez",   email: "elena.mendoza@ops.pe",   wa: "51923456789" },
  { nombre: "Fabiola Ríos Huanca",   email: "fabiola.rios@ops.pe",    wa: "51934567890" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedRand<T>(items: Array<{ peso: number } & T>): T {
  const r = Math.random();
  let acc = 0;
  for (const item of items) {
    acc += item.peso;
    if (r <= acc) return item;
  }
  return items[items.length - 1]!;
}

function randPhone(): string {
  return `9${randInt(10, 99)}${randInt(100000, 999999)}`;
}

function randDni(): string {
  return String(randInt(10000000, 99999999));
}

function randAge(): number {
  // Distribución realista: más adultos 30-60
  const r = Math.random();
  if (r < 0.10) return randInt(18, 25);
  if (r < 0.30) return randInt(26, 35);
  if (r < 0.55) return randInt(36, 50);
  if (r < 0.80) return randInt(51, 65);
  return randInt(66, 85);
}

/** Fecha aleatoria en los últimos N días, con distribución más pesada en días recientes */
function randDate(maxDaysBack: number): Date {
  const now = Date.now();
  // Distribución logarítmica: más submissions en días recientes
  const factor = Math.pow(Math.random(), 1.5);
  const msBack = factor * maxDaysBack * 24 * 60 * 60 * 1000;
  return new Date(now - msBack);
}

function randGps(lat_base: number, lng_base: number): { lat: number; lng: number } {
  return {
    lat: +(lat_base + (Math.random() - 0.5) * 0.4).toFixed(6),
    lng: +(lng_base + (Math.random() - 0.5) * 0.4).toFixed(6),
  };
}

function nombrePersona(): string {
  const esFem = Math.random() > 0.48;
  const n = esFem ? rand(NOM_F) : rand(NOM_M);
  return `${n} ${rand(APELLIDOS)} ${rand(APELLIDOS)}`;
}

function cmsStatus(): "nuevo" | "hablado" | "respondieron" | "archivado" {
  const r = Math.random();
  if (r < 0.28) return "nuevo";
  if (r < 0.58) return "hablado";
  if (r < 0.83) return "respondieron";
  return "archivado";
}

function regionByName(name: string): Region {
  return REGIONES.find(r => r.departamento === name) ?? REGIONES[0]!;
}

/** Weighted pick de región según peso configurado */
function randRegion(): Region {
  return weightedRand(REGIONES.map(r => ({ ...r, peso: r.peso })));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  const hash   = await bcrypt.hash("Campo1234!", 10);

  try {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║  SEED MASIVO — Goberna Demo Campaign         ║");
    console.log("╚══════════════════════════════════════════════╝\n");

    await client.query("BEGIN");

    // ── LIMPIAR datos anteriores de la campaña demo ───────────────────
    console.log("  [0/6] Limpiando datos anteriores...");
    await client.query(
      `DELETE FROM cms_device_sessions WHERE campaign_id = $1`, [CAMPAIGN_ID]
    );
    await client.query(
      `DELETE FROM form_submissions WHERE campaign_id = $1`, [CAMPAIGN_ID]
    );
    // Mantener el admin; sólo limpiar agentes/operadoras previas del demo
    await client.query(`
      DELETE FROM user_campaigns
      WHERE campaign_id = $1
        AND user_id IN (
          SELECT id FROM users WHERE email LIKE '%@campo.pe' OR email LIKE '%@ops.pe'
        )
    `, [CAMPAIGN_ID]);
    await client.query(`
      DELETE FROM users
      WHERE email LIKE '%@campo.pe' OR email LIKE '%@ops.pe'
    `);
    console.log("     ✓ datos anteriores limpiados");

    // ── 1. Brigadistas (50) ───────────────────────────────────────────
    console.log(`\n  [1/6] Creando ${BRIGADISTAS.length} brigadistas por región...`);

    const brigadistaMap = new Map<string, { id: string; region: string }>();

    for (const b of BRIGADISTAS) {
      const res = await client.query<{ id: string }>(`
        INSERT INTO users (email, full_name, password_hash, role, region)
        VALUES ($1, $2, $3, 'agente_campo', $4)
        ON CONFLICT (lower(email)) DO UPDATE
          SET full_name = EXCLUDED.full_name, region = EXCLUDED.region
        RETURNING id
      `, [b.email, b.nombre, hash, b.region]);

      const uid = res.rows[0]!.id;
      brigadistaMap.set(uid, { id: uid, region: b.region });

      await client.query(`
        INSERT INTO user_campaigns (user_id, campaign_id, role, assigned_at, region)
        VALUES ($1, $2, 'agente_campo', now(), $3)
        ON CONFLICT (user_id, campaign_id) DO NOTHING
      `, [uid, CAMPAIGN_ID, b.region]);
    }

    const brigadistaIds = [...brigadistaMap.keys()];
    console.log(`     ✓ ${brigadistaIds.length} brigadistas creados`);

    // Índice por región para asignar submissions al brigadista correcto
    const brigadistasByRegion = new Map<string, string[]>();
    for (const [uid, info] of brigadistaMap) {
      const list = brigadistasByRegion.get(info.region) ?? [];
      list.push(uid);
      brigadistasByRegion.set(info.region, list);
    }

    // ── 2. Operadoras CMS (6) ─────────────────────────────────────────
    console.log(`\n  [2/6] Creando ${OPERADORAS.length} operadoras CMS...`);

    const operadoraIds: Array<{ id: string; wa: string }> = [];

    for (const op of OPERADORAS) {
      const res = await client.query<{ id: string }>(`
        INSERT INTO users (email, full_name, password_hash, role)
        VALUES ($1, $2, $3, 'agente_campo')
        ON CONFLICT (lower(email)) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id
      `, [op.email, op.nombre, hash]);

      const uid = res.rows[0]!.id;
      operadoraIds.push({ id: uid, wa: op.wa });

      await client.query(`
        INSERT INTO user_campaigns (user_id, campaign_id, role, assigned_at)
        VALUES ($1, $2, 'agente_campo', now())
        ON CONFLICT (user_id, campaign_id) DO NOTHING
      `, [uid, CAMPAIGN_ID]);
    }
    console.log(`     ✓ ${operadoraIds.length} operadoras creadas`);

    // ── 3. Device sessions (6 celulares) ─────────────────────────────
    console.log(`\n  [3/6] Creando sesiones de dispositivos WA...`);

    const WA_NUMBERS = OPERADORAS.map(o => o.wa);

    for (let i = 0; i < WA_NUMBERS.length; i++) {
      const wa  = WA_NUMBERS[i]!;
      const op  = operadoraIds[i]!;
      // Celulares 0,1,2 activos; 3,4,5 inactivos
      const isActive  = i < 3;
      const heartbeat = isActive
        ? new Date(Date.now() - randInt(60_000, 240_000))      // hace 1-4 min
        : new Date(Date.now() - randInt(3_600_000, 86_400_000)); // hace 1-24h

      await client.query(`
        INSERT INTO cms_device_sessions (campaign_id, wa_number, operator_id, last_heartbeat, ended_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        CAMPAIGN_ID, wa, op.id, heartbeat,
        isActive ? null : new Date(heartbeat.getTime() + randInt(1_800_000, 7_200_000)),
      ]);

      // Historial de sesiones pasadas (realismo)
      for (let j = 0; j < randInt(3, 8); j++) {
        const started = randDate(120);
        await client.query(`
          INSERT INTO cms_device_sessions
            (campaign_id, wa_number, operator_id, started_at, last_heartbeat, ended_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          CAMPAIGN_ID, wa, op.id, started,
          new Date(started.getTime() + randInt(300_000, 14_400_000)),
          new Date(started.getTime() + randInt(1_800_000, 28_800_000)),
        ]);
      }
    }
    console.log(`     ✓ 6 dispositivos (3 activos, 3 inactivos + historial)`);

    // ── 4. Form submissions masivos ───────────────────────────────────
    console.log(`\n  [4/6] Generando ${TOTAL_SUBS.toLocaleString()} submissions...`);
    console.log(`        (batches de ${BATCH_SIZE}, esto toma ~30s)\n`);

    let inserted = 0;
    const startTime = Date.now();

    while (inserted < TOTAL_SUBS) {
      const batchSize = Math.min(BATCH_SIZE, TOTAL_SUBS - inserted);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let p = 1;

      for (let i = 0; i < batchSize; i++) {
        // Región ponderada → brigadista de esa región
        const region    = randRegion();
        const regBrigs  = brigadistasByRegion.get(region.departamento) ?? brigadistaIds;
        const brigadista = rand(regBrigs);
        const distrito  = rand(region.distritos);
        const gps       = randGps(region.lat_base, region.lng_base);
        const cand      = weightedRand(CANDIDATOS);
        const status    = cmsStatus();
        const createdAt = randDate(150); // últimos 5 meses

        // Atribución WhatsApp (sólo contactados)
        let waNumber: string | null   = null;
        let operatorId: string | null  = null;
        let habladoAt: Date | null     = null;
        let respondieronAt: Date | null = null;

        if (status !== "nuevo") {
          const op   = rand(operadoraIds);
          waNumber   = op.wa;
          operatorId = op.id;
          habladoAt  = new Date(createdAt.getTime() + randInt(3_600_000, 86_400_000 * 4));

          if (status === "respondieron" || status === "archivado") {
            respondieronAt = new Date(
              habladoAt.getTime() + randInt(1_800_000, 86_400_000 * 3),
            );
          }
        }

        // Fuente de contacto
        const srcR = Math.random();
        const contactSource = srcR < 0.84 ? "territorio"
                            : srcR < 0.97 ? "meta"
                            : "manual";

        // Género
        const genero = Math.random() > 0.52 ? "Masculino" : "Femenino";

        // Datos del formulario (ricos)
        const data = {
          nombre:               nombrePersona(),
          dni:                  randDni(),
          telefono:             randPhone(),
          edad:                 randAge(),
          genero,
          ocupacion:            rand(OCUPACIONES),
          distrito,
          zona:                 region.departamento,
          candidato_preferido:  cand.nombre,
          intencion_voto:       cand.nombre === "Guillermo Aliaga"
                                  ? rand(["Seguro","Probable","Convencido"])
                                  : rand(["No lo apoya","Dudoso","Indiferente","Apoya rival"]),
          comentarios:          rand(COMENTARIOS_CAMPO),
          ubicacion:            { lat: gps.lat, lng: gps.lng },
          encuestador_id:       brigadista,
          region:               region.departamento,
        };

        // Vote tier para métricas internas
        const voteSignal = cand.nombre === "Guillermo Aliaga"
          ? (Math.random() > 0.25 ? "voto_duro" : "voto_blando")
          : cand.nombre === "Ninguno"
          ? "contacto_basura"
          : (Math.random() > 0.6 ? "convertible" : "voto_blando");

        const notes = {
          vote_tier: voteSignal,
          signal_score: voteSignal === "voto_duro"    ? randInt(50, 100)
                      : voteSignal === "convertible"  ? randInt(10, 49)
                      : voteSignal === "voto_blando"  ? randInt(-15, 30)
                      : randInt(-100, -20),
        };

        const clientId = `demo2-${Date.now()}-${inserted + i}-${Math.random().toString(36).slice(2, 8)}`;

        placeholders.push(
          `($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11})`
        );
        values.push(
          CAMPAIGN_ID,            // $p+0
          JSON.stringify(data),   // $p+1
          clientId,               // $p+2
          brigadista,             // $p+3  submitted_by
          contactSource,          // $p+4
          status,                 // $p+5
          waNumber,               // $p+6
          operatorId,             // $p+7
          habladoAt,              // $p+8
          respondieronAt,         // $p+9
          JSON.stringify(notes),  // $p+10
          createdAt,              // $p+11
        );
        p += 12;
      }

      await client.query(`
        INSERT INTO form_submissions (
          campaign_id, data, client_id, submitted_by,
          contact_source, cms_status,
          cms_wa_number, cms_operator_id,
          cms_hablado_at, cms_respondieron_at,
          cms_operator_notes,
          created_at
        ) VALUES ${placeholders.join(",")}
      `, values);

      inserted += batchSize;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct     = ((inserted / TOTAL_SUBS) * 100).toFixed(0);
      process.stdout.write(
        `\r        [${pct.padStart(3)}%] ${inserted.toLocaleString()}/${TOTAL_SUBS.toLocaleString()} — ${elapsed}s`
      );
    }

    console.log(`\n     ✓ ${inserted.toLocaleString()} submissions insertados`);

    // ── 5. Contactos en proceso (claimed) ─────────────────────────────
    console.log(`\n  [5/6] Simulando contactos en proceso...`);

    const nuevos = await client.query<{ id: string }>(`
      SELECT id FROM form_submissions
      WHERE campaign_id = $1 AND cms_status = 'nuevo'
      ORDER BY random()
      LIMIT 120
    `, [CAMPAIGN_ID]);

    for (const row of nuevos.rows) {
      const op = rand(operadoraIds);
      await client.query(`
        UPDATE form_submissions
        SET cms_claimed_by  = $1,
            cms_claimed_at  = now() - (random() * interval '45 minutes')
        WHERE id = $2
      `, [op.id, row.id]);
    }
    console.log(`     ✓ 120 contactos marcados como reclamados activos`);

    // ── 6. Resumen final ──────────────────────────────────────────────
    console.log(`\n  [6/6] Calculando resumen...`);

    const statsCMS = await client.query(`
      SELECT
        cms_status,
        contact_source,
        COUNT(*)                                                    AS total,
        COUNT(*) FILTER (WHERE cms_wa_number IS NOT NULL)           AS con_wa
      FROM form_submissions
      WHERE campaign_id = $1
      GROUP BY cms_status, contact_source
      ORDER BY cms_status, contact_source
    `, [CAMPAIGN_ID]);

    const statsCand = await client.query(`
      SELECT
        data->>'candidato_preferido'                                 AS candidato,
        COUNT(*)                                                     AS total,
        COUNT(*) FILTER (WHERE cms_status = 'respondieron')          AS respondieron,
        COUNT(*) FILTER (WHERE cms_status IN ('hablado','respondieron','archivado')) AS contactados
      FROM form_submissions
      WHERE campaign_id = $1
      GROUP BY data->>'candidato_preferido'
      ORDER BY total DESC
    `, [CAMPAIGN_ID]);

    const statsRegion = await client.query(`
      SELECT
        data->>'region'                                              AS region,
        COUNT(*)                                                     AS total,
        COUNT(*) FILTER (WHERE cms_status = 'respondieron')          AS respondieron
      FROM form_submissions
      WHERE campaign_id = $1
      GROUP BY data->>'region'
      ORDER BY total DESC
      LIMIT 12
    `, [CAMPAIGN_ID]);

    await client.query("COMMIT");

    const total = TOTAL_SUBS;

    console.log("\n");
    console.log("  ╔════════════════════════════════════════════════════════════════╗");
    console.log("  ║  DEMO SEED COMPLETO ✓                                          ║");
    console.log("  ╠════════════════════════════════════════════════════════════════╣");
    console.log(`  ║  Total submissions: ${String(total.toLocaleString()).padEnd(44)} ║`);
    console.log(`  ║  Brigadistas:       ${String(BRIGADISTAS.length).padEnd(44)} ║`);
    console.log(`  ║  Operadoras CMS:    ${String(OPERADORAS.length).padEnd(44)} ║`);
    console.log(`  ║  Dispositivos WA:   ${String(WA_NUMBERS.length).padEnd(44)} ║`);
    console.log("  ╠════════════════════════════════════════════════════════════════╣");
    console.log("  ║  ESTADOS CMS × ORIGEN:                                         ║");
    for (const row of statsCMS.rows) {
      const line = `  ║    ${row.cms_status.padEnd(13)} [${(row.contact_source as string).padEnd(10)}]  ${String(row.total).padStart(6)}  (${String(row.con_wa).padStart(6)} con WA)`;
      console.log(line.padEnd(67) + "║");
    }
    console.log("  ╠════════════════════════════════════════════════════════════════╣");
    console.log("  ║  CANDIDATOS PREFERIDOS:                                        ║");
    for (const row of statsCand.rows) {
      const pct  = total > 0 ? Math.round((Number(row.total) / total) * 100) : 0;
      const resp = Number(row.contactados) > 0
        ? Math.round((Number(row.respondieron) / Number(row.contactados)) * 100) : 0;
      const line = `  ║    ${String(row.candidato).padEnd(22)}  ${String(row.total).padStart(6)} (${String(pct).padStart(2)}%)   resp: ${String(resp).padStart(2)}%`;
      console.log(line.padEnd(67) + "║");
    }
    console.log("  ╠════════════════════════════════════════════════════════════════╣");
    console.log("  ║  SUBMISSIONS POR REGIÓN (top 12):                              ║");
    for (const row of statsRegion.rows) {
      const pct  = total > 0 ? Math.round((Number(row.total) / total) * 100) : 0;
      const line = `  ║    ${String(row.region).padEnd(20)}  ${String(row.total).padStart(6)} (${String(pct).padStart(2)}%)`;
      console.log(line.padEnd(67) + "║");
    }
    console.log("  ╚════════════════════════════════════════════════════════════════╝\n");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n  ✗ Error — rollback ejecutado:\n", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
