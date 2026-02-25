/**
 * GOBERNA — CMS Chat WebSocket
 *
 * Real-time WhatsApp message delivery to the CMS dashboard.
 *
 * Protocol:
 *   - Auth: JWT via cookie (web) or query param `?token=<jwt>` (fallback)
 *   - Client→Server:
 *       { type: "subscribe", contactId: string }   — watch messages for a contact
 *       { type: "unsubscribe" }                     — stop watching
 *       { type: "ping" }                            — keep-alive
 *   - Server→Client:
 *       { type: "connected", ts: string }
 *       { type: "subscribed", contactId: string }
 *       { type: "message.new", contactId: string, direction: string, messageId: string }
 *       { type: "message.status", contactId: string, twilioSid: string, status: string }
 *       { type: "pong", ts: string }
 *       { type: "error", code: string, message: string }
 */

import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { jwtVerify, type JWTPayload } from "jose";

import type { AppEnv } from "../../config/env";
import { cmsEvents, type CmsMessageEvent, type CmsStatusUpdateEvent } from "../../infra/cms-events";
import { parseCookies } from "../../infra/auth";

// ─── Types ────────────────────────────────────────────────────

type ChatClient = {
  ws: WebSocket;
  userId: string;
  campaignId: string;
  subscribedContactId: string | null;
};

type ClientMessage =
  | { type: "subscribe"; contactId: string }
  | { type: "unsubscribe" }
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
): Promise<{ userId: string; campaignId: string } | null> {
  // Try cookie first (web dashboard)
  const cookies = parseCookies(request.headers.cookie ?? "");
  let token = cookies.goberna_access_token ?? "";

  // Fallback: query param (for testing or non-cookie clients)
  if (!token) {
    const url = new URL(request.url, "http://localhost");
    token = url.searchParams.get("token") ?? "";
  }

  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret) as { payload: JWTPayload & { sub?: string; campaignId?: string } };
    const userId = payload.sub;
    const campaignId = payload.campaignId as string | undefined;
    if (!userId) return null;
    return { userId, campaignId: campaignId ?? "" };
  } catch {
    return null;
  }
}

// ─── Plugin ───────────────────────────────────────────────────

export function buildCmsChatWsRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const wsClients = new Set<ChatClient>();

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
    cmsEvents.onCms("message.new", (payload: CmsMessageEvent) => {
      for (const client of wsClients) {
        if (
          client.campaignId === payload.campaignId &&
          client.subscribedContactId === payload.contactId
        ) {
          sendJson(client.ws, {
            type: "message.new",
            contactId: payload.contactId,
            direction: payload.direction,
            messageId: payload.messageId,
          });
        }
      }
    });

    cmsEvents.onCms("message.status", (payload: CmsStatusUpdateEvent) => {
      for (const client of wsClients) {
        if (
          client.campaignId === payload.campaignId &&
          client.subscribedContactId === payload.contactId
        ) {
          sendJson(client.ws, {
            type: "message.status",
            contactId: payload.contactId,
            twilioSid: payload.twilioSid,
            status: payload.status,
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
      "/ws/cms/chat",
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

        // Campaign ID from query param (web sends it explicitly)
        const url = new URL(request.url, "http://localhost");
        const campaignId = url.searchParams.get("campaignId") ?? auth.campaignId;

        if (!campaignId) {
          sendJson(socket, { type: "error", code: "MISSING_CAMPAIGN", message: "campaignId requerido" });
          socket.close(4002, "missing campaign");
          return;
        }

        // ─── Connection setup ────────────────────────
        const client: ChatClient = {
          ws: socket,
          userId: auth.userId,
          campaignId,
          subscribedContactId: null,
        };
        wsClients.add(client);

        app.log.info(
          { userId: auth.userId, campaignId, ws_clients: wsClients.size },
          "ws cms chat connected",
        );

        sendJson(socket, { type: "connected", ts: new Date().toISOString() });

        // ─── Message handler ─────────────────────────
        socket.on("message", (raw: Buffer | string) => {
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

          if (msg.type === "subscribe") {
            const contactId = msg.contactId?.trim();
            if (!contactId) {
              sendJson(socket, { type: "error", code: "INVALID_CONTACT", message: "contactId requerido" });
              return;
            }
            client.subscribedContactId = contactId;
            sendJson(socket, { type: "subscribed", contactId });
            return;
          }

          if (msg.type === "unsubscribe") {
            client.subscribedContactId = null;
            sendJson(socket, { type: "unsubscribed", ts: new Date().toISOString() });
            return;
          }
        });

        // ─── Cleanup ─────────────────────────────────
        socket.on("close", () => {
          wsClients.delete(client);
          app.log.info(
            { userId: auth.userId, campaignId, ws_clients: wsClients.size },
            "ws cms chat disconnected",
          );
        });

        socket.on("error", (err: Error) => {
          app.log.warn({ err, userId: auth.userId }, "ws cms chat socket error");
          wsClients.delete(client);
        });
      },
    );

    // Health sub-endpoint
    app.get("/ws/cms/chat/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return {
        ok: true,
        service: "ws-cms-chat",
        ts: new Date().toISOString(),
        ws_clients: wsClients.size,
      };
    });
  };
}
