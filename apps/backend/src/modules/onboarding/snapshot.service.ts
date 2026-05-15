// snapshot.service.ts
// Construye un CandidatoSnapshotPublico dado el slug de una campaign.
// Usado por:
//   - GET /api/onboarding/snapshot/:slug  (público, sin auth)
//   - POST /api/decks/generate-from-onboarding (interno, para generar HTML)

import { pool } from "../../db";
import type { CandidatoSnapshotPublico } from "./snapshot.schemas";
import { estrategiaDescription } from "./snapshot.schemas";

// ── Tipos internos de query ─────────────────────────────────────────────

type CampaignRow = {
  id: string;
  slug: string;
  name: string;
  config: Record<string, unknown>;
};

type PostulacionRow = {
  cargo_codigo: string;
  cargo_nombre: string;
  cargo_ambito: string;
  nivel_nombre: string;
  org_codigo: string | null;
  org_nombre: string | null;
  org_siglas: string | null;
  pais_id: number;
  pais_nombre: string;
  dep_id: number | null;
  dep_nombre: string | null;
  prov_id: number | null;
  prov_nombre: string | null;
  dist_id: number | null;
  dist_nombre: string | null;
  dist_ubigeo: string | null;
  dist_capital: string | null;
  candidato_nombres: string;
  candidato_telefono: string | null;
  candidato_foto_url: string | null;
};

type GeoRow = {
  geojson: string | null;
  area_km2: number | null;
  cx: number | null;
  cy: number | null;
};

// ── GeoJSON helper ──────────────────────────────────────────────────────

