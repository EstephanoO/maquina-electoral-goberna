import { pool } from "../../db";

export type CargoRow = {
  id: number;
  codigo: string;
  nombre: string;
  ambito_geografico: string;
  nivel_id: number;
  nivel_codigo: string;
  nivel_nombre: string;
};

export type OrganizacionPoliticaRow = {
  id: number;
  codigo: string;
  nombre: string;
  siglas: string | null;
};

export type JurisdiccionRow = {
  id: number;
  codigo: string;
  nombre: string;
  parent_id: number | null;
};

export async function listCargos(paisIso2: string, nivelCodigo?: string): Promise<CargoRow[]> {
  const params: unknown[] = [paisIso2];
  let where = "p.iso2 = $1";
  if (nivelCodigo) {
    params.push(nivelCodigo);
    where += ` AND ng.codigo = $${params.length}`;
  }
  const { rows } = await pool.query<CargoRow>(
    `SELECT cg.id, cg.codigo, cg.nombre, cg.ambito_geografico,
            ng.id AS nivel_id, ng.codigo AS nivel_codigo, ng.nombre AS nivel_nombre
       FROM catalogos.cargo_gobierno cg
       JOIN catalogos.nivel_gobierno ng ON ng.id = cg.id_nivel_gobierno
       JOIN catalogos.pais p ON p.id = ng.id_pais
      WHERE ${where}
      ORDER BY ng.id, cg.id`,
    params,
  );
  return rows;
}

export async function listOrganizacionesPoliticas(
  paisIso2: string,
): Promise<OrganizacionPoliticaRow[]> {
  const { rows } = await pool.query<OrganizacionPoliticaRow>(
    `SELECT op.id, op.codigo, op.nombre, op.siglas
       FROM catalogos.organizacion_politica op
       JOIN catalogos.pais p ON p.id = op.id_pais
      WHERE p.iso2 = $1
      ORDER BY op.nombre`,
    [paisIso2],
  );
  return rows;
}

/**
 * Stub: las tablas geografia_politica.* no existen en este repo todavía
 * (migrations del geógrafo no commiteadas). Devolvemos array vacío hasta
 * que ese PR se cierre. El wizard debe tolerar este estado.
 */
export async function listJurisdicciones(
  _ambito: string,
  _parentId: number | null,
): Promise<JurisdiccionRow[]> {
  return [];
}
