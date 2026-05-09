import crypto from "node:crypto";

import type { PoolClient } from "pg";

import { pool } from "../../db";
import type { ProvisionedInput, WizardInput } from "./schemas";

// ── Catalog lookups (cached per process lifetime) ───────────────────
// Los catálogos cambian rara vez (al crear un país nuevo o un cargo).
// Cache simple: si el codigo no está, se busca y se memoiza. Se invalida
// solo reiniciando el proceso. Suficiente para operación normal.

const paisCache = new Map<string, number>();
const rolCache = new Map<string, number>();
const cargoCache = new Map<string, { id: number; ambito: string }>();
const opCache = new Map<string, number>();

async function lookupPais(client: PoolClient, iso2: string): Promise<number | null> {
  const cached = paisCache.get(iso2);
  if (cached) return cached;
  const { rows } = await client.query<{ id: number }>(
    "SELECT id FROM catalogos.pais WHERE iso2 = $1",
    [iso2],
  );
  const id = rows[0]?.id ?? null;
  if (id) paisCache.set(iso2, id);
  return id;
}

async function lookupRolCampana(client: PoolClient, codigo: string): Promise<number | null> {
  const cached = rolCache.get(codigo);
  if (cached) return cached;
  const { rows } = await client.query<{ id: number }>(
    "SELECT id FROM catalogos.rol_campana WHERE codigo = $1",
    [codigo],
  );
  const id = rows[0]?.id ?? null;
  if (id) rolCache.set(codigo, id);
  return id;
}

async function lookupCargo(
  client: PoolClient,
  codigo: string,
): Promise<{ id: number; ambito: string } | null> {
  const cached = cargoCache.get(codigo);
  if (cached) return cached;
  const { rows } = await client.query<{ id: number; ambito_geografico: string }>(
    "SELECT id, ambito_geografico FROM catalogos.cargo_gobierno WHERE codigo = $1",
    [codigo],
  );
  if (!rows[0]) return null;
  const entry = { id: rows[0].id, ambito: rows[0].ambito_geografico };
  cargoCache.set(codigo, entry);
  return entry;
}

async function lookupOrganizacionPolitica(
  client: PoolClient,
  codigo: string,
): Promise<number | null> {
  const cached = opCache.get(codigo);
  if (cached) return cached;
  const { rows } = await client.query<{ id: number }>(
    "SELECT id FROM catalogos.organizacion_politica WHERE codigo = $1",
    [codigo],
  );
  const id = rows[0]?.id ?? null;
  if (id) opCache.set(codigo, id);
  return id;
}

// ── Output shape ────────────────────────────────────────────────────

export type ProvisionedResult = {
  campaign_id: string;
  candidato_id: number;
  postulacion_id: number;
  slug: string;
  user_id: string | null;
};

// ── Idempotent lookup ───────────────────────────────────────────────
// LEFT JOIN user_campaigns con role='candidato' para devolver el user_id
// de la primera invocación. user_id puede ser null si la tabla users no
// existía en la versión vieja del endpoint (rows pre-Fase-3a).

export async function findByNexusTenantId(
  nexusTenantId: string,
): Promise<ProvisionedResult | null> {
  const { rows } = await pool.query<{
    campaign_id: string;
    candidato_id: number;
    postulacion_id: number;
    slug: string;
    user_id: string | null;
  }>(
    `SELECT p.campaign_id,
            p.id_candidato AS candidato_id,
            p.id AS postulacion_id,
            c.slug,
            uc.user_id
     FROM candidatos.postulacion p
     JOIN campaigns c ON c.id = p.campaign_id
     LEFT JOIN user_campaigns uc
       ON uc.campaign_id = p.campaign_id
      AND uc.role = 'candidato'
      AND uc.status = 'active'
     WHERE p.nexus_tenant_id = $1
     LIMIT 1`,
    [nexusTenantId],
  );
  return rows[0] ?? null;
}

