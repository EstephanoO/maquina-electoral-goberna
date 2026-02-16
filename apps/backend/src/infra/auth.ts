/**
 * JWT authentication middleware for Fastify.
 * Verifies Bearer tokens and decorates requests with user context.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";

import { errorPayload } from "./http";

export type AuthenticatedRequest = FastifyRequest & {
  userId: string;
  userEmail: string;
  userRole: string;
  campaignIds: string[];
};

type JwtPayloadClaims = {
  sub: string;
  email?: string;
  role?: string;
  campaign_ids?: string[];
};

export function registerAuthDecorator(app: FastifyInstance, jwtSecret: string) {
  const secretKey = new TextEncoder().encode(jwtSecret);

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = String(request.id);
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send(errorPayload(requestId, "AUTH_TOKEN_MISSING", "token requerido"));
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
      const claims = payload as unknown as JwtPayloadClaims;

      if (!claims.sub) {
        return reply.code(401).send(errorPayload(requestId, "AUTH_TOKEN_INVALID", "token sin subject"));
      }

      // Decorate request with auth context
      (request as AuthenticatedRequest).userId = claims.sub;
      (request as AuthenticatedRequest).userEmail = claims.email ?? "";
      (request as AuthenticatedRequest).userRole = claims.role ?? "agent";
      (request as AuthenticatedRequest).campaignIds = claims.campaign_ids ?? [];
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
