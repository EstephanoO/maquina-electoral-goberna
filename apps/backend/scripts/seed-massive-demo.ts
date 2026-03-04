/**
 * seed-massive-demo.ts
 *
 * Genera datos simulados realistas para demo:
 * - 15 brigadistas de campo
 * - 5 operadoras CMS (WhatsApp)
 * - 4 dispositivos WA con sesiones
 * - ~3000 form_submissions distribuidos por región, candidato, tiempo
 * - Estados CMS variados con atribución real
 *
 * Uso: bun --env-file=.env.local scripts/seed-massive-demo.ts
 */

import { pool } from "../src/db";
import bcrypt from "bcryptjs";

// ── Config ───────────────────────────────────────────────────────────

const CAMPAIGN_ID = "a474f37b-8422-4deb-a645-ec15aa6963b4"; // Guillermo Aliaga
const TOTAL_SUBMISSIONS = 3000;

// ── Datos peruanos reales ────────────────────────────────────────────

const NOMBRES_MASCULINOS = [
  "Carlos","Miguel","José","Luis","Jorge","Marco","Pedro","Roberto","Fernando",
  "Ricardo","Alejandro","Diego","Andrés","Pablo","Héctor","Raúl","Víctor","César",
  "Eduardo","Gonzalo","Arturo","Manuel","Óscar","Hugo","Daniel","Sergio","Javier",
];

const NOMBRES_FEMENINOS = [
  "María","Ana","Rosa","Carmen","Patricia","Sandra","Claudia","Gabriela","Lucía",
  "Mónica","Verónica","Silvia","Beatriz","Elena","Teresa","Natalia","Valeria",
  "Sofía","Pamela","Carla","Jessica","Diana","Lorena","Miriam","Yolanda","Sonia",
];

const APELLIDOS = [
  "García","López","Martínez","Rodríguez","González","Pérez","Torres","Flores",
  "Rivera","Mendoza","Herrera","Díaz","Morales","Vargas","Quispe","Mamani","Huanca",
  "Ccopa","Condori","Apaza","Chuquimia","Layme","Choque","Puma","Ramos","Sánchez",
  "Castro","Reyes","Ortiz","Ruiz","Muñoz","Alvarado","Rojas","Gutiérrez","Castillo",
  "Paredes","Vásquez","Pacheco","Salazar","Espinoza","Lozano","Cruz","Medina",
];

const REGIONES: Array<{
  departamento: string;
  distritos: string[];
  lat_base: number;
  lng_base: number;
}> = [
  {
    departamento: "Lima",
    distritos: ["San Juan de Lurigancho","Villa El Salvador","Ate","Comas","Los Olivos",
      "San Martín de Porres","Villa María del Triunfo","Chorrillos","San Juan de Miraflores",
      "Carabayllo","Puente Piedra","Rimac","Independencia","El Agustino","Pachacamac"],
    lat_base: -12.05,
    lng_base: -77.03,
  },
  {
    departamento: "Arequipa",
    distritos: ["Arequipa","Cayma","Cerro Colorado","Paucarpata","Mariano Melgar",
      "José Luis Bustamante","Hunter","Sachaca","Miraflores","Socabaya"],
    lat_base: -16.4,
    lng_base: -71.53,
  },
  {
    departamento: "Cusco",
    distritos: ["Cusco","San Jerónimo","San Sebastián","Santiago","Wanchaq",
      "Poroy","Saylla","Ccorca","Distrito de Cusco","Urubamba"],
    lat_base: -13.53,
    lng_base: -71.97,
  },
  {
    departamento: "La Libertad",
    distritos: ["Trujillo","El Porvenir","La Esperanza","Florencia de Mora",
      "Víctor Larco Herrera","Huanchaco","Moche","Salaverry","Simbal","Poroto"],
    lat_base: -8.11,
    lng_base: -79.02,
  },
  {
    departamento: "Piura",
    distritos: ["Piura","Castilla","Veintiséis de Octubre","Catacaos",
      "La Unión","Tambogrande","Las Lomas","Sechura","Paita","Sullana"],
    lat_base: -5.19,
    lng_base: -80.63,
  },
  {
    departamento: "Junín",
    distritos: ["Huancayo","El Tambo","Chilca","Sicaya","Huancán",
      "Pilcomayo","San Agustín de Cajas","Jauja","Tarma","La Oroya"],
    lat_base: -12.07,
    lng_base: -75.2,
  },
  {
    departamento: "Lambayeque",
    distritos: ["Chiclayo","José Leonardo Ortiz","La Victoria","Pimentel",
      "Monsefú","Reque","Eten","Santa Rosa","Pomalca","Tumán"],
    lat_base: -6.77,
    lng_base: -79.84,
  },
  {
    departamento: "Ica",
    distritos: ["Ica","Parcona","Subtanjalla","Los Aquijes","Salas","Ocucaje",
      "Nasca","Marcona","Pisco","Paracas"],
    lat_base: -14.07,
    lng_base: -75.73,
  },
];

