import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT } from "jose";

import type { AppEnv } from "../../config/env";
import type { AuthRepository } from "./repository";
import type { CampaignPerms, JwtPayload, LoginResult, RefreshResult, UserCampaignRow } from "./types";
import { ROLE_HIERARCHY, type Role, ROLE_ALIASES } from "../../infra/authorize";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthService {
  private jwtSecretKey: Uint8Array;

  constructor(
    private repo: AuthRepository,
    private env: Pick<AppEnv, "jwtSecret" | "jwtAccessExpiresIn" | "jwtRefreshExpiresIn" | "bcryptRounds">,
  ) {
    this.jwtSecretKey = new TextEncoder().encode(env.jwtSecret);
  }

  /** Login by email (for backwards compatibility) */
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.repo.findUserByEmail(email);

    if (!user) {
      throw new AppError("AUTH_INVALID_CREDENTIALS", "credenciales incorrectas", 401);
    }

    return this.loginWithUser(user, password);
  }

  /** Login with a pre-fetched user object (used for phone-based login) */
  async loginWithUser(user: { id: string; email: string; full_name: string; phone?: string | null; region?: string | null; role: string; status: string; password_hash: string; password_reset_required?: boolean }, password: string): Promise<LoginResult> {
    if (user.status === "suspended") {
      throw new AppError("AUTH_USER_SUSPENDED", "usuario suspendido", 403);
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new AppError("AUTH_INVALID_CREDENTIALS", "credenciales incorrectas", 401);
    }

    // Admin users see ALL campaigns; others only their assigned ones
    const campaigns = user.role === "admin"
      ? await this.repo.getAllActiveCampaigns()
      : await this.repo.getUserCampaigns(user.id);
    const campaignIds = campaigns.map((c) => c.campaign_id);

    // Use the highest role between user's global role and campaign-specific roles
    // This ensures a consultor for any campaign can access consultor-level endpoints
    const effectiveRole = this.computeEffectiveRole(user.role, campaigns);

    // JWT compacto: solo identidad. campaign_ids/perms se fetchean desde DB
    // en el authenticate middleware con cache LRU. Antes iban inline pero
    // hacían crecer el cookie a > 4096 bytes para admins con muchas campañas
    // y el browser lo rechazaba (fix 2026-05-06).
    const accessToken = await this.generateAccessToken({
      sub: user.id,
      email: user.email,
      role: effectiveRole,
      region: user.region,
    });

    const familyId = crypto.randomUUID();
    const refreshToken = this.generateRefreshToken();
    const refreshHash = this.hashToken(refreshToken);
    const refreshExpiry = this.parseExpiry(this.env.jwtRefreshExpiresIn);

    await this.repo.saveRefreshToken(user.id, refreshHash, familyId, refreshExpiry);
    void campaignIds; // intencionalmente no usado en el JWT — se fetchea en middleware

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      campaigns: campaigns.map((c) => ({
        id: c.campaign_id,
        name: c.campaign_name,
        slug: c.campaign_slug,
        role: c.role,
        perm_audio_admin: c.perm_audio_admin,
        whatsapp_number:
          typeof c.campaign_config?.whatsapp_number === "string"
            ? (c.campaign_config.whatsapp_number as string)
            : null,
      })),
      // Include flag if user needs to reset password
      ...(user.password_reset_required ? { password_reset_required: true } : {}),
    };
  }

  async refresh(rawRefreshToken: string): Promise<RefreshResult> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.repo.findRefreshTokenByHash(tokenHash);

    if (!stored) {
      throw new AppError("AUTH_REFRESH_INVALID", "refresh token invalido", 401);
    }

    if (stored.revoked_at) {
      // Possible token reuse attack — revoke entire family
      await this.repo.revokeTokenFamily(stored.family_id);
      throw new AppError("AUTH_REFRESH_REVOKED", "refresh token reutilizado, sesion invalidada", 401);
    }

    if (new Date() > new Date(stored.expires_at)) {
      throw new AppError("AUTH_REFRESH_EXPIRED", "refresh token expirado", 401);
    }

    // Rotate: revoke current, issue new in same family
    await this.repo.revokeRefreshToken(stored.id);

    const user = await this.repo.findUserById(stored.user_id);
    if (!user || user.status === "suspended") {
      throw new AppError("AUTH_USER_INACTIVE", "usuario no activo", 403);
    }

    // Admin users see ALL campaigns; others only their assigned ones
    const campaigns = user.role === "admin"
      ? await this.repo.getAllActiveCampaigns()
      : await this.repo.getUserCampaigns(user.id);
    const campaignIds = campaigns.map((c) => c.campaign_id);

    // Use the highest role between user's global role and campaign-specific roles
    const effectiveRole = this.computeEffectiveRole(user.role, campaigns);

    // JWT compacto en refresh también — mismo motivo del fix de login.
    const accessToken = await this.generateAccessToken({
      sub: user.id,
      email: user.email,
      role: effectiveRole,
      region: user.region,
    });
    void campaignIds; // se fetchean desde DB en authenticate middleware

    const newRefreshToken = this.generateRefreshToken();
    const newRefreshHash = this.hashToken(newRefreshToken);
    const refreshExpiry = this.parseExpiry(this.env.jwtRefreshExpiresIn);

    await this.repo.saveRefreshToken(user.id, newRefreshHash, stored.family_id, refreshExpiry);

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.repo.revokeAllUserRefreshTokens(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw new AppError("USER_NOT_FOUND", "usuario no encontrado", 404);
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      throw new AppError("AUTH_INVALID_PASSWORD", "password actual incorrecta", 401);
    }

    const newHash = await bcrypt.hash(newPassword, this.env.bcryptRounds);
    await this.repo.updatePasswordHash(user.id, newHash);

    // Revoke all refresh tokens (force re-login on all devices)
    await this.repo.revokeAllUserRefreshTokens(userId);
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.env.bcryptRounds);
  }

  private async generateAccessToken(payload: JwtPayload): Promise<string> {
    return new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(this.env.jwtAccessExpiresIn)
      .sign(this.jwtSecretKey);
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString("hex");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private buildCampaignPerms(campaigns: UserCampaignRow[]): Record<string, CampaignPerms> {
    const perms: Record<string, CampaignPerms> = {};
    for (const c of campaigns) {
      perms[c.campaign_id] = { tierra: c.perm_tierra, digital: c.perm_digital, audio_admin: c.perm_audio_admin };
    }
    return perms;
  }

  private parseExpiry(expiry: string): Date {
    const match = expiry.match(/^(\d+)(m|h|d)$/);
    if (!match) throw new Error(`formato de expiry invalido: ${expiry}`);

    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;
    const now = Date.now();

    switch (unit) {
      case "m":
        return new Date(now + value * 60 * 1000);
      case "h":
        return new Date(now + value * 3600 * 1000);
      case "d":
        return new Date(now + value * 86400 * 1000);
      default:
        throw new Error(`unidad desconocida: ${unit}`);
    }
  }

  /**
   * Compute the effective role for authorization: the highest role between
   * the user's global role and all their campaign-specific roles.
   * This ensures a consultor for any campaign can access consultor-level endpoints.
   */
  private computeEffectiveRole(userRole: string, campaigns: UserCampaignRow[]): string {
    const normalizeRole = (role: string): Role => {
      if (role in ROLE_ALIASES) return ROLE_ALIASES[role]!;
      return role as Role;
    };

    const getRoleLevel = (role: string): number => {
      const normalized = normalizeRole(role);
      return ROLE_HIERARCHY[normalized] ?? 0;
    };

    let highestLevel = getRoleLevel(userRole);
    let highestRole = userRole;

    for (const campaign of campaigns) {
      const level = getRoleLevel(campaign.role);
      if (level > highestLevel) {
        highestLevel = level;
        highestRole = campaign.role;
      }
    }

    return highestRole;
  }
}
