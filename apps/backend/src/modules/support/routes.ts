/**
 * GOBERNA — Support Chat REST Routes
 *
 * HTTP endpoints for support chat history, unread counts, and conversations list.
 * Real-time messaging goes through WebSocket (ws-support.ts).
 */

import type { FastifyPluginAsync } from "fastify";
import { SignJWT } from "jose";
import type { AppEnv } from "../../config/env";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { buildSupportWsRoutes } from "./ws-support";
import * as repo from "./repository";

export function buildSupportRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // Register WebSocket routes
    app.register(buildSupportWsRoutes(env));

    // ── GET /api/support/conversations ── Admin: list all conversation threads
    app.get(
      "/api/support/conversations",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const conversations = await repo.listConversations(userId);
        return reply.send({ ok: true, request_id: requestId, conversations });
      },
    );

    // ── GET /api/support/messages/:otherUserId ── Get conversation with a user
    app.get(
      "/api/support/messages/:otherUserId",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const { otherUserId } = request.params as { otherUserId: string };
        const { limit, before } = request.query as { limit?: string; before?: string };

        const messages = await repo.getConversation(
          userId,
          otherUserId,
          Math.min(Number(limit) || 50, 100),
          before || undefined,
        );
        return reply.send({ ok: true, request_id: requestId, messages });
      },
    );

    // ── GET /api/support/unread ── Unread message count for current user
    app.get(
      "/api/support/unread",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const count = await repo.getUnreadCount(userId);
        return reply.send({ ok: true, request_id: requestId, count });
      },
    );

    // ── POST /api/support/read/:otherUserId ── Mark messages as read
    app.post(
      "/api/support/read/:otherUserId",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const { otherUserId } = request.params as { otherUserId: string };
        const updated = await repo.markRead(userId, otherUserId);
        return reply.send({ ok: true, request_id: requestId, updated });
      },
    );

    // ── GET /api/support/admins ── Get admin user IDs (so candidato knows who to message)
    app.get(
      "/api/support/admins",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const adminIds = await repo.getAdminIds();
        return reply.send({ ok: true, request_id: requestId, adminIds });
      },
    );

    // ── GET /api/support/ws-token ── Short-lived JWT for WebSocket auth
    // The browser can't send httpOnly cookies cross-origin to wss://api.goberna.us,
    // so the frontend calls this endpoint through the Next.js proxy (same-origin,
    // cookies travel), gets a 30-second token, then passes it as ?token= to the WS.
    app.get(
      "/api/support/ws-token",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const userRole = (request as unknown as { userRole: string }).userRole;

        const secret = new TextEncoder().encode(env.jwtSecret);
        const token = await new SignJWT({ sub: userId, role: userRole })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("30s")
          .sign(secret);

        return reply.send({ ok: true, request_id: requestId, token });
      },
    );
  };
}