// ── Resolution errors ───────────────────────────────────────────────

export class CatalogResolutionError extends Error {
  constructor(public readonly catalog: string, public readonly codigo: string) {
    super(`código '${codigo}' no encontrado en catalogos.${catalog}`);
    this.name = "CatalogResolutionError";
  }
}

export class AmbitoMismatchError extends Error {
  constructor(public readonly ambito: string, public readonly missing: string) {
    super(`cargo con ámbito '${ambito}' requiere ${missing}`);
    this.name = "AmbitoMismatchError";
  }
}

export class SlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(`slug '${slug}' ya está tomado por otra campaña`);
    this.name = "SlugConflictError";
  }
}

export class EmailConflictError extends Error {
  constructor(public readonly email: string) {
    super(`email '${email}' ya está registrado en users`);
    this.name = "EmailConflictError";
  }
}

// ── Main create transaction ─────────────────────────────────────────

export async function provisionFromOnboarding(
  input: ProvisionedInput,
): Promise<ProvisionedResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Resolve catalog codigos → IDs
    const idPais = await lookupPais(client, input.pais_codigo);
    if (!idPais) throw new CatalogResolutionError("pais", input.pais_codigo);

    const idRol = await lookupRolCampana(client, input.rol_campana_codigo);
    if (!idRol) throw new CatalogResolutionError("rol_campana", input.rol_campana_codigo);

    const cargo = await lookupCargo(client, input.cargo_codigo);
    if (!cargo) throw new CatalogResolutionError("cargo_gobierno", input.cargo_codigo);

    let idOp: number | null = null;
    if (input.organizacion_politica_codigo) {
      idOp = await lookupOrganizacionPolitica(client, input.organizacion_politica_codigo);
      if (!idOp) {
        throw new CatalogResolutionError(
          "organizacion_politica",
          input.organizacion_politica_codigo,
        );
      }
    }

    // 2. Validate ámbito vs geo IDs (chk_jurisdiccion_unica ya lo enforces a
    // nivel DB pero damos un error más claro acá).
    const idDep = input.id_departamento ?? null;
    const idProv = input.id_provincia ?? null;
    const idDist = input.id_distrito ?? null;
    switch (cargo.ambito) {
      case "pais":
        // Todas geo deben ser null
        break;
      case "departamento":
        if (!idDep) throw new AmbitoMismatchError("departamento", "id_departamento");
        break;
      case "provincia":
        if (!idProv) throw new AmbitoMismatchError("provincia", "id_provincia");
        break;
      case "distrito":
        if (!idDist) throw new AmbitoMismatchError("distrito", "id_distrito");
        break;
    }

    // 3. UPSERT campaign por slug. Si existe con otro nexus_tenant_id en
    // postulacion, error. Si no existe, insertamos.
    const config: Record<string, unknown> = {
      color_primario: input.primary_color ?? "#1e40af",
      color_secundario: "#fbbf24",
    };
    if (input.slogan) config.slogan = input.slogan;
    if (input.domain) config.domain = input.domain;
    if (input.site_url) config.site_url = input.site_url;
    if (input.mailbox_email) config.mailbox_email = input.mailbox_email;
    if (input.billing_email) config.billing_email = input.billing_email;
    if (input.telefono_e164) {
      // Normalizar al formato sin '+' (convención del backend).
      config.whatsapp_number = input.telefono_e164.replace(/^\+/, "");
    }

    const cargoNombre = await client.query<{ nombre: string }>(
      "SELECT nombre FROM catalogos.cargo_gobierno WHERE id = $1",
      [cargo.id],
    );

    const existingCampaign = await client.query<{ id: string }>(
      "SELECT id FROM campaigns WHERE slug = $1",
      [input.slug],
    );
    if (existingCampaign.rows[0]) {
      throw new SlugConflictError(input.slug);
    }

    const campaignInsert = await client.query<{ id: string }>(
      `INSERT INTO campaigns (name, slug, config, cargo, numero, partido)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.full_name,
        input.slug,
        JSON.stringify(config),
        cargoNombre.rows[0]?.nombre ?? input.cargo_codigo,
        input.numero ?? null,
        input.partido_text ?? null,
      ],
    );
    const campaignId = campaignInsert.rows[0]!.id;

    // 4. UPSERT candidato. Si documento_numero está, intentamos el natural key;
    // si no, insertamos como persona nueva (el wizard no exige DNI).
    let candidatoId: number;
    if (input.documento_numero) {
      const candidatoUpsert = await client.query<{ id: number }>(
        `INSERT INTO candidatos.candidato (
            nombres, id_pais, documento_tipo, documento_numero,
            fecha_nacimiento, sexo, telefono_e164, email, foto_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id_pais, documento_tipo, documento_numero) DO UPDATE
            SET nombres = EXCLUDED.nombres,
                telefono_e164 = COALESCE(EXCLUDED.telefono_e164, candidatos.candidato.telefono_e164),
                email = COALESCE(EXCLUDED.email, candidatos.candidato.email),
                foto_url = COALESCE(EXCLUDED.foto_url, candidatos.candidato.foto_url),
                updated_at = now()
         RETURNING id`,
        [
          input.full_name,
          idPais,
          input.documento_tipo,
          input.documento_numero,
          input.fecha_nacimiento ?? null,
          input.sexo ?? null,
          input.telefono_e164 ?? null,
          input.email ?? null,
          input.foto_url ?? null,
        ],
      );
      candidatoId = candidatoUpsert.rows[0]!.id;
    } else {
      const candidatoInsert = await client.query<{ id: number }>(
        `INSERT INTO candidatos.candidato (
            nombres, id_pais, documento_tipo,
            fecha_nacimiento, sexo, telefono_e164, email, foto_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          input.full_name,
          idPais,
          input.documento_tipo,
          input.fecha_nacimiento ?? null,
          input.sexo ?? null,
          input.telefono_e164 ?? null,
          input.email ?? null,
          input.foto_url ?? null,
        ],
      );
      candidatoId = candidatoInsert.rows[0]!.id;
    }

    // 5. INSERT postulacion. Idempotency vía nexus_tenant_id: si una llamada
    // anterior dejó la postulación creada (pero la respuesta no llegó al
    // caller), la encontramos en el lookup pre-transacción. Acá llegamos
    // solo en el camino feliz.
    const postulacionInsert = await client.query<{ id: number }>(
      `INSERT INTO candidatos.postulacion (
          id_candidato, campaign_id, id_rol_campana, id_cargo_gobierno,
          id_organizacion_politica, id_departamento, id_provincia, id_distrito,
          nexus_tenant_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        candidatoId,
        campaignId,
        idRol,
        cargo.id,
        idOp,
        idDep,
        idProv,
        idDist,
        input.nexus_tenant_id,
      ],
    );
    const postulacionId = postulacionInsert.rows[0]!.id;

    // 6. Crear users row para el candidato. password_hash = NULL (auth via
    // OTP/Firebase post-mig-060). UNIQUE en lower(email) → 23505 si pisa otro
    // user — lo traducimos a EmailConflictError.
    let userId: string;
    try {
      const userInsert = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name, phone, role, status)
         VALUES (lower($1), NULL, $2, $3, 'candidato', 'active')
         RETURNING id`,
        [
          input.email.trim(),
          input.full_name,
          input.telefono_e164 ?? null,
        ],
      );
      userId = userInsert.rows[0]!.id;
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        throw new EmailConflictError(input.email);
      }
      throw err;
    }

    // 7. Linkear user → campaign con rol candidato y permisos plenos.
    await client.query(
      `INSERT INTO user_campaigns (user_id, campaign_id, role, status, perm_tierra, perm_digital)
       VALUES ($1, $2, 'candidato', 'active', true, true)`,
      [userId, campaignId],
    );

    await client.query("COMMIT");

    return {
      campaign_id: campaignId,
      candidato_id: candidatoId,
      postulacion_id: postulacionId,
      slug: input.slug,
      user_id: userId,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Wizard público (apps/web /onboarding) ──────────────────────────────
// Reusa provisionFromOnboarding generando los campos que el wizard no
// pide al user: slug del nombre completo, email sintético <slug>@goberna.club,
// nexus_tenant_id = wizard_<uuid> (UNIQUE en postulacion → idempotente
// en reintentos del mismo browser), telefono normalizado.

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function pickAvailableSlug(client: PoolClient, base: string): Promise<string> {
  const baseSlug = slugify(base) || "candidato";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM campaigns WHERE slug = $1",
      [candidate],
    );
    if (rows.length === 0) return candidate;
  }
  // Fallback: 6-char random suffix
  return `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function provisionFromWizard(
  input: WizardInput,
): Promise<ProvisionedResult> {
  const fullName = `${input.first_name} ${input.last_name}`.trim();
  const phoneE164 = input.phone ? input.phone.replace(/^\+?/, "+") : undefined;

  // pickAvailableSlug abre su propio cliente; nos sirve antes de la TX principal.
  const client = await pool.connect();
  let slug: string;
  let cargoAmbito: string | null;
  try {
    slug = await pickAvailableSlug(client, fullName);
    // Resolvemos el ámbito del cargo aquí para poder pasar SOLO el id
    // de jurisdicción que corresponde (chk_jurisdiccion_unica enforces
    // que solo 1 de departamento/provincia/distrito esté NOT NULL).
    const cargo = await lookupCargo(client, input.cargo_codigo);
    cargoAmbito = cargo?.ambito ?? null;
  } finally {
    client.release();
  }

  const email = `${slug}@goberna.pe`;

  // Filtrar jurisdicción según ámbito del cargo (chk_jurisdiccion_unica).
  // - pais         → ningún id_*
  // - departamento → solo id_departamento
  // - provincia    → solo id_provincia
  // - distrito     → solo id_distrito
  const jurisdiccion: Pick<ProvisionedInput, "id_departamento" | "id_provincia" | "id_distrito"> = {};
  if (cargoAmbito === "departamento" && input.id_departamento) {
    jurisdiccion.id_departamento = input.id_departamento;
  } else if (cargoAmbito === "provincia" && input.id_provincia) {
    jurisdiccion.id_provincia = input.id_provincia;
  } else if (cargoAmbito === "distrito" && input.id_distrito) {
    jurisdiccion.id_distrito = input.id_distrito;
  }

  const provisioned: ProvisionedInput = {
    nexus_tenant_id: `wizard_${crypto.randomUUID()}`,
    full_name: fullName,
    pais_codigo: input.country,
    documento_tipo: "DNI",
    ...(input.documento_numero && { documento_numero: input.documento_numero }),
    ...(phoneE164 && { telefono_e164: phoneE164 }),
    email,
    rol_campana_codigo: input.rol_campana_codigo,
    cargo_codigo: input.cargo_codigo,
    ...(input.organizacion_politica_codigo && {
      organizacion_politica_codigo: input.organizacion_politica_codigo,
    }),
    ...jurisdiccion,
    slug,
    ...(input.foto_url && { foto_url: input.foto_url }),
  };

  return provisionFromOnboarding(provisioned);
}

/** Setea password_hash a un user después del provisionFromWizard. */
export async function setUserPasswordHash(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await pool.query(
    "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
    [passwordHash, userId],
  );
}

// ── Contexto del candidato (Fase 2) ────────────────────────────────────
// Devuelve toda la info del candidato logged-in que Fase 2 muestra:
// - identidad (user, full_name, phone)
// - campaign (id, slug, name)
// - cargo (codigo, nombre, ambito) y nivel
// - jurisdicción (departamento + provincia + distrito si aplica)
// - organización política (codigo, nombre, siglas)
// - has_password (para saber si Fase 3 debe pedir contraseña)

export type CandidatoContext = {
  user: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    has_password: boolean;
    foto_url: string | null;
  };
  campaign: {
    id: string;
    slug: string;
    name: string;
  };
  cargo: {
    codigo: string;
    nombre: string;
    ambito: "pais" | "departamento" | "provincia" | "distrito";
    nivel_codigo: string;
    nivel_nombre: string;
  };
  jurisdiccion: {
    pais: { id: number; nombre: string; iso2: string };
    departamento: { id: number; nombre: string } | null;
    provincia: { id: number; nombre: string } | null;
    distrito: { id: number; nombre: string } | null;
  };
  organizacion_politica: {
    codigo: string;
    nombre: string;
    siglas: string | null;
  } | null;
};

export async function findCandidatoContext(userId: string): Promise<CandidatoContext | null> {
  const { rows } = await pool.query<{
    user_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    has_password: boolean;
    foto_url: string | null;
    campaign_id: string;
    campaign_slug: string;
    campaign_name: string;
    cargo_codigo: string;
    cargo_nombre: string;
    cargo_ambito: "pais" | "departamento" | "provincia" | "distrito";
    nivel_codigo: string;
    nivel_nombre: string;
    pais_id: number;
    pais_nombre: string;
    pais_iso2: string;
    dep_id: number | null;
    dep_nombre: string | null;
    prov_id: number | null;
    prov_nombre: string | null;
    dist_id: number | null;
    dist_nombre: string | null;
    org_codigo: string | null;
    org_nombre: string | null;
    org_siglas: string | null;
  }>(
    `SELECT
        u.id AS user_id,
        u.full_name,
        u.email,
        u.phone,
        (u.password_hash IS NOT NULL) AS has_password,
        cand.foto_url AS foto_url,
        c.id AS campaign_id,
        c.slug AS campaign_slug,
        c.name AS campaign_name,
        cg.codigo AS cargo_codigo,
        cg.nombre AS cargo_nombre,
        cg.ambito_geografico AS cargo_ambito,
        ng.codigo AS nivel_codigo,
        ng.nombre AS nivel_nombre,
        pais.id AS pais_id,
        pais.nombre AS pais_nombre,
        pais.iso2 AS pais_iso2,
        gp_dep.id AS dep_id,
        gp_dep.departamento AS dep_nombre,
        gp_prov.id AS prov_id,
        gp_prov.provincia AS prov_nombre,
        gp_dist.id AS dist_id,
        gp_dist.distrito AS dist_nombre,
        op.codigo AS org_codigo,
        op.nombre AS org_nombre,
        op.siglas AS org_siglas
       FROM users u
       JOIN user_campaigns uc ON uc.user_id = u.id AND uc.role = 'candidato' AND uc.status = 'active'
       JOIN campaigns c       ON c.id = uc.campaign_id
       JOIN candidatos.postulacion p ON p.campaign_id = c.id
       JOIN candidatos.candidato cand ON cand.id = p.id_candidato
       JOIN catalogos.cargo_gobierno cg ON cg.id = p.id_cargo_gobierno
       JOIN catalogos.nivel_gobierno ng ON ng.id = cg.id_nivel_gobierno
       JOIN catalogos.pais pais ON pais.id = ng.id_pais
       LEFT JOIN geografia_politica.peru_departamentos gp_dep ON gp_dep.id = p.id_departamento
       LEFT JOIN geografia_politica.peru_provincias gp_prov ON gp_prov.id = p.id_provincia
       LEFT JOIN geografia_politica.peru_distritos gp_dist ON gp_dist.id = p.id_distrito
       LEFT JOIN catalogos.organizacion_politica op ON op.id = p.id_organizacion_politica
      WHERE u.id = $1
      LIMIT 1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    user: {
      id: r.user_id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      has_password: r.has_password,
      foto_url: r.foto_url,
    },
    campaign: {
      id: r.campaign_id,
      slug: r.campaign_slug,
      name: r.campaign_name,
    },
    cargo: {
      codigo: r.cargo_codigo,
      nombre: r.cargo_nombre,
      ambito: r.cargo_ambito,
      nivel_codigo: r.nivel_codigo,
      nivel_nombre: r.nivel_nombre,
    },
    jurisdiccion: {
      pais: { id: r.pais_id, nombre: r.pais_nombre, iso2: r.pais_iso2 },
      departamento: r.dep_id ? { id: r.dep_id, nombre: r.dep_nombre! } : null,
      provincia: r.prov_id ? { id: r.prov_id, nombre: r.prov_nombre! } : null,
      distrito: r.dist_id ? { id: r.dist_id, nombre: r.dist_nombre! } : null,
    },
    organizacion_politica: r.org_codigo
      ? { codigo: r.org_codigo, nombre: r.org_nombre!, siglas: r.org_siglas }
      : null,
  };
}

