/**
 * RBAC authorization middleware for Fastify.
 * Builds on the auth decorator (userId, userEmail, userRole, campaignIds).
 * Provides role-based access control and campaign-scoped authorization.
 */
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedRequest } from "./auth";
import { errorPayload } from "./http";

// ── Type augmentation ───────────────────────────────────────────────
declare module "fastify" {
  interface FastifyRequest {
    activeCampaignId?: string;
  }
}

// ── Role hierarchy ──────────────────────────────────────────────────
export type Role = "admin" | "consultor" | "candidato" | "brigadista_zonal" | "agente_campo" | "agente_digital";

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 50,
  consultor: 40,
  candidato: 30,
  brigadista_zonal: 20,
  agente_campo: 10,
  agente_digital: 10,
};

export const ALL_ROLES: Role[] = ["admin", "consultor", "candidato", "brigadista_zonal", "agente_campo", "agente_digital"];

// No aliases — jefe_campana is gone, DB will be migrated
export const ROLE_ALIASES: Record<string, Role> = {};

// ── Options ─────────────────────────────────────────────────────────
export type AuthorizeOptions = {
  /** Minimum roles allowed. Role hierarchy: admin > consultor > candidato > brigadista_zonal > agente_campo / agente_digital */
  roles?: Role[];
  /** If true, checks that the request includes a campaign_id and user has access */
  requireCampaign?: boolean;
  /** If set, validates the user has this permission for the active campaign. Implies requireCampaign. */
  requirePermission?: "tierra" | "digital";
};

// ── Helpers ─────────────────────────────────────────────────────────

function isValidRole(role: string): role is Role {
  // Check direct match or alias
  return role in ROLE_HIERARCHY || role in ROLE_ALIASES;
}

function normalizeRole(role: string): Role {
  // Map aliases to canonical roles
  if (role in ROLE_ALIASES) {
    return ROLE_ALIASES[role]!;
  }
  return role as Role;
}

/**
 * Resolve the minimum required level from the allowed roles array.
 * e.g. roles: ['brigadista_zonal'] → min level is 20,
 * meaning jefe_campana, consultor and admin also pass.
 */
function minLevelFromRoles(roles: Role[]): number {
  return Math.min(...roles.map((r) => ROLE_HIERARCHY[r]));
}

function extractCampaignId(request: FastifyRequest): string | undefined {
  // 1. Header
  const fromHeader = request.headers["x-campaign-id"];
  if (typeof fromHeader === "string" && fromHeader.length > 0) return fromHeader;

  // 2. Route param
  const fromParam = (request.params as Record<string, string>)?.campaignId;
  if (typeof fromParam === "string" && fromParam.length > 0) return fromParam;

  // 3. Body
  const fromBody = (request.body as Record<string, unknown>)?.campaign_id;
  if (typeof fromBody === "string" && fromBody.length > 0) return fromBody;

  return undefined;
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Creates a Fastify preHandler that enforces role-based access control
 * and optional campaign-scoped authorization.
 *
 * @example
 * // Only admins
 * app.get("/admin/stats", { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] }, handler);
 *
 * // Candidato and above, scoped to a campaign
 * app.post("/campaigns/:campaignId/export", {
 *   preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })],
 * }, handler);
 */
export function authorize(options: AuthorizeOptions = {}) {
  const { roles, requirePermission } = options;
  // requirePermission implies requireCampaign
  const requireCampaign = options.requireCampaign ?? !!requirePermission;

  // Pre-compute the minimum level once at registration time
  const minLevel = roles && roles.length > 0 ? minLevelFromRoles(roles) : undefined;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const req = request as AuthenticatedRequest;
    const requestId = String(request.id);

    // ── Role check ────────────────────────────────────────────────
    if (minLevel !== undefined) {
      const rawRole = req.userRole;

      if (!isValidRole(rawRole)) {
        return reply
          .code(403)
          .send(errorPayload(requestId, "AUTHZ_ROLE_INVALID", "rol de usuario no reconocido"));
      }

      const userRole = normalizeRole(rawRole);
      const userLevel = ROLE_HIERARCHY[userRole];

      if (userLevel < minLevel) {
        return reply
          .code(403)
          .send(errorPayload(requestId, "AUTHZ_ROLE_INSUFFICIENT", "permisos insuficientes para esta accion"));
      }
    }

    // ── Campaign check ────────────────────────────────────────────
    if (requireCampaign) {
      // Admins bypass campaign scope — they have access to everything
      if (req.userRole === "admin") {
        const campaignId = extractCampaignId(request);
        if (campaignId) {
          request.activeCampaignId = campaignId;
        }
        return;
      }

      const campaignId = extractCampaignId(request);

      if (!campaignId) {
        return reply
          .code(403)
          .send(errorPayload(requestId, "AUTHZ_CAMPAIGN_MISSING", "campaign_id requerido"));
      }

      if (!req.campaignIds.includes(campaignId)) {
        return reply
          .code(403)
          .send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campaña"));
      }

      request.activeCampaignId = campaignId;

      // ── Permission check ──────────────────────────────────────
      if (requirePermission) {
        const perms = req.campaignPerms?.[campaignId];
        const allowed = perms
          ? (requirePermission === "tierra" ? perms.tierra : perms.digital)
          : false;

        if (!allowed) {
          return reply
            .code(403)
            .send(errorPayload(requestId, "AUTHZ_PERMISSION_DENIED", `sin permiso '${requirePermission}' para esta campaña`));
        }
      }
    }
  };
}
