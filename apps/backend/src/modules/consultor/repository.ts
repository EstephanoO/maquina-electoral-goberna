/**
 * Repository del módulo consultor — habilita el flow del MCP server.
 *
 * El consultor solo accede a candidatos asignados via consultor_candidato.
 * findCandidatoContext lo reusamos del módulo onboarding (ya está tested).
 */
import { pool } from "../../db";
import { findCandidatoContext, type CandidatoContext } from "../onboarding/repository";

export interface ConsultorCandidatoRow {
  candidato_id: number;
  user_id: string;
  campaign_id: string;
  campaign_slug: string;
  candidato_nombres: string;
  cargo_codigo: string;
  cargo_nombre: string;
  cargo_ambito: "pais" | "departamento" | "provincia" | "distrito";
  jurisdiccion_label: string;
  organizacion_codigo: string | null;
  organizacion_nombre: string | null;
  organizacion_siglas: string | null;
  foto_url: string | null;
  /** ID del usuario candidato (para el MCP — el consultor lo necesita para llamar findCandidatoContext) */
  candidato_user_id: string | null;
}

/** Verifica si un consultor tiene acceso global (a TODOS los candidatos). */
export async function consultorHasGlobalAccess(consultorUserId: string): Promise<boolean> {
  const { rows } = await pool.query<{ x: number }>(
    `SELECT 1 AS x FROM public.consultor_global_access WHERE consultor_user_id = $1 LIMIT 1`,
    [consultorUserId],
  );
  return rows.length > 0;
}

/**
 * Lista los candidatos asignados a un consultor con un resumen para mostrar
 * en el listado del MCP. NO trae el contexto completo (ese es el endpoint
 * `:id/context`).
 *
 * Si el consultor está en consultor_global_access, devuelve TODOS los
 * candidatos (presentes y futuros).
 */
export async function listConsultorCandidates(
  consultorUserId: string,
): Promise<ConsultorCandidatoRow[]> {
  // Global access → atajo: lista todos los candidatos
  if (await consultorHasGlobalAccess(consultorUserId)) {
    return listAllCandidatesForAdmin();
  }
  const { rows } = await pool.query<ConsultorCandidatoRow>(
    `SELECT
        cand.id           AS candidato_id,
        u.id              AS candidato_user_id,
        u.id              AS user_id,
        c.id              AS campaign_id,
        c.slug            AS campaign_slug,
        cand.nombres      AS candidato_nombres,
        cg.codigo         AS cargo_codigo,
        cg.nombre         AS cargo_nombre,
        cg.ambito_geografico AS cargo_ambito,
        COALESCE(
          gp_dist.distrito,
          gp_prov.provincia,
          gp_dep.departamento,
          pais.nombre
        )                 AS jurisdiccion_label,
        op.codigo         AS organizacion_codigo,
        op.nombre         AS organizacion_nombre,
        op.siglas         AS organizacion_siglas,
        cand.foto_url
       FROM public.consultor_candidato cc
       JOIN candidatos.candidato cand ON cand.id = cc.candidato_id
       JOIN candidatos.postulacion p  ON p.id_candidato = cand.id
       JOIN public.campaigns c        ON c.id = p.campaign_id
       LEFT JOIN public.user_campaigns uc ON uc.campaign_id = c.id AND uc.role = 'candidato'
       LEFT JOIN public.users u           ON u.id = uc.user_id
       JOIN catalogos.cargo_gobierno cg ON cg.id = p.id_cargo_gobierno
       JOIN catalogos.nivel_gobierno ng ON ng.id = cg.id_nivel_gobierno
       JOIN catalogos.pais pais ON pais.id = ng.id_pais
       LEFT JOIN geografia_politica.peru_departamentos gp_dep  ON gp_dep.id  = p.id_departamento
       LEFT JOIN geografia_politica.peru_provincias    gp_prov ON gp_prov.id = p.id_provincia
       LEFT JOIN geografia_politica.peru_distritos     gp_dist ON gp_dist.id = p.id_distrito
       LEFT JOIN catalogos.organizacion_politica       op      ON op.id      = p.id_organizacion_politica
      WHERE cc.consultor_user_id = $1
      ORDER BY cc.assigned_at DESC`,
    [consultorUserId],
  );
  return rows;
}