// Distribución de candidatos preferidos (suma ~100%)
// Refleja competencia real: favorito + competidores
const CANDIDATOS_DIST: Array<{ nombre: string; peso: number }> = [
  { nombre: "Guillermo Aliaga",   peso: 0.28 }, // propio candidato — mayoría
  { nombre: "Ahora Nación",       peso: 0.16 },
  { nombre: "País para Todos",    peso: 0.14 },
  { nombre: "Perú Primero",       peso: 0.13 },
  { nombre: "Renovación Popular", peso: 0.12 },
  { nombre: "Fuerza Popular",     peso: 0.11 },
  { nombre: "Otro",               peso: 0.04 },
  { nombre: "Ninguno",            peso: 0.02 },
];

// ── Helpers ──────────────────────────────────────────────────────────

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
  // Peruvian mobile: 9XXXXXXXX
  return `9${randInt(10, 99)}${randInt(100000, 999999)}`;
}

function randDate(daysBack: number): Date {
  const now = Date.now();
  const then = now - daysBack * 24 * 60 * 60 * 1000;
  return new Date(then + Math.random() * (now - then));
}

function randGps(lat_base: number, lng_base: number): { lat: number; lng: number } {
  return {
    lat: lat_base + (Math.random() - 0.5) * 0.3,
    lng: lng_base + (Math.random() - 0.5) * 0.3,
  };
}

function nombre(): string {
  const esFem = Math.random() > 0.5;
  const n = esFem ? rand(NOMBRES_FEMENINOS) : rand(NOMBRES_MASCULINOS);
  return `${n} ${rand(APELLIDOS)} ${rand(APELLIDOS)}`;
}