async function fetchGeoForAmbito(
  ambito: string,
  ids: { dep_id: number | null; prov_id: number | null; dist_id: number | null },
): Promise<{ geojson: object | null; area_km2: number | null; centroid: [number, number] | null }> {
  let table = "";
  let id: number | null = null;

  if (ambito === "distrito" && ids.dist_id) {
    table = "geografia_politica.peru_distritos";
    id = ids.dist_id;
  } else if (ambito === "provincia" && ids.prov_id) {
    table = "geografia_politica.peru_provincias";
    id = ids.prov_id;
  } else if (ambito === "departamento" && ids.dep_id) {
    table = "geografia_politica.peru_departamentos";
    id = ids.dep_id;
  } else {
    return { geojson: null, area_km2: null, centroid: null };
  }

  try {
    const { rows } = await pool.query<GeoRow>(
      `SELECT
         ST_AsGeoJSON(ST_Simplify(geom, 0.0005), 6) AS geojson,
         ST_Area(ST_Transform(geom, 32718)) / 1000000.0 AS area_km2,
         ST_X(ST_Centroid(geom)) AS cx,
         ST_Y(ST_Centroid(geom)) AS cy
       FROM ${table}
       WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r || !r.geojson) return { geojson: null, area_km2: null, centroid: null };
    return {
      geojson: JSON.parse(r.geojson) as object,
      area_km2: r.area_km2 ?? null,
      centroid: r.cx !== null && r.cy !== null ? [r.cx, r.cy] : null,
    };
  } catch {
    // PostGIS no disponible o geom vacío — fallback graceful
    return { geojson: null, area_km2: null, centroid: null };
  }
}

// ── Main service ────────────────────────────────────────────────────────

/**
 * Construye el CandidatoSnapshotPublico dado el slug de una campaign.
 * Devuelve null si el slug no existe.
 *
 * La campaign puede no tener postulacion aún (wizard incompleto). En ese
 * caso `postulacion` y `territorio` devuelven null y se informan los
 * datos mínimos de `campaigns`.
 */
export async function buildSnapshotBySlug(
  slug: string,
  publicBaseUrl: string,
): Promise<CandidatoSnapshotPublico | null> {
  // 1. Buscar campaign por slug
  const { rows: campRows } = await pool.query<CampaignRow>(
    `SELECT id, slug, name, config FROM campaigns WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  const camp = campRows[0];
  if (!camp) return null;

  const config = (camp.config ?? {}) as Record<string, unknown>;
  const primaryColor =
    typeof config.color_primario === "string" ? config.color_primario : "#1e40af";
  const siteUrl = typeof config.site_url === "string" ? config.site_url : `https://${slug}.goberna.pe`;
  const domain = typeof config.domain === "string" ? config.domain : `${slug}.goberna.pe`;
  const mailboxEmail =
    typeof config.mailbox_email === "string" ? config.mailbox_email : `${slug}@goberna.pe`;
  const dashboardUrl = `${publicBaseUrl}/c/${slug}`;

  // Leer estrategia mode del config si viene
  const estrategiaMode =
    typeof config.estrategia_mode === "string" ? config.estrategia_mode : null;

  // 2. Buscar postulacion del candidato para esta campaign
  let postulacion: CandidatoSnapshotPublico["postulacion"] = null;
  let territorio: CandidatoSnapshotPublico["territorio"] = null;

  const { rows: postRows } = await pool.query<PostulacionRow>(
    `SELECT
       cg.codigo              AS cargo_codigo,
       cg.nombre              AS cargo_nombre,
       cg.ambito_geografico   AS cargo_ambito,
       ng.nombre              AS nivel_nombre,
       op.codigo              AS org_codigo,
       op.nombre              AS org_nombre,
       op.siglas              AS org_siglas,
       pais.id                AS pais_id,
       pais.nombre            AS pais_nombre,
       gp_dep.id              AS dep_id,
       gp_dep.departamento    AS dep_nombre,
       gp_prov.id             AS prov_id,
       gp_prov.provincia      AS prov_nombre,
       gp_dist.id             AS dist_id,
       gp_dist.distrito       AS dist_nombre,
       gp_dist.ubigeo         AS dist_ubigeo,
       gp_dist.capital        AS dist_capital,
       cand.nombres           AS candidato_nombres,
       cand.telefono_e164     AS candidato_telefono,
       cand.foto_url          AS candidato_foto_url
     FROM candidatos.postulacion cp
     JOIN candidatos.candidato cand      ON cand.id = cp.id_candidato
     JOIN catalogos.cargo_gobierno cg    ON cg.id = cp.id_cargo_gobierno
     JOIN catalogos.nivel_gobierno ng    ON ng.id = cg.id_nivel_gobierno
     JOIN catalogos.pais pais            ON pais.id = ng.id_pais
     LEFT JOIN catalogos.organizacion_politica op ON op.id = cp.id_organizacion_politica
     LEFT JOIN geografia_politica.peru_departamentos gp_dep  ON gp_dep.id  = cp.id_departamento
     LEFT JOIN geografia_politica.peru_provincias   gp_prov ON gp_prov.id = cp.id_provincia
     LEFT JOIN geografia_politica.peru_distritos    gp_dist ON gp_dist.id = cp.id_distrito
     WHERE cp.campaign_id = $1
     LIMIT 1`,
    [camp.id],
  );

  const pr = postRows[0];

  // 3. Buscar user principal de la campaign para nombre/teléfono si no hay postulacion row
  let fullName = camp.name;
  let phone: string | null = null;
  let avatarUrl: string | null = null;

  if (pr) {
    fullName = pr.candidato_nombres || camp.name;
    phone = pr.candidato_telefono ?? null;
    avatarUrl = pr.candidato_foto_url ?? null;

    postulacion = {
      cargo: {
        codigo: pr.cargo_codigo,
        nombre: pr.cargo_nombre,
        ambito: pr.cargo_ambito,
      },
      partido: pr.org_codigo
        ? {
            codigo: pr.org_codigo,
            nombre: pr.org_nombre!,
            siglas: pr.org_siglas ?? pr.org_codigo,
          }
        : null,
      nivelGobierno: pr.nivel_nombre,
    };

    // 4. Geo: intentar obtener GeoJSON según ámbito del cargo
    const geoData = await fetchGeoForAmbito(pr.cargo_ambito, {
      dep_id: pr.dep_id ?? null,
      prov_id: pr.prov_id ?? null,
      dist_id: pr.dist_id ?? null,
    });

    territorio = {
      pais: { id: pr.pais_id, nombre: pr.pais_nombre },
      departamento: pr.dep_id ? { id: pr.dep_id, nombre: pr.dep_nombre! } : null,
      provincia: pr.prov_id ? { id: pr.prov_id, nombre: pr.prov_nombre! } : null,
      distrito:
        pr.dist_id
          ? {
              id: pr.dist_id,
              nombre: pr.dist_nombre!,
              ubigeo: pr.dist_ubigeo!,
              capital: pr.dist_capital ?? null,
            }
          : null,
      geojson: geoData.geojson,
      area_km2: geoData.area_km2,
      centroid: geoData.centroid,
    };
  } else {
    // Sin postulación aún: intentar recuperar al menos el nombre del user
    try {
      const { rows: userRows } = await pool.query<{
        full_name: string;
        phone: string | null;
      }>(
        `SELECT u.full_name, u.phone
           FROM users u
           JOIN user_campaigns uc ON uc.user_id = u.id
          WHERE uc.campaign_id = $1
            AND uc.role = 'candidato'
            AND uc.status = 'active'
          LIMIT 1`,
        [camp.id],
      );
      if (userRows[0]) {
        fullName = userRows[0].full_name || camp.name;
        phone = userRows[0].phone ?? null;
      }
    } catch {
      // non-fatal
    }
  }

  return {
    candidato: {
      fullName,
      avatarUrl,
      slug: camp.slug,
      primaryColor,
    },
    postulacion,
    territorio,
    estrategia: {
      mode: estrategiaMode,
      description: estrategiaDescription(estrategiaMode),
    },
    infra: {
      siteUrl,
      dashboardUrl,
      mailboxEmail,
      domain,
    },
    insights: {
      padron_electoral: { available: false },
      nse_ab_pct: { available: false },
      historial_partido: { available: false },
    },
  };
}
