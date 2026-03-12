import type { Pool } from "pg";

import type { RefreshTokenRow, UserCampaignRow, UserRow } from "./types";

export class AuthRepository {
  constructor(private pool: Pool) {}

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, full_name, phone, region, role, status, 
              COALESCE(password_reset_required, false) as password_reset_required, created_at, updated_at
       FROM users WHERE lower(email) = lower($1)`,
      [email.trim()],
    );
    return rows[0] ?? null;
  }

  async findUserByPhone(phone: string): Promise<UserRow | null> {
    // Normalize phone: remove non-digits for comparison
    const normalizedPhone = phone.replace(/\D/g, "");
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, full_name, phone, region, role, status,
              COALESCE(password_reset_required, false) as password_reset_required, created_at, updated_at
       FROM users WHERE REGEXP_REPLACE(phone, '\\D', '', 'g') = $1`,
      [normalizedPhone],
    );
    return rows[0] ?? null;
  }

  async findUserById(userId: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, full_name, phone, region, role, status,
              COALESCE(password_reset_required, false) as password_reset_required, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  /** Mark user as requiring password reset on next login */
  async setPasswordResetRequired(userId: string, required: boolean): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE users SET password_reset_required = $1, updated_at = now() WHERE id = $2`,
      [required, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Clear password reset flag after user sets new password */
  async clearPasswordResetRequired(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET password_reset_required = false, updated_at = now() WHERE id = $1`,
      [userId],
    );
  }

  async createUser(
    email: string,
    passwordHash: string,
    fullName: string,
    phone?: string,
    region?: string,
    role = "agente_campo",
    status = "active",
  ): Promise<UserRow> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name, phone, region, role, status)
       VALUES (lower($1), $2, $3, $4, $5, $6, $7)
       RETURNING id, email, password_hash, full_name, phone, region, role, status, created_at, updated_at`,
      [email.trim(), passwordHash, fullName, phone ?? null, region ?? null, role, status],
    );
    return rows[0]!;
  }

  async getUserCampaigns(userId: string): Promise<UserCampaignRow[]> {
    const { rows } = await this.pool.query(
      `SELECT c.id AS campaign_id, c.name AS campaign_name, c.slug AS campaign_slug,
              c.config AS campaign_config, uc.role,
              COALESCE(uc.perm_tierra, true) AS perm_tierra,
              COALESCE(uc.perm_digital, true) AS perm_digital,
              COALESCE(uc.perm_audio_admin, false) AS perm_audio_admin
       FROM user_campaigns uc
       JOIN campaigns c ON c.id = uc.campaign_id
       WHERE uc.user_id = $1 AND uc.status = 'active' AND c.status = 'active'`,
      [userId],
    );
    return rows as UserCampaignRow[];
  }

  /** Admin users get ALL active campaigns regardless of user_campaigns entries */
  async getAllActiveCampaigns(): Promise<UserCampaignRow[]> {
    const { rows } = await this.pool.query(
      `SELECT id AS campaign_id, name AS campaign_name, slug AS campaign_slug,
              config AS campaign_config, 'admin' AS role,
              true AS perm_tierra, true AS perm_digital, true AS perm_audio_admin
       FROM campaigns WHERE status = 'active' ORDER BY name`,
    );
    return rows as UserCampaignRow[];
  }

  async saveRefreshToken(userId: string, tokenHash: string, familyId: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, tokenHash, familyId, expiresAt],
    );
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const { rows } = await this.pool.query<RefreshTokenRow>(
      `SELECT id, user_id, token_hash, family_id, expires_at, revoked_at, created_at
       FROM refresh_tokens WHERE token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`,
      [tokenId],
    );
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId],
    );
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [passwordHash, userId],
    );
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  async cleanExpiredTokens(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM refresh_tokens WHERE expires_at < now()`,
    );
    return result.rowCount ?? 0;
  }
}
