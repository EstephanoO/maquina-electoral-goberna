import { pool } from "../../../db";
import type { MagicLinkPurpose } from "./schemas";

export type MagicLinkRow = {
  token: string;
  user_id: string | null;
  phone_e164: string | null;
  purpose: MagicLinkPurpose;
  redirect_url: string | null;
  expires_at: Date;
  consumed_at: Date | null;
  consumed_ip: string | null;
  created_at: Date;
};

const SELECT_COLUMNS = `token, user_id, phone_e164, purpose, redirect_url, expires_at, consumed_at, consumed_ip, created_at`;

export async function create(input: {
  token: string;
  user_id: string | null;
  phone_e164: string | null;
  purpose: MagicLinkPurpose;
  redirect_url: string | null;
  expires_at: Date;
}): Promise<MagicLinkRow> {
  const { rows } = await pool.query<MagicLinkRow>(
    `INSERT INTO magic_links (token, user_id, phone_e164, purpose, redirect_url, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SELECT_COLUMNS}`,
    [input.token, input.user_id, input.phone_e164, input.purpose, input.redirect_url, input.expires_at],
  );
  return rows[0]!;
}

export async function findByToken(token: string): Promise<MagicLinkRow | null> {
  const { rows } = await pool.query<MagicLinkRow>(
    `SELECT ${SELECT_COLUMNS} FROM magic_links WHERE token = $1`,
    [token],
  );
  return rows[0] ?? null;
}

/**
 * Marca el token como consumido. Atomic: solo si todavía no fue consumido y
 * sigue válido (no expirado). Devuelve el row actualizado o null si no se pudo.
 */
export async function consume(token: string, ip: string | null): Promise<MagicLinkRow | null> {
  const { rows } = await pool.query<MagicLinkRow>(
    `UPDATE magic_links
        SET consumed_at = now(), consumed_ip = $2
      WHERE token = $1
        AND consumed_at IS NULL
        AND expires_at > now()
   RETURNING ${SELECT_COLUMNS}`,
    [token, ip],
  );
  return rows[0] ?? null;
}

/** Pruning de tokens expirados (job opcional, no crítico). */
export async function pruneExpired(olderThanDays: number = 30): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM magic_links
       WHERE (consumed_at IS NOT NULL AND consumed_at < now() - $1::interval)
          OR (consumed_at IS NULL AND expires_at < now() - $1::interval)`,
    [`${olderThanDays} days`],
  );
  return rowCount ?? 0;
}
