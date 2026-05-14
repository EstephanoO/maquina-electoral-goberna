/**
 * Candidatos repo — CRUD del pipeline del CRM en `onboarding_fase1`.
 *
 * Operaciones:
 * - create / get / update / list candidato
 * - upsert postulación (1:1 con candidato + proceso_electoral)
 * - agregar fórmula (compañeros de fórmula)
 * - agregar nota interna
 * - transicionar estado_pipeline (registra evento auditable)
 *
 * Convenciones:
 * - `slug` se genera al crear, URL-safe, único.
 * - `creado_por_user_id` viene del request authenticated (UUID de appdb).
 * - Cada operación que cambia estado_pipeline registra fila en candidatos.evento.
 */
import { randomUUID } from "node:crypto";

import { getOnboardingPool } from "../../../db";
import type {
  CandidatoCreate,
  CandidatoListQuery,
  CandidatoUpdate,
  EstadoPipeline,
  FormulaCreate,
  NotaCreate,
  PostulacionUpsert,
} from "../_schemas";

export type Candidato = {
  id: number;
  slug: string;
  nombres: string;
  apellidos: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  foto_url: string | null;
  fecha_nacimiento: string | null;
  lugar_nacimiento: string | null;
  genero: string | null;
  estado_pipeline: EstadoPipeline;
  creado_por_user_id: string | null;
  exported_user_id: string | null;
  exported_at: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type CandidatoDetail = Candidato & {
  postulacion: Postulacion | null;
  formula: Formula[];
  notas: Nota[];
  eventos: Evento[];
};

export type Postulacion = {
  id: number;
  id_candidato: number;
  id_cargo_gobierno: number | null;
  id_organizacion_politica: number | null;
  id_proceso_electoral: number | null;
  id_departamento: number | null;
  id_provincia: number | null;
  id_distrito: number | null;
  cargo_nombre: string | null;
  organizacion_nombre: string | null;
  proceso_descripcion: string | null;
  departamento_nombre: string | null;
  provincia_nombre: string | null;
  distrito_nombre: string | null;
};

export type Formula = {
  id: number;
  orden: number;
  nombres: string;
  apellidos: string;
  dni: string | null;
  cargo_companero: string | null;
  notas: string | null;
};

export type Nota = {
  id: number;
  user_id: string | null;
  texto: string;
  creado_en: string;
};

export type Evento = {
  id: number;
  tipo: string;
  user_id: string | null;
  payload: unknown;
  ocurrido_en: string;
};

export class SlugConflictError extends Error {}
export class DniConflictError extends Error {}
export class CandidatoNotFoundError extends Error {}

// ── helpers ───────────────────────────────────────────────────────

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

const CANDIDATO_SELECT = `
  id, slug, nombres, apellidos, dni, telefono, email, foto_url,
  fecha_nacimiento::text AS fecha_nacimiento, lugar_nacimiento, genero,
  estado_pipeline, creado_por_user_id::text AS creado_por_user_id,
  exported_user_id::text AS exported_user_id,
  exported_at::text AS exported_at,
  creado_en::text AS creado_en, actualizado_en::text AS actualizado_en
`;

// ── candidato CRUD ────────────────────────────────────────────────

export async function createCandidato(
  input: CandidatoCreate,
  creadoPorUserId: string,
): Promise<Candidato> {
  const pool = getOnboardingPool();
  const slug = slugify(input.nombres, input.apellidos);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validar conflicto DNI (si lo trae)
    if (input.dni) {
      const { rows } = await client.query(
        `SELECT 1 FROM candidatos.candidato WHERE dni = $1`,
        [input.dni],
      );
      if (rows[0]) {
        await client.query("ROLLBACK");
        throw new DniConflictError(`Ya existe candidato con DNI ${input.dni}`);
      }
    }

    const { rows } = await client.query<Candidato>(
      `INSERT INTO candidatos.candidato
        (slug, nombres, apellidos, dni, telefono, email,
         fecha_nacimiento, lugar_nacimiento, genero,
         creado_por_user_id, estado_pipeline)
       VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9, $10, 'lead')
       RETURNING ${CANDIDATO_SELECT}`,
      [
        slug, input.nombres, input.apellidos,
        input.dni ?? null, input.telefono ?? null, input.email ?? null,
        input.fecha_nacimiento ?? null, input.lugar_nacimiento ?? null,
        input.genero ?? null,
        creadoPorUserId,
      ],
    );

    await client.query(
      `INSERT INTO candidatos.evento (id_candidato, tipo, user_id, payload)
       VALUES ($1, 'creado', $2, $3)`,
      [rows[0]!.id, creadoPorUserId, { nombres: input.nombres, apellidos: input.apellidos }],
    );

    await client.query("COMMIT");
    return rows[0]!;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function getCandidatoBySlug(slug: string): Promise<CandidatoDetail | null> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<Candidato>(
    `SELECT ${CANDIDATO_SELECT} FROM candidatos.candidato WHERE slug = $1`,
    [slug],
  );
  const cand = rows[0];
  if (!cand) return null;

  const [postulacion, formula, notas, eventos] = await Promise.all([
    getPostulacion(cand.id),
    listFormula(cand.id),
    listNotas(cand.id, 50),
    listEventos(cand.id, 50),
  ]);

  return { ...cand, postulacion, formula, notas, eventos };
}

export async function listCandidatos(query: CandidatoListQuery): Promise<{
  items: Candidato[];
  total: number;
}> {
  const pool = getOnboardingPool();
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.estado) {
    params.push(query.estado);
    where.push(`estado_pipeline = $${params.length}`);
  }
  if (query.creado_por) {
    params.push(query.creado_por);
    where.push(`creado_por_user_id = $${params.length}::uuid`);
  }
  if (query.q) {
    params.push(`%${query.q}%`);
    where.push(`(nombres ILIKE $${params.length} OR apellidos ILIKE $${params.length} OR dni ILIKE $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  params.push(query.limit, query.offset);
  const { rows } = await pool.query<Candidato>(
    `SELECT ${CANDIDATO_SELECT}
       FROM candidatos.candidato
       ${whereSql}
       ORDER BY creado_en DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const { rows: countRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM candidatos.candidato ${whereSql}`,
    params.slice(0, params.length - 2),
  );

  return { items: rows, total: Number(countRows[0]?.total ?? 0) };
}

export async function updateCandidato(
  slug: string,
  input: CandidatoUpdate,
  userId: string,
): Promise<Candidato | null> {
  const pool = getOnboardingPool();
  const fields: string[] = [];
  const params: unknown[] = [];

  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    params.push(v);
    fields.push(`${k} = $${params.length}`);
  }
  if (fields.length === 0) {
    const existing = await pool.query<Candidato>(
      `SELECT ${CANDIDATO_SELECT} FROM candidatos.candidato WHERE slug = $1`,
      [slug],
    );
    return existing.rows[0] ?? null;
  }

  fields.push(`actualizado_en = now()`);
  params.push(slug);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Candidato>(
      `UPDATE candidatos.candidato
          SET ${fields.join(", ")}
        WHERE slug = $${params.length}
       RETURNING ${CANDIDATO_SELECT}`,
      params,
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `INSERT INTO candidatos.evento (id_candidato, tipo, user_id, payload)
       VALUES ($1, 'campo_actualizado', $2, $3)`,
      [rows[0].id, userId, input],
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── postulación ───────────────────────────────────────────────────

export async function getPostulacion(idCandidato: number): Promise<Postulacion | null> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<Postulacion>(
    `SELECT p.id, p.id_candidato, p.id_cargo_gobierno, p.id_organizacion_politica,
            p.id_proceso_electoral, p.id_departamento, p.id_provincia, p.id_distrito,
            c.cargo AS cargo_nombre,
            o.nombre AS organizacion_nombre,
            e.descripcion AS proceso_descripcion,
            dep.departamento AS departamento_nombre,
            prov.provincia AS provincia_nombre,
            dist.distrito AS distrito_nombre
       FROM candidatos.postulacion p
       LEFT JOIN fase_1.cargo_gobierno c        ON c.id = p.id_cargo_gobierno
       LEFT JOIN fase_1.organizacion_politica o ON o.id = p.id_organizacion_politica
       LEFT JOIN fase_1.proceso_electoral e     ON e.id = p.id_proceso_electoral
       LEFT JOIN geografia_politica.peru_departamentos dep ON dep.id = p.id_departamento
       LEFT JOIN geografia_politica.peru_provincias prov   ON prov.id = p.id_provincia
       LEFT JOIN geografia_politica.peru_distritos dist    ON dist.id = p.id_distrito
      WHERE p.id_candidato = $1
      LIMIT 1`,
    [idCandidato],
  );
  return rows[0] ?? null;
}

export async function upsertPostulacion(
  idCandidato: number,
  input: PostulacionUpsert,
  userId: string,
): Promise<Postulacion> {
  const pool = getOnboardingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO candidatos.postulacion
         (id_candidato, id_cargo_gobierno, id_organizacion_politica,
          id_proceso_electoral, id_departamento, id_provincia, id_distrito)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id_candidato, id_proceso_electoral) DO UPDATE SET
         id_cargo_gobierno        = EXCLUDED.id_cargo_gobierno,
         id_organizacion_politica = EXCLUDED.id_organizacion_politica,
         id_departamento          = EXCLUDED.id_departamento,
         id_provincia             = EXCLUDED.id_provincia,
         id_distrito              = EXCLUDED.id_distrito,
         actualizado_en           = now()`,
      [
        idCandidato,
        input.id_cargo_gobierno,
        input.id_organizacion_politica ?? null,
        input.id_proceso_electoral,
        input.id_departamento ?? null,
        input.id_provincia ?? null,
        input.id_distrito ?? null,
      ],
    );

    // Si candidato está en 'lead', subirlo a 'calificado'
    await client.query(
      `UPDATE candidatos.candidato
          SET estado_pipeline = 'calificado', actualizado_en = now()
        WHERE id = $1 AND estado_pipeline = 'lead'`,
      [idCandidato],
    );

    await client.query(
      `INSERT INTO candidatos.evento (id_candidato, tipo, user_id, payload)
       VALUES ($1, 'postulacion_actualizada', $2, $3)`,
      [idCandidato, userId, input],
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  return (await getPostulacion(idCandidato))!;
}

// ── fórmula ───────────────────────────────────────────────────────

export async function listFormula(idCandidato: number): Promise<Formula[]> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<Formula>(
    `SELECT id, orden, nombres, apellidos, dni, cargo_companero, notas
       FROM candidatos.formula
      WHERE id_candidato = $1
      ORDER BY orden`,
    [idCandidato],
  );
  return rows;
}

export async function addFormula(idCandidato: number, input: FormulaCreate, userId: string): Promise<Formula> {
  const pool = getOnboardingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Formula>(
      `INSERT INTO candidatos.formula
         (id_candidato, orden, nombres, apellidos, dni, cargo_companero, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id_candidato, orden) DO UPDATE SET
         nombres = EXCLUDED.nombres,
         apellidos = EXCLUDED.apellidos,
         dni = EXCLUDED.dni,
         cargo_companero = EXCLUDED.cargo_companero,
         notas = EXCLUDED.notas
       RETURNING id, orden, nombres, apellidos, dni, cargo_companero, notas`,
      [idCandidato, input.orden, input.nombres, input.apellidos,
       input.dni ?? null, input.cargo_companero ?? null, input.notas ?? null],
    );
    await client.query(
      `INSERT INTO candidatos.evento (id_candidato, tipo, user_id, payload)
       VALUES ($1, 'formula_actualizada', $2, $3)`,
      [idCandidato, userId, input],
    );
    await client.query("COMMIT");
    return rows[0]!;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── notas ─────────────────────────────────────────────────────────

export async function listNotas(idCandidato: number, limit = 50): Promise<Nota[]> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<Nota>(
    `SELECT id, user_id::text AS user_id, texto, creado_en::text AS creado_en
       FROM candidatos.nota
      WHERE id_candidato = $1
      ORDER BY creado_en DESC
      LIMIT $2`,
    [idCandidato, limit],
  );
  return rows;
}

export async function addNota(idCandidato: number, input: NotaCreate, userId: string): Promise<Nota> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<Nota>(
    `INSERT INTO candidatos.nota (id_candidato, user_id, texto)
     VALUES ($1, $2, $3)
     RETURNING id, user_id::text AS user_id, texto, creado_en::text AS creado_en`,
    [idCandidato, userId, input.texto],
  );
  return rows[0]!;
}

// ── eventos ───────────────────────────────────────────────────────

export async function listEventos(idCandidato: number, limit = 50): Promise<Evento[]> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<Evento>(
    `SELECT id, tipo, user_id::text AS user_id, payload, ocurrido_en::text AS ocurrido_en
       FROM candidatos.evento
      WHERE id_candidato = $1
      ORDER BY ocurrido_en DESC
      LIMIT $2`,
    [idCandidato, limit],
  );
  return rows;
}

