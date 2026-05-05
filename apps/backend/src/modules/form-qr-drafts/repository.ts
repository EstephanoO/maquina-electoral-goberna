import { pool } from "../../db";

export type FormQrDraftRow = {
  token: string;
  campaign_id: string;
  brigadista_id: string;
  form_definition_id: string | null;
  client_id: string;
  payload: {
    data: Record<string, unknown>;
    lat: number | null;
    lng: number | null;
    client_id: string;
    form_definition_id: string | null;
  };
  scanned_at: Date | null;
  consumed_at: Date | null;
  user_agent: string | null;
  created_at: Date;
  expires_at: Date;
  kind: "form" | "share";
};

/**
 * Crea (o devuelve) un token "share-only" de larga vida para que el mobile
 * pueda compartir un link bonito de su QR. Reusa form_qr_drafts con kind='share'
 * + TTL de 30 días + payload vacío. Si el brigadista ya tiene un share token
 * vigente para esta campaign, lo devuelve en vez de crear otro.
 */
export async function getOrCreateShareToken(params: {
  token: string;
  campaign_id: string;
  brigadista_id: string;
}): Promise<FormQrDraftRow> {
  // 1. Buscar share-token vigente (no expirado) del brigadista en esta campaign.
  const existing = await pool.query<FormQrDraftRow>(
    `SELECT * FROM form_qr_drafts
       WHERE brigadista_id = $1
         AND campaign_id   = $2
         AND kind          = 'share'
         AND expires_at    > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
    [params.brigadista_id, params.campaign_id],
  );
  if (existing.rows[0]) return existing.rows[0];

  // 2. No hay vigente → crear uno nuevo con TTL de 30 días.
  const result = await pool.query<FormQrDraftRow>(
    `INSERT INTO form_qr_drafts
       (token, campaign_id, brigadista_id, form_definition_id, client_id,
        payload, kind, expires_at)
     VALUES ($1, $2, $3, NULL, $1,
             '{}'::jsonb, 'share', NOW() + INTERVAL '30 days')
     RETURNING *`,
    [params.token, params.campaign_id, params.brigadista_id],
  );
  return result.rows[0]!;
}

export async function createDraft(params: {
  token: string;
  campaign_id: string;
  brigadista_id: string;
  form_definition_id: string | null;
  client_id: string;
  payload: FormQrDraftRow["payload"];
}): Promise<FormQrDraftRow> {
  const result = await pool.query<FormQrDraftRow>(
    `INSERT INTO form_qr_drafts
       (token, campaign_id, brigadista_id, form_definition_id, client_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.token,
      params.campaign_id,
      params.brigadista_id,
      params.form_definition_id,
      params.client_id,
      JSON.stringify(params.payload),
    ],
  );
  return result.rows[0]!;
}

export async function findByToken(token: string): Promise<FormQrDraftRow | null> {
  const result = await pool.query<FormQrDraftRow>(
    `SELECT * FROM form_qr_drafts WHERE token = $1`,
    [token],
  );
  return result.rows[0] ?? null;
}

/**
 * Atómicamente marca el draft como escaneado + consumido si aún no lo estaba.
 * Devuelve la fila si esta llamada fue la primera (firstConsumption = true);
 * si ya estaba consumido, devuelve null.
 */
export async function tryConsume(
  token: string,
  userAgent: string | null,
): Promise<FormQrDraftRow | null> {
  const result = await pool.query<FormQrDraftRow>(
    `UPDATE form_qr_drafts
        SET scanned_at  = NOW(),
            consumed_at = NOW(),
            user_agent  = $2
      WHERE token = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING *`,
    [token, userAgent],
  );
  return result.rows[0] ?? null;
}

/**
 * Status para el polling del mobile. Devuelve solo lo necesario.
 */
export async function getStatus(
  token: string,
  brigadistaId: string,
): Promise<{ scanned_at: Date | null; expires_at: Date; expired: boolean } | null> {
  const result = await pool.query<{ scanned_at: Date | null; expires_at: Date }>(
    `SELECT scanned_at, expires_at
       FROM form_qr_drafts
      WHERE token = $1 AND brigadista_id = $2`,
    [token, brigadistaId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    scanned_at: row.scanned_at,
    expires_at: row.expires_at,
    expired: new Date(row.expires_at).getTime() < Date.now(),
  };
}

/**
 * Limpieza periódica. Borra drafts vencidos hace más de 1 día.
 */
export async function deleteExpired(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM form_qr_drafts WHERE expires_at < NOW() - INTERVAL '1 day'`,
  );
  return result.rowCount ?? 0;
}

export async function getCampaignWaNumber(
  campaignId: string,
): Promise<{
  whatsapp_number: string | null;
  whatsapp_qr_message: string | null;
  campaign_name: string;
  foto_url: string | null;
  cargo: string | null;
  numero: string | null;
} | null> {
  const result = await pool.query<{
    whatsapp_number: string | null;
    whatsapp_qr_message: string | null;
    campaign_name: string;
    foto_url: string | null;
    cargo: string | null;
    numero: string | null;
  }>(
    `SELECT config->>'whatsapp_number'      AS whatsapp_number,
            config->>'whatsapp_qr_message'  AS whatsapp_qr_message,
            name                            AS campaign_name,
            foto_url,
            cargo,
            numero
       FROM campaigns
      WHERE id = $1`,
    [campaignId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    whatsapp_number: row.whatsapp_number,
    whatsapp_qr_message: row.whatsapp_qr_message,
    campaign_name: row.campaign_name,
    foto_url: row.foto_url,
    cargo: row.cargo,
    numero: row.numero,
  };
}

export async function getBrigadistaFirstName(userId: string): Promise<string> {
  const result = await pool.query<{ full_name: string }>(
    `SELECT full_name FROM users WHERE id = $1`,
    [userId],
  );
  const fullName = result.rows[0]?.full_name ?? "";
  return fullName.split(/\s+/)[0] ?? fullName;
}
