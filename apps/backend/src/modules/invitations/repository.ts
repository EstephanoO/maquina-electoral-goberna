import { randomBytes } from "node:crypto";
import { pool } from "../../db";
import type { CreateInvitationInput } from "./schemas";

export type InvitationRow = {
  id: string;
  campaign_id: string;
  code: string;
  role: string;
  parent_user_id: string | null;
  zone_id: string | null;
  created_by: string;
  max_uses: number;
  used_count: number;
  expires_at: Date;
  created_at: Date;
};

export type InvitationWithCampaign = InvitationRow & {
  campaign_name: string;
  campaign_slug: string;
};

function generateCode(): string {
  return randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
}

export async function create(input: CreateInvitationInput, createdBy: string): Promise<InvitationRow> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + input.expires_in_hours * 3600 * 1000);

  const { rows } = await pool.query<InvitationRow>(
    `INSERT INTO invitations (campaign_id, code, role, parent_user_id, zone_id, created_by, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, campaign_id, code, role, parent_user_id, zone_id, created_by, max_uses, used_count, expires_at, created_at`,
    [input.campaign_id, code, input.role, input.parent_user_id ?? null, input.zone_id ?? null, createdBy, input.max_uses ?? 1, expiresAt],
  );
  return rows[0]!;
}

export async function findByCode(code: string): Promise<InvitationWithCampaign | null> {
  const { rows } = await pool.query<InvitationWithCampaign>(
    `SELECT i.id, i.campaign_id, i.code, i.role, i.parent_user_id, i.zone_id,
            i.created_by, i.max_uses, i.used_count, i.expires_at, i.created_at,
            c.name AS campaign_name, c.slug AS campaign_slug
     FROM invitations i
     JOIN campaigns c ON c.id = i.campaign_id
     WHERE i.code = $1`,
    [code.trim().toUpperCase()],
  );
  return rows[0] ?? null;
}

export function isValid(invitation: InvitationRow): boolean {
  if (invitation.used_count >= invitation.max_uses) return false;
  if (new Date() > new Date(invitation.expires_at)) return false;
  return true;
}

export async function incrementUsage(id: string): Promise<void> {
  await pool.query(
    `UPDATE invitations SET used_count = used_count + 1 WHERE id = $1`,
    [id],
  );
}

export async function listByCampaign(campaignId: string): Promise<InvitationRow[]> {
  const { rows } = await pool.query<InvitationRow>(
    `SELECT id, campaign_id, code, role, parent_user_id, zone_id, created_by, max_uses, used_count, expires_at, created_at
     FROM invitations
     WHERE campaign_id = $1
     ORDER BY created_at DESC`,
    [campaignId],
  );
  return rows;
}

export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM invitations WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