// ── Snapshot for the cinematic carta screen ──────────────────────────

export type CandidatoSnapshot = CandidatoContext & {
  geojson: unknown | null;
  bbox: [number, number, number, number] | null;
  centroid: [number, number] | null;
  /** Progreso del candidato — 0..100 por dimensión. */
  progress: {
    onboarding: number;
    territorio: number;
    digital: number;
    datos: number;
  };
  /** Cosas que faltan para que el wizard quede 100%. */
  missing_fields: Array<"foto" | "phone" | "email" | "password" | "organizacion_politica">;
};

/**
 * Devuelve el polígono de la jurisdicción del candidato como GeoJSON +
 * bbox + centroide para que el frontend (Leaflet) zoom-in suave.
 */
async function findJurisdictionPolygon(
  ambito: "pais" | "departamento" | "provincia" | "distrito",
  ids: { dep_id: number | null; prov_id: number | null; dist_id: number | null },
): Promise<{
  geojson: unknown | null;
  bbox: [number, number, number, number] | null;
  centroid: [number, number] | null;
}> {
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
    return { geojson: null, bbox: null, centroid: null };
  }

  const { rows } = await pool.query<{
    geojson: string;
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
    cx: number;
    cy: number;
  }>(
    `SELECT
       ST_AsGeoJSON(ST_Simplify(geom, 0.0005), 6) AS geojson,
       ST_XMin(geom) AS minx,
       ST_YMin(geom) AS miny,
       ST_XMax(geom) AS maxx,
       ST_YMax(geom) AS maxy,
       ST_X(ST_Centroid(geom)) AS cx,
       ST_Y(ST_Centroid(geom)) AS cy
     FROM ${table}
     WHERE id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return { geojson: null, bbox: null, centroid: null };
  return {
    geojson: JSON.parse(r.geojson),
    bbox: [r.minx, r.miny, r.maxx, r.maxy],
    centroid: [r.cx, r.cy],
  };
}

async function computeProgress(campaignId: string, ctx: CandidatoContext): Promise<{
  progress: CandidatoSnapshot["progress"];
  missing_fields: CandidatoSnapshot["missing_fields"];
}> {
  // Onboarding: contamos cuántos de los campos clave están llenos.
  const fields = [
    !!ctx.user.full_name,
    !!ctx.user.email,
    !!ctx.user.phone,
    !!ctx.user.foto_url,
    !!ctx.user.has_password,
    !!ctx.organizacion_politica,
    !!(ctx.jurisdiccion.distrito || ctx.jurisdiccion.provincia || ctx.jurisdiccion.departamento),
  ];
  const onboarding = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  // Territorio: número de zonas + voluntarios. Métrica simple — si hay
  // alguna actividad, reportamos 30+; si no, 0. Refinable después.
  let territorio = 0;
  try {
    const { rows } = await pool.query<{ zonas: number; voluntarios: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM public.zones WHERE campaign_id = $1) AS zonas,
         (SELECT COUNT(*)::int FROM public.users u
            JOIN public.user_campaigns uc ON uc.user_id = u.id
            WHERE uc.campaign_id = $1 AND uc.role IN ('agente_campo','brigadista_zonal')) AS voluntarios`,
      [campaignId],
    );
    const r = rows[0];
    if (r) {
      let s = 0;
      if (r.zonas > 0) s += 40;
      if (r.zonas >= 5) s += 20;
      if (r.voluntarios > 0) s += 20;
      if (r.voluntarios >= 10) s += 20;
      territorio = Math.min(100, s);
    }
  } catch {
    territorio = 0;
  }

  // Digital: cantidad de blast jobs ejecutados + waba conectado.
  let digital = 0;
  try {
    const { rows } = await pool.query<{ blasts: number; waba: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM public.blast_jobs WHERE campaign_id = $1) AS blasts,
         (SELECT COUNT(*)::int FROM public.waba_phones WHERE campaign_id = $1 AND status = 'connected') AS waba`,
      [campaignId],
    );
    const r = rows[0];
    if (r) {
      let s = 0;
      if (r.waba > 0) s += 50;
      if (r.blasts > 0) s += 30;
      if (r.blasts >= 5) s += 20;
      digital = Math.min(100, s);
    }
  } catch {
    digital = 0;
  }

  // Datos: form_definitions activos + form_submissions.
  let datos = 0;
  try {
    const { rows } = await pool.query<{ defs: number; subs: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM public.form_definitions WHERE campaign_id = $1) AS defs,
         (SELECT COUNT(*)::int FROM public.form_submissions WHERE campaign_id = $1) AS subs`,
      [campaignId],
    );
    const r = rows[0];
    if (r) {
      let s = 0;
      if (r.defs > 0) s += 30;
      if (r.defs >= 3) s += 20;
      if (r.subs > 0) s += 30;
      if (r.subs >= 50) s += 20;
      datos = Math.min(100, s);
    }
  } catch {
    datos = 0;
  }

  const missing: CandidatoSnapshot["missing_fields"] = [];
  if (!ctx.user.foto_url) missing.push("foto");
  if (!ctx.user.phone) missing.push("phone");
  if (!ctx.user.email) missing.push("email");
  if (!ctx.user.has_password) missing.push("password");
  if (!ctx.organizacion_politica) missing.push("organizacion_politica");

  return {
    progress: { onboarding, territorio, digital, datos },
    missing_fields: missing,
  };
}