// ── transición de estado ──────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<EstadoPipeline, EstadoPipeline[]> = {
  lead:       ["calificado", "rechazado", "pausado"],
  calificado: ["en_pitch", "rechazado", "pausado", "lead"],
  en_pitch:   ["aprobado", "rechazado", "pausado", "calificado"],
  aprobado:   [],
  rechazado:  ["lead"],
  pausado:    ["lead", "calificado", "en_pitch"],
};

export class TransicionInvalidaError extends Error {}

export async function transicionar(
  slug: string,
  nuevoEstado: EstadoPipeline,
  userId: string,
  motivo?: string,
): Promise<Candidato> {
  const pool = getOnboardingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existing } = await client.query<{ id: number; estado_pipeline: EstadoPipeline }>(
      `SELECT id, estado_pipeline FROM candidatos.candidato WHERE slug = $1 FOR UPDATE`,
      [slug],
    );
    const cand = existing[0];
    if (!cand) {
      await client.query("ROLLBACK");
      throw new CandidatoNotFoundError(`Candidato ${slug} no encontrado`);
    }

    if (cand.estado_pipeline === nuevoEstado) {
      await client.query("ROLLBACK");
      // No-op: el cliente ya está en ese estado. Devolver tal cual.
      const { rows } = await pool.query<Candidato>(
        `SELECT ${CANDIDATO_SELECT} FROM candidatos.candidato WHERE slug = $1`,
        [slug],
      );
      return rows[0]!;
    }

    const allowed = ALLOWED_TRANSITIONS[cand.estado_pipeline];
    if (!allowed.includes(nuevoEstado)) {
      await client.query("ROLLBACK");
      throw new TransicionInvalidaError(
        `Transición ${cand.estado_pipeline} → ${nuevoEstado} no permitida`,
      );
    }

    const { rows } = await client.query<Candidato>(
      `UPDATE candidatos.candidato
          SET estado_pipeline = $1, actualizado_en = now()
        WHERE id = $2
       RETURNING ${CANDIDATO_SELECT}`,
      [nuevoEstado, cand.id],
    );

    await client.query(
      `INSERT INTO candidatos.evento (id_candidato, tipo, user_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        cand.id,
        `transicion_${nuevoEstado}`,
        userId,
        { from: cand.estado_pipeline, to: nuevoEstado, motivo: motivo ?? null },
      ],
    );

    await client.query("COMMIT");
    return rows[0]!;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
