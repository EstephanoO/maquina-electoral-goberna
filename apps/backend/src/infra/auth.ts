/**
 * JWT authentication middleware for Fastify.
 * Verifies Bearer tokens (header or httpOnly cookie) and decorates requests with user context.
 *
 * Token resolution order:
 *   1. Authorization: Bearer <token>  (mobile, programmatic clients)
 *   2. Cookie: goberna_access_token=<token>  (web dashboard via httpOnly cookie)
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";

import { errorPayload } from "./http";
import { pool } from "../db";

export type CampaignPermsMap = Record<string, { tierra: boolean; digital: boolean; audio_admin: boolean }>;

export type AuthenticatedRequest = FastifyRequest & {
  userId: string;
  userEmail: string;
  userRole: string;
  userRegion: string | null;
  campaignIds: string[];
  campaignPerms: CampaignPermsMap;
};

type JwtPayloadClaims = {
  sub: string;
  email?: string;
  role?: string;
  region?: string | null;
  // campaign_ids/campaign_perms están DEPRECATED en el JWT desde 2026-05-06.
  // Solían incluirse pero hicieron crecer el JWT a 4220 bytes para admins
  // con muchas campañas, superando el límite de cookie (4096) en browsers.
  // Ahora se fetchean desde DB en el middleware con cache. Mantenemos el
  // campo opcional por backward compat con tokens viejos en el aire.
  campaign_ids?: string[];
  campaign_perms?: CampaignPermsMap;
};

// ── Cache de campaigns por user (60s TTL) ────────────────────────────
// Evita hacer 2 queries a DB por cada request autenticado. 60s es seguro
// para cambios de membership — al perder un campaign el usuario verá el
// efecto al refrescar la pantalla pasado 1 minuto, aceptable.
type CampaignCacheEntry = { campaignIds: string[]; campaignPerms: CampaignPermsMap; ts: number };
const CAMPAIGN_CACHE_TTL_MS = 60_000;
const campaignCache = new Map<string, CampaignCacheEntry>();

async function loadUserCampaigns(userId: string, userRole: string): Promise<{ campaignIds: string[]; campaignPerms: CampaignPermsMap }> {
  const cached = campaignCache.get(userId);
  if (cached && Date.now() - cached.ts < CAMPAIGN_CACHE_TTL_MS) {
    return { campaignIds: cached.campaignIds, campaignPerms: cached.campaignPerms };
  }

  // Admins ven TODAS las campañas activas; otros solo las que tienen membership.
  const sql = userRole === "admin"
    ? `SELECT id::text AS campaign_id,
              TRUE AS perm_tierra, TRUE AS perm_digital, TRUE AS perm_audio_admin
         FROM campaigns
         WHERE status = 'active'
         ORDER BY name`
    : `SELECT campaign_id::text,
              COALESCE(perm_tierra, FALSE) AS perm_tierra,
              COALESCE(perm_digital, FALSE) AS perm_digital,
              COALESCE(perm_audio_admin, FALSE) AS perm_audio_admin
         FROM user_campaigns
         WHERE user_id = $1 AND status = 'active'`;

  const params = userRole === "admin" ? [] : [userId];
  type Row = { campaign_id: string; perm_tierra: boolean; perm_digital: boolean; perm_audio_admin: boolean };
  const { rows } = await pool.query<Row>(sql, params);

  const campaignIds: string[] = [];
  const campaignPerms: CampaignPermsMap = {};
  for (const r of rows) {
    campaignIds.push(r.campaign_id);
    campaignPerms[r.campaign_id] = {
      tierra: r.perm_tierra,
      digital: r.perm_digital,
      audio_admin: r.perm_audio_admin,
    };
  }

  campaignCache.set(userId, { campaignIds, campaignPerms, ts: Date.now() });
  return { campaignIds, campaignPerms };
}

/** Invalida el cache de un user — llamado cuando un user pierde/gana membership. */
export function invalidateUserCampaignCache(userId: string): void {
  campaignCache.delete(userId);
}

// ── Cookie names (shared with auth routes) ─────────────────────────
export const AUTH_COOKIE_NAMES = {
  accessToken: "goberna_access_token",
  refreshToken: "goberna_refresh_token",
  /** Non-httpOnly flag so Next.js middleware can detect auth without reading the JWT */
  session: "goberna_session",
} as const;

/** Parse raw Cookie header into a key→value map */
export function parseCookies(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = val;
  }
  return out;
}

export function registerAuthDecorator(app: FastifyInstance, jwtSecret: string) {
  const secretKey = new TextEncoder().encode(jwtSecret);

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = String(request.id);

    // 1. Try Authorization header first (mobile / programmatic)
    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }

    // 2. Fall back to httpOnly cookie (web dashboard)
    if (!token) {
      const cookies = parseCookies(request.headers.cookie);
      token = cookies[AUTH_COOKIE_NAMES.accessToken];
    }

    if (!token) {
      return reply.code(401).send(errorPayload(requestId, "AUTH_TOKEN_MISSING", "token requerido"));
    }

    try {
      const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
      const claims = payload as unknown as JwtPayloadClaims;

      if (!claims.sub) {
        return reply.code(401).send(errorPayload(requestId, "AUTH_TOKEN_INVALID", "token sin subject"));
      }

      // Decorate request with auth context. campaign_ids/campaign_perms se
      // fetchean desde DB con cache LRU (60s TTL) — antes venían en el JWT
      // pero hacían crecer el cookie a > 4096 bytes para admins con muchas
      // campañas, superando el límite del browser y rompiendo /api/auth/me.
      const userId = claims.sub;
      const userRole = claims.role ?? "agente_campo";
      (request as AuthenticatedRequest).userId = userId;
      (request as AuthenticatedRequest).userEmail = claims.email ?? "";
      (request as AuthenticatedRequest).userRole = userRole;
      (request as AuthenticatedRequest).userRegion = claims.region ?? null;

      // Backward compat: si el token viejo aún trae campaign_ids inline (por
      // tokens emitidos antes del fix), los usamos directo sin tocar DB.
      // Si no, fetcheamos.
      if (claims.campaign_ids && claims.campaign_ids.length > 0) {
        (request as AuthenticatedRequest).campaignIds = claims.campaign_ids;
        (request as AuthenticatedRequest).campaignPerms = claims.campaign_perms ?? {};
      } else {
        const { campaignIds, campaignPerms } = await loadUserCampaigns(userId, userRole);
        (request as AuthenticatedRequest).campaignIds = campaignIds;
        (request as AuthenticatedRequest).campaignPerms = campaignPerms;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "token invalido";
      const isExpired = message.includes("expired") || message.includes('"exp" claim');
      const code = isExpired ? "AUTH_TOKEN_EXPIRED" : "AUTH_TOKEN_INVALID";
      const userMessage = isExpired ? "token expirado" : "token invalido";
      return reply.code(401).send(errorPayload(requestId, code, userMessage));
    }
  });
}

// Type augmentation for Fastify
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
