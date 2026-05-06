export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  region: string | null;
  role: string;
  status: string;
  password_reset_required: boolean;
  created_at: Date;
  updated_at: Date;
};

export type UserCampaignRow = {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  campaign_config: Record<string, unknown>;
  role: string;
  perm_tierra: boolean;
  perm_digital: boolean;
  perm_audio_admin: boolean;
};

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

/** Per-campaign permission flags carried in JWT */
export type CampaignPerms = {
  tierra: boolean;
  digital: boolean;
  audio_admin: boolean;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  region?: string | null;
  // DEPRECATED en JWT desde 2026-05-06 (cookie >4096 bytes para admin).
  // El authenticate middleware fetchea campaigns desde DB con cache.
  // Mantenemos opcional por backward compat con tokens viejos en el aire.
  campaign_ids?: string[];
  campaign_perms?: Record<string, CampaignPerms>;
  iat?: number;
  exp?: number;
};

export type LoginResult = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    phone?: string | null;
    role: string;
    status: string;
  };
  campaigns: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
    perm_audio_admin: boolean;
    whatsapp_number: string | null;
  }>;
  /** If true, user must set new password before accessing the app */
  password_reset_required?: boolean;
};

export type RefreshResult = {
  access_token: string;
  refresh_token: string;
};
