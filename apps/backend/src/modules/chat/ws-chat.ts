/**
 * GOBERNA -- Field Team Chat WebSocket
 *
 * Real-time 1-to-1 messaging between brigadista_zonal and agente_campo
 * within the same campaign. Offline-first with client_id dedup.
 *
 * Protocol:
 *   - Auth: JWT via Bearer token query param `?token=<jwt>`
 *   - Campaign: query param `?campaignId=<uuid>`
 *   - Client->Server:
 *       { type: "send", receiverId: string, body: string, clientId?: string }
 *       { type: "read", otherUserId: string }
 *       { type: "ping" }
 *   - Server->Client:
 *       { type: "connected", userId: string, campaignId: string, ts: string }
 *       { type: "message.new", message: ChatMessage }
 *       { type: "message.deduped", clientId: string, messageId: string }
 *       { type: "messages.read", readerId: string, otherUserId: string }
 *       { type: "pong", ts: string }
 *       { type: "error", code: string, message: string }
 */

import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { jwtVerify, type JWTPayload } from "jose";

import type { AppEnv } from "../../config/env";
import { chatEvents } from "../../infra/chat-events";
import { parseCookies } from "../../infra/auth";
import * as repo from "./repository";

// ── Types ────────────────────────────────────────────────────

type ChatClient = {
  ws: WebSocket;
  userId: string;
  campaignId: string;
};

type ClientMessage =
  | { type: "send"; receiverId: string; body: string; clientId?: string }
  | { type: "read"; otherUserId: string }
  | { type: "ping" };

// ── Helpers ──────────────────────────────────────────────────

