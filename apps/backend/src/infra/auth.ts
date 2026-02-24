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

export type CampaignPermsMap = Record<string, { tierra: boolean; digital: boolean }>;

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
  campaign_ids?: string[];
  campaign_perms?: CampaignPermsMap;
};

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

      // Decorate request with auth context
      (request as AuthenticatedRequest).userId = claims.sub;
      (request as AuthenticatedRequest).userEmail = claims.email ?? "";
      (request as AuthenticatedRequest).userRole = claims.role ?? "agente_campo";
      (request as AuthenticatedRequest).userRegion = claims.region ?? null;
      (request as AuthenticatedRequest).campaignIds = claims.campaign_ids ?? [];
      (request as AuthenticatedRequest).campaignPerms = claims.campaign_perms ?? {};
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
