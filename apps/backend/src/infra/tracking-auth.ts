/**
 * Dual-mode authentication for tracking endpoints.
 *
 * Migration strategy (soft transition):
 *   Phase 1 (current): Backend accepts BOTH auth methods. Old mobile keeps working.
 *   Phase 2: New mobile sends JWT. Backend still accepts legacy token as fallback.
 *   Phase 3: After all agents update, deprecate legacy token.
 *
 * Resolution order:
 *   1. Authorization: Bearer <jwt>  → verify JWT, extract userId as authoritative agent_id
 *   2. x-agent-token: <shared>      → legacy shared secret (agent_id is self-asserted by client)
 *   3. Neither → reject
 *
 * When JWT is used, the server OVERRIDES the client-provided agent_id with the JWT's
 * `sub` claim. This eliminates spoofing — the agent can only report as itself.
 *
 * When legacy token is used, the server trusts the client-provided agent_id
 * (backwards compatibility with old mobile versions).
 */

import { jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";

// ── Types ───────────────────────────────────────────────────────────

export type TrackingAuthResult =
  | {
      ok: true;
      method: "jwt";
      /** Server-authoritative agent identity from JWT sub claim */
      agentId: string;
      /** Agent's role from JWT (for future RBAC on tracking) */
      role: string;
      /** Campaign IDs the agent belongs to (for validation) */
      campaignIds: string[];
      /** Agent name from JWT email or profile */
      agentName: string | null;
    }
  | {
      ok: true;
      method: "legacy_token";
      /** No server-side identity — agent_id is self-asserted by client */
      agentId: null;
      role: null;
      campaignIds: null;
      agentName: null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      httpStatus: number;
    };

// ── Resolver ────────────────────────────────────────────────────────

/**
 * Resolve tracking authentication from a Fastify request.
 *
 * @param request  - Fastify request (for headers)
 * @param jwtSecret - The JWT secret (same as auth system)
 * @param legacyToken - The shared AGENT_INGEST_TOKEN (empty = disabled)
 */
export async function resolveTrackingAuth(
  request: FastifyRequest,
  jwtSecret: string,
  legacyToken: string,
): Promise<TrackingAuthResult> {
  // ── 1. Try JWT Bearer ──────────────────────────────────────────
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return verifyTrackingJwt(token, jwtSecret);
  }

  // ── 2. Try legacy x-agent-token ────────────────────────────────
  const legacyProvided = String(request.headers["x-agent-token"] ?? "").trim();

  if (legacyToken && legacyProvided) {
    if (legacyProvided === legacyToken) {
      return {
        ok: true,
        method: "legacy_token",
        agentId: null,
        role: null,
        campaignIds: null,
        agentName: null,
      };
    }
    return {
      ok: false,
      code: "INVALID_TOKEN",
      message: "token invalido",
      httpStatus: 401,
    };
  }

  // ── 3. No auth provided ────────────────────────────────────────
  // If legacy token is not configured on server, only JWT is accepted
  if (!legacyToken && !authHeader) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      message: "autenticacion requerida (Bearer JWT)",
      httpStatus: 401,
    };
  }

  return {
    ok: false,
    code: "INVALID_TOKEN",
    message: "token invalido o ausente",
    httpStatus: 401,
  };
}

// ── WebSocket variant ───────────────────────────────────────────────

/**
 * Resolve tracking auth for WebSocket connections.
 *
 * Dual-mode:
 *   1. First message { type: "auth", token: "<jwt>" } → JWT auth (new mobile)
 *   2. Query param ?token=<shared_secret> → legacy auth (old mobile)
 *
 * Returns auth result. For JWT, returns the authoritative agentId.
 * For legacy, returns null (agent self-identifies via location messages).
 */
export async function resolveWsTrackingAuth(
  queryToken: string,
  jwtSecret: string,
  legacyToken: string,
): Promise<TrackingAuthResult> {
  // If the token looks like a JWT (has dots), try JWT verification first
  if (queryToken.includes(".")) {
    return verifyTrackingJwt(queryToken, jwtSecret);
  }

  // Otherwise treat as legacy shared token
  if (legacyToken && queryToken === legacyToken) {
    return {
      ok: true,
      method: "legacy_token",
      agentId: null,
      role: null,
      campaignIds: null,
      agentName: null,
    };
  }

  return {
    ok: false,
    code: "INVALID_TOKEN",
    message: "token invalido",
    httpStatus: 401,
  };
}

/**
 * Verify a JWT token for tracking auth and extract agent identity.
 */
async function verifyTrackingJwt(
  token: string,
  jwtSecret: string,
): Promise<TrackingAuthResult> {
  try {
    const secretKey = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });

    const sub = payload.sub;
    if (!sub) {
      return {
        ok: false,
        code: "AUTH_TOKEN_INVALID",
        message: "JWT sin subject",
        httpStatus: 401,
      };
    }

    return {
      ok: true,
      method: "jwt",
      agentId: sub,
      role: (payload as Record<string, unknown>).role as string ?? "agente_campo",
      campaignIds: (payload as Record<string, unknown>).campaign_ids as string[] ?? [],
      agentName: (payload as Record<string, unknown>).email as string ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "token invalido";
    const isExpired = message.includes("expired") || message.includes('"exp"');
    return {
      ok: false,
      code: isExpired ? "AUTH_TOKEN_EXPIRED" : "AUTH_TOKEN_INVALID",
      message: isExpired ? "JWT expirado" : "JWT invalido",
      httpStatus: 401,
    };
  }
}