/**
 * Verifica que un consultor tenga acceso a un candidato (asignado en
 * consultor_candidato O en consultor_global_access). Devuelve el user_id
 * del candidato si existe, para poder llamar findCandidatoContext después.
 */
export async function checkConsultorAccessAndGetCandidatoUserId(
  consultorUserId: string,
  candidatoId: number,
): Promise<string | null> {
  // Path global: si el consultor tiene acceso global, devolver el user_id
  // del candidato directo (sin filtro por consultor_candidato).
  if (await consultorHasGlobalAccess(consultorUserId)) {
    const { rows } = await pool.query<{ user_id: string }>(
      `SELECT u.id AS user_id
         FROM candidatos.candidato cand
         JOIN candidatos.postulacion p  ON p.id_candidato = cand.id
         JOIN public.user_campaigns uc  ON uc.campaign_id = p.campaign_id AND uc.role = 'candidato'
         JOIN public.users u            ON u.id = uc.user_id
        WHERE cand.id = $1
        LIMIT 1`,
      [candidatoId],
    );
    return rows[0]?.user_id ?? null;
  }

  const { rows } = await pool.query<{ user_id: string | null }>(
    `SELECT u.id AS user_id
       FROM public.consultor_candidato cc
       JOIN candidatos.candidato cand ON cand.id = cc.candidato_id
       JOIN candidatos.postulacion p  ON p.id_candidato = cand.id
       JOIN public.user_campaigns uc  ON uc.campaign_id = p.campaign_id AND uc.role = 'candidato'
       JOIN public.users u            ON u.id = uc.user_id
      WHERE cc.consultor_user_id = $1
        AND cc.candidato_id = $2
      LIMIT 1`,
    [consultorUserId, candidatoId],
  );
  return rows[0]?.user_id ?? null;
}

/**
 * Trae el contexto completo del candidato (reusa findCandidatoContext) si
 * el consultor tiene acceso.
 */
export async function getCandidatoContextForConsultor(
  consultorUserId: string,
  candidatoId: number,
): Promise<CandidatoContext | null> {
  const candidatoUserId = await checkConsultorAccessAndGetCandidatoUserId(
    consultorUserId,
    candidatoId,
  );
  if (!candidatoUserId) return null;
  return findCandidatoContext(candidatoUserId);
}

/**
 * Asignación admin-only: crea/actualiza un row de consultor_candidato.
 */
