export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string | null;
  region: string | null;
  role: string;
  status: string;
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
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  region?: string | null;
  campaign_ids: string[];
  /** Map of campaign_id -> permission flags */
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
  }>;
};

export type RefreshResult = {
  access_token: string;
  refresh_token: string;
};
