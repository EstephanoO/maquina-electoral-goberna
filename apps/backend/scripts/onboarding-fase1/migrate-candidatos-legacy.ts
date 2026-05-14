/**
 * Migra candidatos legacy de `appdb` → `onboarding_fase1`.
 *
 * - Lee appdb.candidatos.candidato + candidatos.postulacion + catálogos
 * - Inserta en onboarding_fase1.candidatos.candidato + postulacion
 * - Idempotente: si el DNI ya existe en onboarding_fase1, skip
 * - Heurística para separar nombres/apellidos: appdb tiene todo en `nombres`
 *   con `apellidos` NULL. Asumimos formato "Nombre Apellido" o
 *   "Nombre1 Nombre2 Apellido1 Apellido2": parte por la mitad.
 * - Estado pipeline:
 *     · postulación presente → 'calificado'
 *     · sin postulación      → 'lead'
 * - Catálogos: mapping appdb → onboarding_fase1 por NOMBRE (insensible a
 *   case+tilde). Si no hay match, postulación se inserta con NULL en
 *   ese campo y se reporta en stderr.
 *
 * Usage:
 *   DATABASE_URL=postgres://...:appdb \
 *   ONBOARDING_DATABASE_URL=postgres://...:onboarding_fase1 \
 *   bun scripts/onboarding-fase1/migrate-candidatos-legacy.ts [--dry-run]
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { getEnv } from "../../src/config/env";
import { parseArgs, normalizeName } from "./_lib/csv";

type AppdbCandidato = {
  id: number;
  nombres: string;
  apellidos: string | null;
  documento_numero: string | null;
  email: string | null;
  telefono_e164: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
  foto_url: string | null;
  created_at: string;
};

type AppdbPostulacion = {
  id_candidato: number;
  id_cargo_gobierno: number;
  id_organizacion_politica: number | null;
  id_departamento: number | null;
  id_provincia: number | null;
  id_distrito: number | null;
  cargo_nombre: string | null;
  partido_nombre: string | null;
};

/** Separa nombres/apellidos. */
function splitNombre(full: string): { nombres: string; apellidos: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { nombres: "—", apellidos: "—" };
  if (parts.length === 1) return { nombres: parts[0]!, apellidos: "(s/d)" };
  if (parts.length === 2) return { nombres: parts[0]!, apellidos: parts[1]! };
  // 3+: mitad nombres, mitad apellidos
  const mid = Math.ceil(parts.length / 2);
  return {
    nombres: parts.slice(0, mid).join(" "),
    apellidos: parts.slice(mid).join(" "),
  };
}

function slugify(nombres: string, apellidos: string): string {
  const base = `${apellidos} ${nombres}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base}-${randomUUID().slice(0, 6)}`;
}