export async function assignCandidatoToConsultor(
  consultorUserId: string,
  candidatoId: number,
  campaignId: string | null,
  assignedBy: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO public.consultor_candidato (consultor_user_id, candidato_id, campaign_id, assigned_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (consultor_user_id, candidato_id) DO UPDATE
       SET campaign_id = EXCLUDED.campaign_id,
           assigned_by = EXCLUDED.assigned_by,
           assigned_at = now()`,
    [consultorUserId, candidatoId, campaignId, assignedBy],
  );
}

export async function unassignCandidatoFromConsultor(
  consultorUserId: string,
  candidatoId: number,
): Promise<void> {
  await pool.query(
    `DELETE FROM public.consultor_candidato
      WHERE consultor_user_id = $1 AND candidato_id = $2`,
    [consultorUserId, candidatoId],
  );
}

/**
 * Versión admin: lista TODOS los candidatos (sin filtro por consultor_candidato).
 * Solo se llama desde routes cuando el caller tiene rol admin.
 */
export async function listAllCandidatesForAdmin(): Promise<ConsultorCandidatoRow[]> {
  const { rows } = await pool.query<ConsultorCandidatoRow>(
    `SELECT
        cand.id           AS candidato_id,
        u.id              AS candidato_user_id,
        u.id              AS user_id,
        c.id              AS campaign_id,
        c.slug            AS campaign_slug,
        cand.nombres      AS candidato_nombres,
        cg.codigo         AS cargo_codigo,
        cg.nombre         AS cargo_nombre,
        cg.ambito_geografico AS cargo_ambito,
        COALESCE(
          gp_dist.distrito,
          gp_prov.provincia,
          gp_dep.departamento,
          pais.nombre
        )                 AS jurisdiccion_label,
        op.codigo         AS organizacion_codigo,
        op.nombre         AS organizacion_nombre,
        op.siglas         AS organizacion_siglas,
        cand.foto_url
       FROM candidatos.candidato cand
       JOIN candidatos.postulacion p  ON p.id_candidato = cand.id
       JOIN public.campaigns c        ON c.id = p.campaign_id
       LEFT JOIN public.user_campaigns uc ON uc.campaign_id = c.id AND uc.role = 'candidato'
       LEFT JOIN public.users u           ON u.id = uc.user_id
       JOIN catalogos.cargo_gobierno cg ON cg.id = p.id_cargo_gobierno
       JOIN catalogos.nivel_gobierno ng ON ng.id = cg.id_nivel_gobierno
       JOIN catalogos.pais pais ON pais.id = ng.id_pais
       LEFT JOIN geografia_politica.peru_departamentos gp_dep  ON gp_dep.id  = p.id_departamento
       LEFT JOIN geografia_politica.peru_provincias    gp_prov ON gp_prov.id = p.id_provincia
       LEFT JOIN geografia_politica.peru_distritos     gp_dist ON gp_dist.id = p.id_distrito
       LEFT JOIN catalogos.organizacion_politica       op      ON op.id      = p.id_organizacion_politica
      ORDER BY cand.created_at DESC NULLS LAST
      LIMIT 200`,
  );
  return rows;
}

// ── Admin helpers (Fase B) ─────────────────────────────────────────────

export interface ConsultorUserSummary {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  has_global_access: boolean;
  assignments_count: number;
  created_at: string;
}

/** Lista todos los users con role=consultor + count asignaciones + has_global_access flag. */
export async function listConsultorUsers(): Promise<ConsultorUserSummary[]> {
  const { rows } = await pool.query<ConsultorUserSummary>(
    `SELECT
        u.id           AS user_id,
        u.full_name,
        u.email,
        u.phone,
        u.status,
        EXISTS (
          SELECT 1 FROM public.consultor_global_access cga
            WHERE cga.consultor_user_id = u.id
        )              AS has_global_access,
        (SELECT COUNT(*)::int FROM public.consultor_candidato cc
           WHERE cc.consultor_user_id = u.id) AS assignments_count,
        u.created_at
       FROM public.users u
      WHERE u.role = 'consultor'
      ORDER BY u.created_at DESC`,
  );
  return rows;
}

/** Lista las asignaciones (candidato_id, candidato_nombres) de un consultor. */
export async function listAssignmentsForConsultor(
  consultorUserId: string,
): Promise<Array<{ candidato_id: number; candidato_nombres: string; assigned_at: string }>> {
  const { rows } = await pool.query<{
    candidato_id: number;
    candidato_nombres: string;
    assigned_at: string;
  }>(
    `SELECT cc.candidato_id, cand.nombres AS candidato_nombres, cc.assigned_at
       FROM public.consultor_candidato cc
       JOIN candidatos.candidato cand ON cand.id = cc.candidato_id
      WHERE cc.consultor_user_id = $1
      ORDER BY cc.assigned_at DESC`,
    [consultorUserId],
  );
  return rows;
}

export async function grantGlobalAccess(
  consultorUserId: string,
  grantedBy: string,
  notes: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO public.consultor_global_access (consultor_user_id, granted_by, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (consultor_user_id) DO UPDATE
       SET granted_by = EXCLUDED.granted_by,
           notes      = EXCLUDED.notes,
           granted_at = now()`,
    [consultorUserId, grantedBy, notes],
  );
}

export async function revokeGlobalAccess(consultorUserId: string): Promise<void> {
  await pool.query(
    `DELETE FROM public.consultor_global_access WHERE consultor_user_id = $1`,
    [consultorUserId],
  );
}

/** Versión admin de getCandidatoContext — sin filtro por consultor_candidato. */
export async function adminGetCandidatoContext(
  candidatoId: number,
): Promise<CandidatoContext | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT u.id AS user_id
       FROM candidatos.candidato cand
       JOIN candidatos.postulacion p ON p.id_candidato = cand.id
       JOIN public.user_campaigns uc ON uc.campaign_id = p.campaign_id AND uc.role = 'candidato'
       JOIN public.users u           ON u.id = uc.user_id
      WHERE cand.id = $1
      LIMIT 1`,
    [candidatoId],
  );
  if (!rows[0]) return null;
  return findCandidatoContext(rows[0].user_id);
}
