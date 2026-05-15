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
    // Normalize phone: remove non-digits for comparison.
    // For Peru E.164 (51XXXXXXXXX, 11 digits), also accept the local 9-digit
    // form (XXXXXXXXX) since the DB historically stores phones without the
    // country code. Firebase Phone Auth always sends idTokens with E.164.
    const normalizedPhone = phone.replace(/\D/g, "");
    const candidates =
      normalizedPhone.startsWith("51") && normalizedPhone.length === 11
        ? [normalizedPhone, normalizedPhone.slice(2)]
        : [normalizedPhone];
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, full_name, phone, region, role, status,
              COALESCE(password_reset_required, false) as password_reset_required, created_at, updated_at
       FROM users WHERE REGEXP_REPLACE(phone, '\\D', '', 'g') = ANY($1::text[])`,
      [candidates],
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

  /**
   * Match por firebase_uid (linkeado en migración 059). Tiene prioridad sobre
   * el match por phone porque el linkeo previo ya garantiza identidad.
   */
  async findUserByFirebaseUid(firebaseUid: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, password_hash, full_name, phone, region, role, status,
              COALESCE(password_reset_required, false) as password_reset_required, created_at, updated_at
       FROM users WHERE firebase_uid = $1`,
      [firebaseUid],
    );
    return rows[0] ?? null;
  }

  /**
   * Linkea un firebase_uid a un user existente. UNIQUE (cuando NOT NULL) en
   * la columna garantiza que un mismo uid no quede ligado a 2 users.
   * Retorna true si se actualizó (no había uid previo o coincide); false si
   * el user ya tenía OTRO uid (caller debe rechazar el linkeo en ese caso).
   */
  async linkUserFirebaseUid(userId: string, firebaseUid: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE users
          SET firebase_uid = $2, updated_at = now()
        WHERE id = $1
          AND (firebase_uid IS NULL OR firebase_uid = $2)`,
      [userId, firebaseUid],
    );
    return (result.rowCount ?? 0) > 0;
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
    passwordHash: string | null,
    fullName: string,
    phone?: string,
    region?: string,
    role = "agente_campo",
    status = "active",
    firebaseUid?: string | null,
  ): Promise<UserRow> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name, phone, region, role, status, firebase_uid)
       VALUES (lower($1), $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, password_hash, full_name, phone, region, role, status, created_at, updated_at`,
      [email.trim(), passwordHash, fullName, phone ?? null, region ?? null, role, status, firebaseUid ?? null],
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

  /**
   * Delete a user and all their owned data in a single transaction.
   * Uses buildDeleteAccountSql() for the ordered statement list.
   * Required for Apple App Store guideline 5.1.1(v).
   */
  async deleteUserCascade(userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const sql of buildDeleteAccountSql()) {
        await client.query(sql, [userId]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

/**
 * Returns the ordered SQL statements to wipe a user and all FK-referencing rows.
 *
 * FK analysis (2026-05-15, appdb):
 *
 * Tables with ON DELETE CASCADE (handled automatically by PG, no explicit DELETE needed):
 *   access_requests (user_id FK), chat_messages, classification_events,
 *   cms_extension_events, consultor_candidato (consultor_user_id),
 *   consultor_global_access (consultor_user_id), invitations (created_by),
 *   magic_links, meet_group_members, meet_participants, org_hierarchy,
 *   refresh_tokens, support_messages, user_campaigns, user_objectives.
 *
 * Tables with SET NULL (handled automatically by PG):
 *   classification_events.corrected_by, form_definitions.deleted_by,
 *   form_submissions.{cms_claimed_by, submitted_by, deleted_by},
 *   forms.deleted_by, invitations.parent_user_id, meet_groups.leader_id,
 *   meets.leader_id, org_hierarchy.parent_user_id, zones.assigned_to.
 *
 * Tables with NO ACTION FK that need explicit DELETE (NOT NULL cols — cannot SET NULL):
 *   blast_operator_status.user_id        — NOT NULL, owned rows
 *   campaign_access_codes.created_by     — NOT NULL, rows created by user
 *   decks.uploaded_by_user_id            — NOT NULL, owned uploads
 *   form_qr_drafts.brigadista_id         — NOT NULL, owned drafts
 *   qr_leads.brigadista_id               — NOT NULL, owned leads
 *
 * Tables with NO ACTION FK that need SET NULL (nullable cols — audit/attribution):
 *   access_requests.resolved_by
 *   analisis.analisis.uploaded_by_user_id
 *   audio_catalog.created_by
 *   blast_operator_assignments.assigned_to
 *   consultor_candidato.assigned_by
 *   consultor_global_access.granted_by
 *   decks.reviewed_by_user_id
 *   form_definitions.created_by
 *   form_validations.{claimed_by, wa_validated_by}
 *   meets.created_by
 *   zone_objectives.created_by
 *
 * DELETE FROM users MUST be last.
 */
export function buildDeleteAccountSql(): string[] {
  return [
    // ── Explicit DELETEs for NOT NULL NO-ACTION FKs ──────────────────────
    // These rows will block the final users delete if not removed first.
    'DELETE FROM blast_operator_status WHERE user_id = $1',
    'DELETE FROM campaign_access_codes WHERE created_by = $1',
    'DELETE FROM decks WHERE uploaded_by_user_id = $1',
    'DELETE FROM form_qr_drafts WHERE brigadista_id = $1',
    'DELETE FROM qr_leads WHERE brigadista_id = $1',

    // ── SET NULL for nullable NO-ACTION FK audit/attribution columns ─────
    // Preserve the records but sever the reference to the deleted user.
    'UPDATE access_requests SET resolved_by = NULL WHERE resolved_by = $1',
    'UPDATE analisis.analisis SET uploaded_by_user_id = NULL WHERE uploaded_by_user_id = $1',
    'UPDATE audio_catalog SET created_by = NULL WHERE created_by = $1',
    'UPDATE blast_operator_assignments SET assigned_to = NULL WHERE assigned_to = $1',
    'UPDATE consultor_candidato SET assigned_by = NULL WHERE assigned_by = $1',
    'UPDATE consultor_global_access SET granted_by = NULL WHERE granted_by = $1',
    'UPDATE decks SET reviewed_by_user_id = NULL WHERE reviewed_by_user_id = $1',
    'UPDATE form_definitions SET created_by = NULL WHERE created_by = $1',
    'UPDATE form_validations SET claimed_by = NULL, wa_validated_by = NULL WHERE claimed_by = $1 OR wa_validated_by = $1',
    'UPDATE meets SET created_by = NULL WHERE created_by = $1',
    'UPDATE zone_objectives SET created_by = NULL WHERE created_by = $1',

    // ── Final: delete the user row (PG CASCADE handles the rest) ─────────
    'DELETE FROM users WHERE id = $1',
  ];
}