function mapSexoToGenero(sexo: string | null): string | null {
  if (!sexo) return null;
  const s = sexo.toUpperCase();
  if (s === "M") return "masculino";
  if (s === "F") return "femenino";
  if (s === "X") return "otro";
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !!args["dry-run"];

  const env = getEnv();
  if (!env.onboardingDatabaseUrl) {
    console.error("ONBOARDING_DATABASE_URL no configurada");
    process.exit(1);
  }

  const appdb     = new Pool({ connectionString: env.databaseUrl });
  const fase1     = new Pool({ connectionString: env.onboardingDatabaseUrl });

  try {
    // 1) leer candidatos de appdb
    const { rows: candidatos } = await appdb.query<AppdbCandidato>(
      `SELECT id, nombres, apellidos, documento_numero,
              email, telefono_e164,
              fecha_nacimiento::text AS fecha_nacimiento,
              sexo, foto_url, created_at::text AS created_at
         FROM candidatos.candidato
        ORDER BY id`,
    );
    console.log(`[migrate] ${candidatos.length} candidatos en appdb`);

    // 2) leer postulaciones con catálogos resueltos por NOMBRE
    const { rows: postulaciones } = await appdb.query<AppdbPostulacion>(
      `SELECT p.id_candidato, p.id_cargo_gobierno,
              p.id_organizacion_politica,
              p.id_departamento, p.id_provincia, p.id_distrito,
              cg.nombre AS cargo_nombre,
              op.nombre AS partido_nombre
         FROM candidatos.postulacion p
         LEFT JOIN catalogos.cargo_gobierno cg ON cg.id = p.id_cargo_gobierno
         LEFT JOIN catalogos.organizacion_politica op ON op.id = p.id_organizacion_politica
        ORDER BY p.id_candidato`,
    );
    const postPorCandidato = new Map<number, AppdbPostulacion>();
    postulaciones.forEach((p) => postPorCandidato.set(p.id_candidato, p));
    console.log(`[migrate] ${postulaciones.length} postulaciones en appdb`);

    // 3) cargar catálogos de onboarding_fase1 (los del geógrafo) para mapping
    const { rows: cargosFase1 } = await fase1.query<{ id: number; cargo: string }>(
      `SELECT id, cargo FROM fase_1.cargo_gobierno`,
    );
    const cargoMap = new Map<string, number>();
    cargosFase1.forEach((c) => cargoMap.set(normalizeName(c.cargo), c.id));

    const { rows: partidosFase1 } = await fase1.query<{ id: number; nombre: string }>(
      `SELECT id, nombre FROM fase_1.organizacion_politica`,
    );
    const partidoMap = new Map<string, number>();
    partidosFase1.forEach((p) => partidoMap.set(normalizeName(p.nombre), p.id));

    const { rows: procesos } = await fase1.query<{ id: number; codigo_eleccion: string }>(
      `SELECT id, codigo_eleccion FROM fase_1.proceso_electoral ORDER BY id`,
    );
    const procesoDefault = procesos[0]?.id ?? null;
    console.log(`[migrate] catálogos onboarding_fase1: ${cargosFase1.length} cargos, ${partidosFase1.length} partidos, proceso default = ${procesoDefault ? procesos[0]!.codigo_eleccion : "(ninguno)"}`);

    // 4) qué DNIs ya están en onboarding_fase1 (idempotencia)
    const { rows: existing } = await fase1.query<{ dni: string }>(
      `SELECT dni FROM candidatos.candidato WHERE dni IS NOT NULL`,
    );
    const dniExistente = new Set(existing.map((r) => r.dni));

    let inserted = 0;
    let skipped = 0;
    let postulInserted = 0;
    let cargoUnmatched = 0;
    let partidoUnmatched = 0;
    let needsPartidoCreate: string[] = [];

    for (const c of candidatos) {
      const dni = c.documento_numero;
      if (dni && dniExistente.has(dni)) {
        skipped++;
        continue;
      }

      const { nombres, apellidos } = splitNombre(c.nombres);
      const slug = slugify(nombres, apellidos);
      const tienePostulacion = postPorCandidato.has(c.id);
      const estado = tienePostulacion ? "calificado" : "lead";
      const genero = mapSexoToGenero(c.sexo);

      if (dryRun) {
        console.log(`  ${dryRun ? "DRY" : "INS"} ${slug.padEnd(48)} ${(dni ?? "—").padEnd(12)} ${estado.padEnd(12)} ${nombres} / ${apellidos}`);
        inserted++;
        if (tienePostulacion) postulInserted++;
        continue;
      }

      const client = await fase1.connect();
      try {
        await client.query("BEGIN");

        const { rows: insRow } = await client.query<{ id: number }>(
          `INSERT INTO candidatos.candidato
             (slug, nombres, apellidos, dni, telefono, email,
              fecha_nacimiento, genero, foto_url,
              estado_pipeline, creado_en, actualizado_en)
           VALUES ($1, $2, $3, $4, $5, $6,
                   $7, $8, $9,
                   $10, $11, now())
           RETURNING id`,
          [
            slug, nombres, apellidos,
            dni, c.telefono_e164, c.email,
            c.fecha_nacimiento, genero, c.foto_url,
            estado, c.created_at,
          ],
        );
        const newId = insRow[0]!.id;

        await client.query(
          `INSERT INTO candidatos.evento (id_candidato, tipo, payload)
           VALUES ($1, 'migrado_desde_appdb', $2)`,
          [newId, { appdb_candidato_id: c.id, motivo: "migración legacy CRM" }],
        );

        const post = postPorCandidato.get(c.id);
        if (post) {
          // Resolver cargo + partido por nombre
          const cargoId = post.cargo_nombre
            ? cargoMap.get(normalizeName(post.cargo_nombre)) ?? null
            : null;
          if (!cargoId) cargoUnmatched++;

          let partidoId: number | null = null;
          if (post.partido_nombre) {
            partidoId = partidoMap.get(normalizeName(post.partido_nombre)) ?? null;
            if (!partidoId) {
              partidoUnmatched++;
              if (!needsPartidoCreate.includes(post.partido_nombre)) {
                needsPartidoCreate.push(post.partido_nombre);
              }
            }
          }

          if (cargoId && procesoDefault) {
            await client.query(
              `INSERT INTO candidatos.postulacion
                 (id_candidato, id_cargo_gobierno, id_organizacion_politica,
                  id_proceso_electoral, id_departamento, id_provincia, id_distrito)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT DO NOTHING`,
              [
                newId, cargoId, partidoId, procesoDefault,
                post.id_departamento, post.id_provincia, post.id_distrito,
              ],
            );
            postulInserted++;
          } else {
            console.warn(`[migrate] postulación ${c.id}: cargo='${post.cargo_nombre}' (${cargoId ? "OK" : "MISS"}) — skip postulación`);
          }
        }

        await client.query("COMMIT");
        inserted++;
        console.log(`  INS ${slug.padEnd(48)} ${(dni ?? "—").padEnd(12)} ${estado.padEnd(12)} ${nombres} / ${apellidos}`);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`  FAIL appdb_id=${c.id}:`, (e as Error).message);
      } finally {
        client.release();
      }
    }

    console.log(`\n[migrate] OK · candidatos insertados=${inserted} skip(dni-dup)=${skipped} postulaciones=${postulInserted} cargo-unmatched=${cargoUnmatched} partido-unmatched=${partidoUnmatched} ${dryRun ? "(DRY RUN)" : ""}`);
    if (needsPartidoCreate.length > 0) {
      console.log(`\n[migrate] Partidos NO mapeados (estos viajan con id_organizacion_politica=NULL):`);
      needsPartidoCreate.forEach((p) => console.log(`  - ${p}`));
      console.log(`\nPara crearlos en fase_1.organizacion_politica:`);
      console.log(`  INSERT INTO fase_1.organizacion_politica (id_pais, tipo_organizacion, nombre) VALUES`);
      needsPartidoCreate.forEach((p, i) => {
        const sep = i === needsPartidoCreate.length - 1 ? ";" : ",";
        console.log(`    (1, 1, '${p.replace(/'/g, "''")}')${sep}`);
      });
    }
  } finally {
    await appdb.end();
    await fase1.end();
  }
}

main().catch((e) => { console.error("[migrate] FAIL", e); process.exit(1); });
