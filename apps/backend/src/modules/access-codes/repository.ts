import { randomBytes } from "node:crypto";
import { pool } from "../../db";

export type AccessCodeRow = {
  id: string;
  campaign_id: string;
  code: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

export type AccessCodeWithCampaign = AccessCodeRow & {
  campaign_name: string;
  campaign_slug: string;
};

// Genera un codigo de 4 caracteres alfanumerico (sin caracteres confusos: 0/O, 1/I/L)
function generateAccessCode(): string {
  const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) {
    code += CHARSET[bytes[i]! % CHARSET.length];
  }
  return code;
}

export async function getOrCreateForCampaign(
  campaignId: string,
  createdBy: string,
): Promise<AccessCodeRow> {
  // Intentar obtener el existente
  const existing = await findByCampaign(campaignId);
  if (existing) return existing;

  // Crear uno nuevo con reintentos ante colision de unicidad
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateAccessCode();
    try {
      const { rows } = await pool.query<AccessCodeRow>(
        `INSERT INTO campaign_access_codes (campaign_id, code, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, campaign_id, code, created_by, created_at, updated_at`,
        [campaignId, code, createdBy],
      );
      return rows[0]!;
    } catch (err: unknown) {
      // 23505 = unique_violation en PostgreSQL
      const pgErr = err as { code?: string };
      if (pgErr?.code === "23505") continue;
      throw err;
    }
  }
  throw new Error("No se pudo generar un codigo de acceso unico despues de 10 intentos");
}

export async function regenerateForCampaign(
  campaignId: string,
  createdBy: string,
): Promise<AccessCodeRow> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateAccessCode();
    try {
      const { rows } = await pool.query<AccessCodeRow>(
        `INSERT INTO campaign_access_codes (campaign_id, code, created_by, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (campaign_id) DO UPDATE
           SET code = EXCLUDED.code,
               created_by = EXCLUDED.created_by,
               updated_at = now()
         RETURNING id, campaign_id, code, created_by, created_at, updated_at`,
        [campaignId, code, createdBy],
      );
      return rows[0]!;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      // Si hay colision de codigo unico global, reintentar con otro codigo
      if (pgErr?.code === "23505") continue;
      throw err;
    }
  }
  throw new Error("No se pudo generar un codigo de acceso unico despues de 10 intentos");
}

export async function findByCampaign(campaignId: string): Promise<AccessCodeRow | null> {
  const { rows } = await pool.query<AccessCodeRow>(
    `SELECT id, campaign_id, code, created_by, created_at, updated_at
     FROM campaign_access_codes
     WHERE campaign_id = $1`,
    [campaignId],
  );
  return rows[0] ?? null;
}

export async function findByCode(code: string): Promise<AccessCodeWithCampaign | null> {
  const { rows } = await pool.query<AccessCodeWithCampaign>(
    `SELECT ac.id, ac.campaign_id, ac.code, ac.created_by, ac.created_at, ac.updated_at,
            c.name AS campaign_name, c.slug AS campaign_slug
     FROM campaign_access_codes ac
     JOIN campaigns c ON c.id = ac.campaign_id
     WHERE ac.code = $1 AND c.status = 'active'`,
    [code.trim().toUpperCase()],
  );
  return rows[0] ?? null;
}
