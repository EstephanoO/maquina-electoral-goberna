import { pool } from "../../db";
import type { CreateLeadInput, LeadRow } from "./schemas";

export async function create(input: CreateLeadInput): Promise<LeadRow> {
  const { rows } = await pool.query<LeadRow>(
    `INSERT INTO leads (nombre, correo, plataforma)
     VALUES ($1, $2, $3)
     RETURNING id, nombre, correo, plataforma, created_at`,
    [input.nombre, input.correo, input.plataforma],
  );
  return rows[0]!;
}

export async function list(limit = 50, offset = 0): Promise<{ leads: LeadRow[]; total: number }> {
  const [dataRes, countRes] = await Promise.all([
    pool.query<LeadRow>(
      `SELECT id, nombre, correo, plataforma, created_at
       FROM leads ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM leads`),
  ]);
  return { leads: dataRes.rows, total: Number(countRes.rows[0]?.count ?? 0) };
}
