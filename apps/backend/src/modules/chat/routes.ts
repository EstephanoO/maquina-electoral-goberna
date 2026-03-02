/**
 * GOBERNA -- Field Team Chat REST Routes
 *
 * HTTP endpoints for:
 *   - 1-to-1 direct messages (chat history, unread counts, conversations, team members)
 *   - Campaign channel (group messages, unread count, read cursor)
 *
 * Real-time messaging goes through WebSocket (ws-chat.ts).
 * All endpoints are campaign-scoped and require brigadista_zonal or agente_campo role.
 */

import type { FastifyPluginAsync } from "fastify";
import { SignJWT } from "jose";
import type { AppEnv } from "../../config/env";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { buildChatWsRoutes } from "./ws-chat";
import * as repo from "./repository";

export function buildChatRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // Register WebSocket routes
    app.register(buildChatWsRoutes(env));

    // ── GET /api/chat/conversations ── List conversation threads for current user
    app.get(
      "/api/chat/conversations",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const campaignId = request.activeCampaignId!;
        const conversations = await repo.listConversations(campaignId, userId);
        return reply.send({ ok: true, request_id: requestId, conversations });
      },
    );

    // ── GET /api/chat/messages/:otherUserId ── Get conversation with a user
    app.get(
      "/api/chat/messages/:otherUserId",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const campaignId = request.activeCampaignId!;
        const { otherUserId } = request.params as { otherUserId: string };
        const { limit, before } = request.query as { limit?: string; before?: string };

        const messages = await repo.getConversation(
          campaignId,
          userId,
          otherUserId,
          Math.min(Number(limit) || 50, 100),
          before || undefined,
        );
        return reply.send({ ok: true, request_id: requestId, messages });
      },
    );

    // ── GET /api/chat/unread ── Unread message count for current user
    app.get(
      "/api/chat/unread",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const campaignId = request.activeCampaignId!;
        const count = await repo.getUnreadCount(campaignId, userId);
        return reply.send({ ok: true, request_id: requestId, count });
      },
    );

    // ── POST /api/chat/read/:otherUserId ── Mark messages as read
    app.post(
      "/api/chat/read/:otherUserId",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const campaignId = request.activeCampaignId!;
        const { otherUserId } = request.params as { otherUserId: string };
        const updated = await repo.markRead(campaignId, userId, otherUserId);
        return reply.send({ ok: true, request_id: requestId, updated });
      },
    );

    // ── GET /api/chat/team ── List team members the user can chat with
    app.get(
      "/api/chat/team",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const campaignId = request.activeCampaignId!;
        const members = await repo.listChatableMembers(campaignId, userId);
        return reply.send({ ok: true, request_id: requestId, members });
      },
    );

    // ── GET /api/chat/ws-token ── Short-lived JWT for WebSocket auth
    // Mobile calls this endpoint with Bearer token, gets a 30-second JWT
    // to pass as ?token= to the WebSocket connection.
    app.get(
      "/api/chat/ws-token",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"] }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const userRole = (request as unknown as { userRole: string }).userRole;
        const campaignIds = (request as unknown as { campaignIds: string[] }).campaignIds;

        const secret = new TextEncoder().encode(env.jwtSecret);
        const token = await new SignJWT({
          sub: userId,
          role: userRole,
          campaign_ids: campaignIds,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("30s")
          .sign(secret);

        return reply.send({ ok: true, request_id: requestId, token });
      },
    );

    // ══════════════════════════════════════════════════════════
    // ── Channel (Group) Endpoints ────────────────────────────
    // ══════════════════════════════════════════════════════════

    // ── GET /api/chat/channel/messages ── Channel message history
    app.get(
      "/api/chat/channel/messages",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId!;
        const { limit, before } = request.query as { limit?: string; before?: string };

        const messages = await repo.getChannelMessages(
          campaignId,
          Math.min(Number(limit) || 50, 100),
          before || undefined,
        );
        return reply.send({ ok: true, request_id: requestId, messages });
      },
    );

    // ── GET /api/chat/channel/unread ── Channel unread count
    app.get(
      "/api/chat/channel/unread",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const campaignId = request.activeCampaignId!;
        const count = await repo.getChannelUnreadCount(campaignId, userId);
        return reply.send({ ok: true, request_id: requestId, count });
      },
    );

    // ── POST /api/chat/channel/read ── Update channel read cursor
    app.post(
      "/api/chat/channel/read",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const userId = (request as unknown as { userId: string }).userId;
        const campaignId = request.activeCampaignId!;
        const lastReadAt = await repo.updateChannelReadCursor(campaignId, userId);
        return reply.send({ ok: true, request_id: requestId, last_read_at: lastReadAt });
      },
    );

    // ── GET /api/chat/channel/info ── Channel metadata (member count)
    app.get(
      "/api/chat/channel/info",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["agente_campo"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId!;
        const memberCount = await repo.getChannelMemberCount(campaignId);
        return reply.send({ ok: true, request_id: requestId, member_count: memberCount });
      },
    );
  };
}
