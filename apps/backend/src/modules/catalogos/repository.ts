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
  geom?: unknown; // GeoJSON object (solo si with_geom=true)
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
 * Lista jurisdicciones del geógrafo (schema geografia_politica.*).
 * Tablas (id SERIAL, nombre): peru_departamentos, peru_provincias, peru_distritos.
 * No hay UBIGEO/codigo formal — exponemos `id` como codigo string.
 *
 * - ambito="departamento": ignora parent_id (todos PE; pais.id=1).
 * - ambito="provincia":   parent_id = id_departamento (requerido).
 * - ambito="distrito":    parent_id = id_provincia    (requerido).
 */
export async function listJurisdicciones(
  ambito: "departamento" | "provincia" | "distrito",
  parentId: number | null,
  withGeom: boolean = false,
): Promise<JurisdiccionRow[]> {
  // Simplificamos la geometría a 0.005° (~500m) para reducir payload.
  // No afecta la visualización a nivel de wizard.
  const geomCol = withGeom
    ? ", ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))::json AS geom"
    : "";

  if (ambito === "departamento") {
    const { rows } = await pool.query<JurisdiccionRow>(
      `SELECT id, id::text AS codigo, departamento AS nombre, id_pais AS parent_id${geomCol}
         FROM geografia_politica.peru_departamentos
        ORDER BY departamento`,
    );
    return rows;
  }
  if (ambito === "provincia") {
    if (parentId == null) return [];
    const { rows } = await pool.query<JurisdiccionRow>(
      `SELECT id, id::text AS codigo, provincia AS nombre, id_departamento AS parent_id${geomCol}
         FROM geografia_politica.peru_provincias
        WHERE id_departamento = $1
        ORDER BY provincia`,
      [parentId],
    );
    return rows;
  }
  // ambito === "distrito"
  if (parentId == null) return [];
  const { rows } = await pool.query<JurisdiccionRow>(
    `SELECT id, id::text AS codigo, distrito AS nombre, id_provincia AS parent_id${geomCol}
       FROM geografia_politica.peru_distritos
      WHERE id_provincia = $1
      ORDER BY distrito`,
    [parentId],
  );
  return rows;
}
