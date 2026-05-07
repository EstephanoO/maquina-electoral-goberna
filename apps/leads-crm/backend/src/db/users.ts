import { sql } from "../sql.js";
import type { Operator } from "./types.js";

/**
 * Operators (users en la DB) — listado para asignar sends desde la UI.
 * Por ahora no exponemos CRUD de usuarios — eso vive en auth.ts (register/login).
 */
export async function listOperators(): Promise<Operator[]> {
  const rows = await sql`SELECT id, email, name, phone, role FROM users ORDER BY name ASC`;
  return rows.map((r: any) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    phone: r.phone ?? null,
    role: r.role,
  }));
}
