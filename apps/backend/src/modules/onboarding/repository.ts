import type { PoolClient } from "pg";

import { pool } from "../../db";
import type { ProvisionedInput } from "./schemas";

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
};

// ── Idempotent lookup ───────────────────────────────────────────────

export async function findByNexusTenantId(
  nexusTenantId: string,
): Promise<ProvisionedResult | null> {
  const { rows } = await pool.query<{
    campaign_id: string;
    candidato_id: number;
    postulacion_id: number;
    slug: string;
  }>(
    `SELECT p.campaign_id, p.id_candidato AS candidato_id, p.id AS postulacion_id, c.slug
     FROM candidatos.postulacion p
     JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.nexus_tenant_id = $1`,
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
            fecha_nacimiento, sexo, telefono_e164, email
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id_pais, documento_tipo, documento_numero) DO UPDATE
            SET nombres = EXCLUDED.nombres,
                telefono_e164 = COALESCE(EXCLUDED.telefono_e164, candidatos.candidato.telefono_e164),
                email = COALESCE(EXCLUDED.email, candidatos.candidato.email),
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
        ],
      );
      candidatoId = candidatoUpsert.rows[0]!.id;
    } else {
      const candidatoInsert = await client.query<{ id: number }>(
        `INSERT INTO candidatos.candidato (
            nombres, id_pais, documento_tipo,
            fecha_nacimiento, sexo, telefono_e164, email
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.full_name,
          idPais,
          input.documento_tipo,
          input.fecha_nacimiento ?? null,
          input.sexo ?? null,
          input.telefono_e164 ?? null,
          input.email ?? null,
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

    await client.query("COMMIT");

    return {
      campaign_id: campaignId,
      candidato_id: candidatoId,
      postulacion_id: postulacionId,
      slug: input.slug,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
