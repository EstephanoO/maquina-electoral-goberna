import { pool } from "../../db";
import type { CreateRegionalLeaderInput, RegionalLeaderRow } from "./schemas";

export async function create(input: CreateRegionalLeaderInput): Promise<RegionalLeaderRow> {
  const { rows } = await pool.query<RegionalLeaderRow>(
    `INSERT INTO regional_leaders
       (nombres, apellidos, departamento, provincia, distrito, dni, celular, direccion_domicilio)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, nombres, apellidos, departamento, provincia, distrito,
               dni, celular, direccion_domicilio, created_at`,
    [
      input.nombres,
      input.apellidos,
      input.departamento,
      input.provincia,
      input.distrito,
      input.dni,
      input.celular,
      input.direccion_domicilio,
    ],
  );

  return rows[0]!;
}

export async function list(limit = 50, offset = 0): Promise<{ regional_leaders: RegionalLeaderRow[]; total: number }> {
  const [dataRes, countRes] = await Promise.all([
    pool.query<RegionalLeaderRow>(
      `SELECT id, nombres, apellidos, departamento, provincia, distrito,
              dni, celular, direccion_domicilio, created_at
       FROM regional_leaders
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query<{ count: string }>("SELECT count(*)::text AS count FROM regional_leaders"),
  ]);

  return {
    regional_leaders: dataRes.rows,
    total: Number(countRes.rows[0]?.count ?? 0),
  };
}
