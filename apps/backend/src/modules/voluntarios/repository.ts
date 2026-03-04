import { pool } from "../../db";
import type { CreateVoluntarioInput, VoluntarioRow } from "./schemas";

export async function create(input: CreateVoluntarioInput): Promise<VoluntarioRow> {
  // Resolve campaign id from slug if provided
  let candidatoId: string | null = null;
  if (input.candidato_slug) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM campaigns WHERE slug = $1 AND status = 'active' LIMIT 1`,
      [input.candidato_slug],
    );
    candidatoId = rows[0]?.id ?? null;
  }

  const { rows } = await pool.query<VoluntarioRow>(
    `INSERT INTO voluntarios
       (nombre_completo, telefono, departamento, provincia, distrito, rango_edad, candidato_id, candidato_slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, nombre_completo, telefono, departamento, provincia, distrito,
               rango_edad, candidato_id, candidato_slug, created_at`,
    [
      input.nombre_completo,
      input.telefono,
      input.departamento,
      input.provincia,
      input.distrito,
      input.rango_edad,
      candidatoId,
      input.candidato_slug ?? null,
    ],
  );
  return rows[0]!;
}

export async function list(
  limit = 50,
  offset = 0,
  candidatoSlug?: string,
): Promise<{ voluntarios: VoluntarioRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (candidatoSlug) {
    params.push(candidatoSlug);
    conditions.push(`v.candidato_slug = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(limit, offset);

  const [dataRes, countRes] = await Promise.all([
    pool.query<VoluntarioRow>(
      `SELECT id, nombre_completo, telefono, departamento, provincia, distrito,
              rango_edad, candidato_id, candidato_slug, created_at
       FROM voluntarios v
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM voluntarios v ${where}`,
      conditions.length ? params.slice(0, -2) : [],
    ),
  ]);

  return {
    voluntarios: dataRes.rows,
    total: Number(countRes.rows[0]?.count ?? 0),
  };
}
