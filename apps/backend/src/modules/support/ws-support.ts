/**
 * GOBERNA — Support Chat WebSocket
 *
 * Real-time internal support messaging between candidato+ users and admin.
 *
 * Protocol:
 *   - Auth: JWT via cookie (web) or query param `?token=<jwt>` (fallback)
 *   - Client→Server:
 *       { type: "send", receiverId: string, body: string }  — send a message
 *       { type: "read", otherUserId: string }                — mark messages as read
 *       { type: "ping" }                                     — keep-alive
 *   - Server→Client:
 *       { type: "connected", userId: string, ts: string }
 *       { type: "message.new", message: SupportMessage }
 *       { type: "messages.read", readerId: string, otherUserId: string }
 *       { type: "pong", ts: string }
 *       { type: "error", code: string, message: string }
 */

import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { jwtVerify, type JWTPayload } from "jose";

import type { AppEnv } from "../../config/env";
import { supportEvents } from "../../infra/support-events";
import { parseCookies } from "../../infra/auth";
import * as repo from "./repository";

// ─── Types ────────────────────────────────────────────────────

type SupportClient = {
  ws: WebSocket;
  userId: string;
};

type ClientMessage =
  | { type: "send"; receiverId: string; body: string }
  | { type: "read"; otherUserId: string }
  | { type: "ping" };

// ─── Helpers ──────────────────────────────────────────────────

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
): Promise<{ userId: string; role: string } | null> {
  // Try cookie first (web dashboard)
  const cookies = parseCookies(request.headers.cookie ?? "");
  let token = cookies.goberna_access_token ?? "";

  // Fallback: query param
  if (!token) {
    const url = new URL(request.url, "http://localhost");
    token = url.searchParams.get("token") ?? "";
  }

  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret) as {
      payload: JWTPayload & { sub?: string; role?: string };
    };
    const userId = payload.sub;
    if (!userId) return null;
    return { userId, role: payload.role ?? "agente_campo" };
  } catch {
    return null;
  }
}

// Minimum role level to use support chat
const ROLE_LEVELS: Record<string, number> = {
  admin: 50,
  consultor: 40,
  candidato: 30,
  brigadista_zonal: 20,
  agente_campo: 10,
  agente_digital: 10,
};

const MIN_SUPPORT_LEVEL = 30; // candidato+

// ─── Plugin ───────────────────────────────────────────────────

export function buildSupportWsRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const wsClients = new Set<SupportClient>();

    // Ping interval to keep connections alive through proxies
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
    supportEvents.onSupport("message.new", (payload) => {
      for (const client of wsClients) {
        // Deliver to sender and receiver
        if (client.userId === payload.senderId || client.userId === payload.receiverId) {
          sendJson(client.ws, { type: "message.new", message: payload });
        }
      }
    });

    supportEvents.onSupport("messages.read", (payload) => {
      for (const client of wsClients) {
        // Notify the other user that their messages were read
        if (client.userId === payload.otherUserId) {
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
      "/ws/support/chat",
      { websocket: true },
      async (socket, request) => {
        // ─── Auth ────────────────────────────────────
        const auth = await extractAuth(
          { headers: request.headers as { cookie?: string }, url: request.url },
          env.jwtSecret,
        );

        if (!auth) {
          sendJson(socket, { type: "error", code: "AUTH_FAILED", message: "no autenticado" });
          socket.close(4001, "not authenticated");
          return;
        }

        // Role check: candidato+ only
        const level = ROLE_LEVELS[auth.role] ?? 0;
        if (level < MIN_SUPPORT_LEVEL) {
          sendJson(socket, { type: "error", code: "FORBIDDEN", message: "rol insuficiente" });
          socket.close(4003, "forbidden");
          return;
        }

        // ─── Connection setup ────────────────────────
        const client: SupportClient = {
          ws: socket,
          userId: auth.userId,
        };
        wsClients.add(client);

        app.log.info(
          { userId: auth.userId, ws_clients: wsClients.size },
          "ws support chat connected",
        );

        sendJson(socket, {
          type: "connected",
          userId: auth.userId,
          ts: new Date().toISOString(),
        });

        // ─── Message handler ─────────────────────────
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

            try {
              const message = await repo.createMessage(auth.userId, msg.receiverId, body);
              // Broadcast via event bus (will reach WS clients)
              supportEvents.emitSupport("message.new", {
                id: message.id,
                senderId: message.sender_id,
                receiverId: message.receiver_id,
                body: message.body,
                createdAt: message.created_at,
              });
            } catch (err) {
              app.log.error({ err, userId: auth.userId }, "support chat send error");
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
              await repo.markRead(auth.userId, msg.otherUserId);
              supportEvents.emitSupport("messages.read", {
                readerId: auth.userId,
                otherUserId: msg.otherUserId,
              });
            } catch (err) {
              app.log.error({ err, userId: auth.userId }, "support chat mark read error");
            }
            return;
          }
        });

        // ─── Cleanup ─────────────────────────────────
        socket.on("close", () => {
          wsClients.delete(client);
          app.log.info(
            { userId: auth.userId, ws_clients: wsClients.size },
            "ws support chat disconnected",
          );
        });

        socket.on("error", (err: Error) => {
          app.log.warn({ err, userId: auth.userId }, "ws support chat socket error");
          wsClients.delete(client);
        });
      },
    );

    // Health sub-endpoint
    app.get("/ws/support/chat/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return {
        ok: true,
        service: "ws-support-chat",
        ts: new Date().toISOString(),
        ws_clients: wsClients.size,
      };
    });
  };
}
