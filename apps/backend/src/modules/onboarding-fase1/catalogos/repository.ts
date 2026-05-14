/**
 * Catálogos repo — lee dropdowns curados por el geógrafo en
 * `onboarding_fase1.fase_1.*` y la geografía en `geografia_politica.*`.
 *
 * Todo read-only. El geógrafo es el único que escribe en estas tablas
 * (vía pgAdmin). El backend del producto solo lee.
 */
import { getOnboardingPool } from "../../../db";

export type Cargo = {
  id: number;
  cargo: string;
  id_nivel_gobierno: number;
  nivel: string;
  id_jurisdiccion: number;
  ambito: string;            // 'nacion'/'departamento'/'provincia'/'distrito'
};

export type OrganizacionPolitica = {
  id: number;
  nombre: string;
  tipo: string;
};

export type ProcesoElectoral = {
  id: number;
  codigo: string;
  descripcion: string;
  dia_eleccion: string | null;
};

export type Departamento = { id: number; departamento: string };
export type Provincia    = { id: number; provincia: string; id_departamento: number };
export type Distrito     = { id: number; distrito: string; id_provincia: number; poblacion_total_2025: number };

export async function listCargos(): Promise<Cargo[]> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<Cargo>(
    `SELECT c.id, c.cargo, c.id_nivel_gobierno, n.nivel,
            c.id_jurisdiccion, j.tipo AS ambito
       FROM fase_1.cargo_gobierno c
       JOIN fase_1.nivel_gobierno n ON n.id = c.id_nivel_gobierno
       JOIN geografia_politica.jurisdiccion j ON j.id = c.id_jurisdiccion
      ORDER BY n.id, c.cargo`,
  );
  return rows;
}

export async function listOrganizacionesPoliticas(): Promise<OrganizacionPolitica[]> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<OrganizacionPolitica>(
    `SELECT o.id, o.nombre, t.tipo
       FROM fase_1.organizacion_politica o
       JOIN fase_1.tipo_organizacion t ON t.id = o.tipo_organizacion
      ORDER BY o.nombre`,
  );
  return rows;
}

export async function listProcesosElectorales(): Promise<ProcesoElectoral[]> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<ProcesoElectoral>(
    `SELECT id, codigo_eleccion AS codigo, descripcion, dia_eleccion::text
       FROM fase_1.proceso_electoral
      ORDER BY dia_eleccion DESC NULLS LAST`,
  );
  return rows;
}

export async function listDepartamentos(): Promise<Departamento[]> {
  const pool = getOnboardingPool();
  const { rows } = await pool.query<Departamento>(
    `SELECT id, departamento FROM geografia_politica.peru_departamentos ORDER BY departamento`,
  );
  return rows;
}

export async function listProvincias(idDepartamento?: number): Promise<Provincia[]> {
  const pool = getOnboardingPool();
  if (idDepartamento) {
    const { rows } = await pool.query<Provincia>(
      `SELECT id, provincia, id_departamento
         FROM geografia_politica.peru_provincias
        WHERE id_departamento = $1 ORDER BY provincia`,
      [idDepartamento],
    );
    return rows;
  }
  const { rows } = await pool.query<Provincia>(
    `SELECT id, provincia, id_departamento
       FROM geografia_politica.peru_provincias ORDER BY provincia`,
  );
  return rows;
}

export async function listDistritos(idProvincia?: number): Promise<Distrito[]> {
  const pool = getOnboardingPool();
  if (idProvincia) {
    const { rows } = await pool.query<Distrito>(
      `SELECT id, distrito, id_provincia, poblacion_total_2025
         FROM geografia_politica.peru_distritos
        WHERE id_provincia = $1 ORDER BY distrito`,
      [idProvincia],
    );
    return rows;
  }
  const { rows } = await pool.query<Distrito>(
    `SELECT id, distrito, id_provincia, poblacion_total_2025
       FROM geografia_politica.peru_distritos ORDER BY distrito`,
  );
  return rows;
}