// CMS status distribution (realistic funnel)
function cmsStatus(): "nuevo" | "hablado" | "respondieron" | "archivado" {
  const r = Math.random();
  if (r < 0.30) return "nuevo";        // 30% pendiente
  if (r < 0.60) return "hablado";      // 30% contactado
  if (r < 0.85) return "respondieron"; // 25% respondió
  return "archivado";                   // 15% archivado
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();

  try {
    console.log("\n  Seeding massive demo data...\n");

    await client.query("BEGIN");

    // ── 1. Brigadistas (agentes de campo) ───────────────────────────
    console.log("  [1/6] Creando brigadistas de campo...");

    const BRIGADISTAS_NOMBRES = [
      { n: "Yolanda Quispe Mamani",     e: "yolanda.quispe@campo.pe",    pw: "Campo1234!" },
      { n: "José Condori Apaza",        e: "jose.condori@campo.pe",      pw: "Campo1234!" },
      { n: "Rosa Huanca Choque",        e: "rosa.huanca@campo.pe",       pw: "Campo1234!" },
      { n: "Marco Layme Puma",          e: "marco.layme@campo.pe",       pw: "Campo1234!" },
      { n: "Carmen Ccopa Mamani",       e: "carmen.ccopa@campo.pe",      pw: "Campo1234!" },
      { n: "Luis Paredes Torres",       e: "luis.paredes@campo.pe",      pw: "Campo1234!" },
      { n: "Sandra Vargas Espinoza",    e: "sandra.vargas@campo.pe",     pw: "Campo1234!" },
      { n: "Pedro Rojas Castillo",      e: "pedro.rojas@campo.pe",       pw: "Campo1234!" },
      { n: "Miriam Lozano Cruz",        e: "miriam.lozano@campo.pe",     pw: "Campo1234!" },
      { n: "Héctor Medina Gutiérrez",   e: "hector.medina@campo.pe",     pw: "Campo1234!" },
      { n: "Patricia Salazar Ortiz",    e: "patricia.salazar@campo.pe",  pw: "Campo1234!" },
      { n: "Gonzalo Flores Rivera",     e: "gonzalo.flores@campo.pe",    pw: "Campo1234!" },
      { n: "Verónica Castro Reyes",     e: "veronica.castro@campo.pe",   pw: "Campo1234!" },
      { n: "Diego Muñoz Alvarado",      e: "diego.munoz@campo.pe",       pw: "Campo1234!" },
      { n: "Claudia Morales Herrera",   e: "claudia.morales@campo.pe",   pw: "Campo1234!" },
    ];

    const brigadistaIds: string[] = [];
    const hash = await bcrypt.hash("Campo1234!", 10);

    for (const b of BRIGADISTAS_NOMBRES) {
      const res = await client.query<{ id: string }>(`
        INSERT INTO users (email, full_name, password_hash, role)
        VALUES ($1, $2, $3, 'agente_campo')
        ON CONFLICT (lower(email)) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id
      `, [b.e, b.n, hash]);
      const uid = res.rows[0]!.id;
      brigadistaIds.push(uid);

      // Asignar a campaña
      await client.query(`
        INSERT INTO user_campaigns (user_id, campaign_id, role, assigned_at)
        VALUES ($1, $2, 'agente_campo', now())
        ON CONFLICT (user_id, campaign_id) DO NOTHING
      `, [uid, CAMPAIGN_ID]);
    }
    console.log(`     ✓ ${brigadistaIds.length} brigadistas creados`);

    // ── 2. Operadoras CMS ────────────────────────────────────────────
    console.log("  [2/6] Creando operadoras CMS...");

    const OPERADORAS = [
      { n: "Ana Gómez Ruiz",        e: "ana.gomez@ops.pe",       wa: "51906218514" },
      { n: "Lucía Torres Díaz",     e: "lucia.torres@ops.pe",    wa: "51906175778" },
      { n: "Mónica Ramos García",   e: "monica.ramos@ops.pe",    wa: "51930700661" },
      { n: "Beatriz Sánchez López", e: "beatriz.sanchez@ops.pe", wa: "51901938157" },
      { n: "Elena Mendoza Pérez",   e: "elena.mendoza@ops.pe",   wa: "51906218514" }, // comparte celular 1
    ];

    const operadoraIds: Array<{ id: string; wa: string }> = [];

    for (const op of OPERADORAS) {
      const res = await client.query<{ id: string }>(`
        INSERT INTO users (email, full_name, password_hash, role)
        VALUES ($1, $2, $3, 'agente_campo')
        ON CONFLICT (lower(email)) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id
      `, [op.e, op.n, hash]);
      const uid = res.rows[0]!.id;
      operadoraIds.push({ id: uid, wa: op.wa });

      await client.query(`
        INSERT INTO user_campaigns (user_id, campaign_id, role, assigned_at)
        VALUES ($1, $2, 'agente_campo', now())
        ON CONFLICT (user_id, campaign_id) DO NOTHING
      `, [uid, CAMPAIGN_ID]);
    }
    console.log(`     ✓ ${operadoraIds.length} operadoras CMS creadas`);

    // ── 3. Device sessions ──────────────────────────────────────────
    console.log("  [3/6] Creando sesiones de dispositivos WA...");

    const WA_NUMBERS = ["51906218514","51906175778","51930700661","51901938157"];

    // Sesión activa en celulares 1 y 3, inactiva en 2 y 4
    for (let i = 0; i < WA_NUMBERS.length; i++) {
      const wa = WA_NUMBERS[i]!;
      const op = operadoraIds.find(o => o.wa === wa);
      if (!op) continue;

      const isActive = i === 0 || i === 2; // Celular 1 y 3 activos
      const heartbeat = isActive
        ? new Date(Date.now() - randInt(60000, 300000))    // hace 1-5 min
        : new Date(Date.now() - randInt(3600000, 86400000)); // hace 1-24h

      await client.query(`
        INSERT INTO cms_device_sessions (campaign_id, wa_number, operator_id, last_heartbeat, ended_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        CAMPAIGN_ID, wa, op.id, heartbeat,
        isActive ? null : new Date(heartbeat.getTime() + randInt(1800000, 7200000)),
      ]);

      // Sesiones históricas adicionales
      for (let j = 0; j < randInt(2, 5); j++) {
        const started = randDate(60);
        await client.query(`
          INSERT INTO cms_device_sessions (campaign_id, wa_number, operator_id, started_at, last_heartbeat, ended_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          CAMPAIGN_ID, wa, op.id, started,
          new Date(started.getTime() + randInt(300000, 14400000)),
          new Date(started.getTime() + randInt(1800000, 28800000)),
        ]);
      }
    }
    console.log(`     ✓ sesiones WA creadas (2 activas, 2 inactivas + historial)`);

    // ── 4. Form submissions masivos ─────────────────────────────────
    console.log(`  [4/6] Generando ${TOTAL_SUBMISSIONS} form submissions...`);

    // Limpiar los 7 de prueba anteriores
    await client.query(
      `DELETE FROM form_submissions WHERE campaign_id = $1 AND client_id LIKE 'test-%'`,
      [CAMPAIGN_ID]
    );

    const BATCH = 200;
    let inserted = 0;

    while (inserted < TOTAL_SUBMISSIONS) {
      const batchSize = Math.min(BATCH, TOTAL_SUBMISSIONS - inserted);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let p = 1;

      for (let i = 0; i < batchSize; i++) {
        const region = rand(REGIONES);
        const distrito = rand(region.distritos);
        const gps = randGps(region.lat_base, region.lng_base);
        const brigadista = rand(brigadistaIds);
        const candPref = weightedRand(CANDIDATOS_DIST);
        const status = cmsStatus();
        const createdAt = randDate(90); // últimos 3 meses

        // Atribución WA (solo contactados)
        let waNumber: string | null = null;
        let operatorId: string | null = null;
        let habladoAt: Date | null = null;
        let respondieronAt: Date | null = null;

        if (status !== "nuevo") {
          const op = rand(operadoraIds);
          waNumber = op.wa;
          operatorId = op.id;
          habladoAt = new Date(createdAt.getTime() + randInt(3600000, 86400000 * 3));

          if (status === "respondieron" || status === "archivado") {
            respondieronAt = new Date(habladoAt.getTime() + randInt(1800000, 86400000 * 2));
          }
        }

        const clientId = `demo-${Date.now()}-${inserted + i}-${Math.random().toString(36).slice(2, 7)}`;

        // Determinar contact_source: 85% territorio, 12% meta, 3% manual
        const srcR = Math.random();
        const contactSource = srcR < 0.85 ? "territorio" : srcR < 0.97 ? "meta" : "manual";

        const data = {
          nombre: nombre(),
          telefono: randPhone(),
          distrito,
          zona: region.departamento,
          candidato_preferido: candPref.nombre,
          comentarios: Math.random() > 0.7
            ? rand(["Interesado en propuestas","Vota seguro","Dudoso, necesita seguimiento",
                    "Apoya pero no confirma","Muy comprometido con el partido",
                    "Tiene familia numerosa","Trabaja en el mercado","Tiene negocio propio",
                    "Líder de su cuadra","Influye en vecinos"])
            : "",
          ubicacion: { lat: gps.lat, lng: gps.lng },
          encuestador: brigadista,
        };

        // Vote tier (signal) basado en candidato
        const voteSignal = candPref.nombre === "Guillermo Aliaga"
          ? (Math.random() > 0.3 ? "voto_duro" : "voto_blando")
          : candPref.nombre === "Ninguno"
          ? "contacto_basura"
          : "voto_blando";

        const notes = {
          comentarios: data.comentarios,
          vote_tier: voteSignal,
          signal_score: voteSignal === "voto_duro" ? randInt(30, 100)
            : voteSignal === "voto_blando" ? randInt(-20, 40) : randInt(-100, -10),
        };

        placeholders.push(
          `($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11})`
        );
        values.push(
          CAMPAIGN_ID,           // $p
          JSON.stringify(data),  // $p+1
          clientId,              // $p+2
          brigadista,            // $p+3
          contactSource,         // $p+4
          status,                // $p+5
          waNumber,              // $p+6
          operatorId,            // $p+7
          habladoAt,             // $p+8
          respondieronAt,        // $p+9
          JSON.stringify(notes), // $p+10
          createdAt,             // $p+11
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
      process.stdout.write(`\r     inserting... ${inserted}/${TOTAL_SUBMISSIONS}`);
    }

    console.log(`\n     ✓ ${inserted} submissions insertados`);

    // ── 5. Claimed contacts (en proceso) ────────────────────────────
    console.log("  [5/6] Simulando contactos reclamados activos...");

    // Tomar 40 contactos "nuevo" y ponerlos como claimed por operadoras activas
    const nuevos = await client.query<{ id: string }>(`
      SELECT id FROM form_submissions
      WHERE campaign_id = $1 AND cms_status = 'nuevo'
      ORDER BY random()
      LIMIT 40
    `, [CAMPAIGN_ID]);

    for (const row of nuevos.rows) {
      const op = rand(operadoraIds);
      await client.query(`
        UPDATE form_submissions
        SET cms_claimed_by = $1, cms_claimed_at = now() - interval '5 minutes' * random() * 20
        WHERE id = $2
      `, [op.id, row.id]);
    }
    console.log(`     ✓ 40 contactos marcados como reclamados activos`);

    // ── 6. Stats ────────────────────────────────────────────────────
    console.log("  [6/6] Calculando resumen...");

    const stats = await client.query(`
      SELECT
        cms_status,
        contact_source,
        COUNT(*) as total,
        COUNT(cms_wa_number) FILTER (WHERE cms_wa_number IS NOT NULL) as con_atribucion
      FROM form_submissions
      WHERE campaign_id = $1
      GROUP BY cms_status, contact_source
      ORDER BY cms_status, contact_source
    `, [CAMPAIGN_ID]);

    const candStats = await client.query(`
      SELECT
        data->>'candidato_preferido' as candidato,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE cms_status = 'respondieron') as respondieron
      FROM form_submissions
      WHERE campaign_id = $1
        AND data->>'candidato_preferido' IS NOT NULL
      GROUP BY data->>'candidato_preferido'
      ORDER BY total DESC
    `, [CAMPAIGN_ID]);

    await client.query("COMMIT");

    console.log("\n  ╔══════════════════════════════════════════════════════════╗");
    console.log("  ║  DEMO SEED COMPLETO                                      ║");
    console.log("  ╠══════════════════════════════════════════════════════════╣");
    console.log("  ║  ESTADOS CMS:                                            ║");
    for (const row of stats.rows) {
      const line = `  ║    ${row.cms_status.padEnd(14)} [${row.contact_source.padEnd(10)}]  ${String(row.total).padStart(5)} (${row.con_atribucion} con WA)`;
      console.log(line.padEnd(61) + "║");
    }
    console.log("  ╠══════════════════════════════════════════════════════════╣");
    console.log("  ║  CANDIDATOS PREFERIDOS:                                  ║");
    for (const row of candStats.rows) {
      const pct = Math.round((row.respondieron / row.total) * 100);
      const line = `  ║    ${String(row.candidato).padEnd(22)}  ${String(row.total).padStart(5)} total   ${String(pct).padStart(3)}% resp`;
      console.log(line.padEnd(61) + "║");
    }
    console.log("  ╚══════════════════════════════════════════════════════════╝\n");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n  ✗ Error — rollback ejecutado:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