function sendJson(ws: WebSocket, payload: unknown): boolean {
  try {
    if (ws.readyState !== ws.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

async function extractAuth(
  request: { headers: { cookie?: string }; url: string },
  jwtSecret: string,
): Promise<{ userId: string; role: string; campaignIds: string[] } | null> {
  // Try cookie first (web — future-proof)
  const cookies = parseCookies(request.headers.cookie ?? "");
  let token = cookies.goberna_access_token ?? "";

  // Fallback: query param (mobile)
  if (!token) {
    const url = new URL(request.url, "http://localhost");
    token = url.searchParams.get("token") ?? "";
  }

  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret) as {
      payload: JWTPayload & {
        sub?: string;
        role?: string;
        campaign_ids?: string[];
      };
    };
    const userId = payload.sub;
    if (!userId) return null;
    return {
      userId,
      role: payload.role ?? "agente_campo",
      campaignIds: payload.campaign_ids ?? [],
    };
  } catch {
    return null;
  }
}

// Allowed roles for field team chat
const ALLOWED_ROLES: Record<string, boolean> = {
  admin: true,             // admin can always access (for debugging)
  brigadista_zonal: true,
  agente_campo: true,
};

// ── Plugin ───────────────────────────────────────────────────

export function buildChatWsRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const wsClients = new Set<ChatClient>();

    // Ping interval to keep connections alive through Cloudflare/Nginx
    const PING_INTERVAL_MS = 25_000;
    const pingTimer = setInterval(() => {
      for (const client of wsClients) {
        if (client.ws.readyState === client.ws.OPEN) {
          try {
            client.ws.ping();
          } catch {
            // Will be cleaned up by close handler
          }
        }
      }
    }, PING_INTERVAL_MS);
    pingTimer.unref();

    // Listen to cross-module events and forward to subscribed WS clients
    chatEvents.onChat("message.new", (payload) => {
      for (const client of wsClients) {
        // Only deliver to clients in the same campaign AND who are sender or receiver
        if (
          client.campaignId === payload.campaignId &&
          (client.userId === payload.senderId || client.userId === payload.receiverId)
        ) {
          sendJson(client.ws, {
            type: "message.new",
            message: {
              id: payload.id,
              campaign_id: payload.campaignId,
              sender_id: payload.senderId,
              receiver_id: payload.receiverId,
              body: payload.body,
              client_id: payload.clientId,
              read: false,
              created_at: payload.createdAt,
            },
          });
        }
      }
    });

    chatEvents.onChat("messages.read", (payload) => {
      for (const client of wsClients) {
        // Notify the other user that their messages were read
        if (client.campaignId === payload.campaignId && client.userId === payload.otherUserId) {
          sendJson(client.ws, {
            type: "messages.read",
            readerId: payload.readerId,
            otherUserId: payload.otherUserId,
          });
        }
      }
    });

    app.addHook("onClose", () => {
      clearInterval(pingTimer);
      for (const client of wsClients) {
        try {
          client.ws.close(1001, "server shutting down");
        } catch {
          // Ignore
        }
      }
      wsClients.clear();
    });

    app.get(
      "/ws/chat",
      { websocket: true },
      async (socket, request) => {
        // ── Auth ─────────────────────────────────────
        const auth = await extractAuth(
          { headers: request.headers as { cookie?: string }, url: request.url },
          env.jwtSecret,
        );

        if (!auth) {
          sendJson(socket, { type: "error", code: "AUTH_FAILED", message: "no autenticado" });
          socket.close(4001, "not authenticated");
          return;
        }

        // Role check
        if (!ALLOWED_ROLES[auth.role]) {
          sendJson(socket, { type: "error", code: "FORBIDDEN", message: "rol no permitido para chat de campo" });
          socket.close(4003, "forbidden");
          return;
        }

        // Extract campaignId from query params
        const url = new URL(request.url, "http://localhost");
        const campaignId = url.searchParams.get("campaignId") ?? "";

        if (!campaignId) {
          sendJson(socket, { type: "error", code: "MISSING_CAMPAIGN", message: "campaignId requerido" });
          socket.close(4002, "missing campaign");
          return;
        }

        // Verify the user belongs to this campaign
        if (auth.role !== "admin" && !auth.campaignIds.includes(campaignId)) {
          sendJson(socket, { type: "error", code: "CAMPAIGN_DENIED", message: "sin acceso a esta campana" });
          socket.close(4003, "campaign denied");
          return;
        }

        // ── Connection setup ─────────────────────────
        const client: ChatClient = {
          ws: socket,
          userId: auth.userId,
          campaignId,
        };
        wsClients.add(client);

        app.log.info(
          { userId: auth.userId, campaignId, ws_clients: wsClients.size },
          "ws chat connected",
        );

        sendJson(socket, {
          type: "connected",
          userId: auth.userId,
          campaignId,
          ts: new Date().toISOString(),
        });

        // ── Message handler ──────────────────────────
        socket.on("message", async (raw: Buffer | string) => {
          let msg: ClientMessage;
          try {
            const text = typeof raw === "string" ? raw : raw.toString("utf-8");
            msg = JSON.parse(text) as ClientMessage;
          } catch {
            sendJson(socket, { type: "error", code: "INVALID_JSON", message: "JSON invalido" });
            return;
          }

          if (msg.type === "ping") {
            sendJson(socket, { type: "pong", ts: new Date().toISOString() });
            return;
          }

          if (msg.type === "send") {
            const body = msg.body?.trim();
            if (!body || !msg.receiverId) {
              sendJson(socket, { type: "error", code: "INVALID_MESSAGE", message: "body y receiverId requeridos" });
              return;
            }

            if (body.length > 2000) {
              sendJson(socket, { type: "error", code: "MESSAGE_TOO_LONG", message: "maximo 2000 caracteres" });
              return;
            }

            // Verify receiver is in the same campaign
            const receiverInCampaign = await repo.isCampaignMember(campaignId, msg.receiverId);
            if (!receiverInCampaign) {
              sendJson(socket, { type: "error", code: "RECEIVER_NOT_IN_CAMPAIGN", message: "destinatario no pertenece a la campana" });
              return;
            }

            try {
              const { message, deduped } = await repo.createMessage(
                campaignId,
                auth.userId,
                msg.receiverId,
                body,
                msg.clientId ?? null,
              );

              if (deduped) {
                // Client retried — message already existed. Ack without re-broadcasting.
                sendJson(socket, {
                  type: "message.deduped",
                  clientId: msg.clientId ?? null,
                  messageId: message.id,
                });
              } else {
                // New message — broadcast via event bus
                chatEvents.emitChat("message.new", {
                  id: message.id,
                  campaignId: message.campaign_id,
                  senderId: message.sender_id,
                  receiverId: message.receiver_id,
                  body: message.body,
                  clientId: message.client_id,
                  createdAt: message.created_at,
                });
              }
            } catch (err) {
              app.log.error({ err, userId: auth.userId, campaignId }, "chat send error");
              sendJson(socket, { type: "error", code: "SEND_FAILED", message: "error enviando mensaje" });
            }
            return;
          }

          if (msg.type === "read") {
            if (!msg.otherUserId) {
              sendJson(socket, { type: "error", code: "INVALID_READ", message: "otherUserId requerido" });
              return;
            }

            try {
              await repo.markRead(campaignId, auth.userId, msg.otherUserId);
              chatEvents.emitChat("messages.read", {
                campaignId,
                readerId: auth.userId,
                otherUserId: msg.otherUserId,
              });
            } catch (err) {
              app.log.error({ err, userId: auth.userId, campaignId }, "chat mark read error");
            }
            return;
          }
        });

        // ── Cleanup ──────────────────────────────────
        socket.on("close", () => {
          wsClients.delete(client);
          app.log.info(
            { userId: auth.userId, campaignId, ws_clients: wsClients.size },
            "ws chat disconnected",
          );
        });

        socket.on("error", (err: Error) => {
          app.log.warn({ err, userId: auth.userId, campaignId }, "ws chat socket error");
          wsClients.delete(client);
        });
      },
    );

    // Health sub-endpoint
    app.get("/ws/chat/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return {
        ok: true,
        service: "ws-field-chat",
        ts: new Date().toISOString(),
        ws_clients: wsClients.size,
      };
    });
  };
}