/** Snapshot completo: ctx + polígono + progress. Usado por la pantalla "Carta". */
export async function getCandidatoSnapshot(userId: string): Promise<CandidatoSnapshot | null> {
  const ctx = await findCandidatoContext(userId);
  if (!ctx) return null;
  const poly = await findJurisdictionPolygon(ctx.cargo.ambito, {
    dep_id: ctx.jurisdiccion.departamento?.id ?? null,
    prov_id: ctx.jurisdiccion.provincia?.id ?? null,
    dist_id: ctx.jurisdiccion.distrito?.id ?? null,
  });
  const { progress, missing_fields } = await computeProgress(ctx.campaign.id, ctx);
  return { ...ctx, ...poly, progress, missing_fields };
}

/** Lookup admin: snapshot para cualquier campaign_id. */
export async function getCandidatoSnapshotByCampaign(
  campaignId: string,
): Promise<CandidatoSnapshot | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT u.id AS user_id
       FROM public.user_campaigns uc
       JOIN public.users u ON u.id = uc.user_id
      WHERE uc.campaign_id = $1 AND uc.role = 'candidato' AND uc.status = 'active'
      ORDER BY uc.assigned_at ASC
      LIMIT 1`,
    [campaignId],
  );
  if (!rows[0]) return null;
  return getCandidatoSnapshot(rows[0].user_id);
}
