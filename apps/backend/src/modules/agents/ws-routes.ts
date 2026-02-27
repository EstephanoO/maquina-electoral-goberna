/**
 * WebSocket tracking endpoint for mobile agent ingest.
 *
 * Protocol:
 *   - Auth: `x-agent-token` sent as query param `?token=<value>`
 *   - Client→Server messages (JSON):
 *       { type: "location", data: AgentLocationInput }
 *       { type: "location.batch", data: AgentLocationInput[] }
 *       { type: "ping" }
 *   - Server→Client messages (JSON):
 *       { type: "ack", seq: number, server_ts: string }
 *       { type: "ack.batch", accepted: number, deduped: number, failed: number, server_ts: string }
 *       { type: "pong", server_ts: string }
 *       { type: "config", interval_ms?: number, distance_m?: number }
 *       { type: "error", code: string, message: string }
 *
 * Features:
 *   - Same ingest pipeline as HTTP (Redis Streams write-behind + in-memory store + SSE broadcast)
 *   - Per-connection rate limit (burst protection)
 *   - Ping/pong keep-alive (server sends ping every 25s, expects pong within 10s)
 *   - Graceful close on auth failure or protocol violation
 *   - Metrics: ws_connections, ws_messages_in, ws_messages_out
 */

import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "@fastify/websocket";

import type { AppEnv } from "../../config/env";
import { metricsRegistry } from "../../infra/metrics";
import { resolveWsTrackingAuth, type TrackingAuthResult } from "../../infra/tracking-auth";
import { emitCampaignEvent } from "../campaigns/routes";
import { toState } from "./helpers";
import { agentLocationBatchSchema } from "./schema";
import type { AgentsStore } from "./store";
import type { AgentLocationInput } from "./types";
import type { AgentsWriteBehindQueue } from "./write-behind-queue";

// ─── Types ────────────────────────────────────────────────────

type IngestContext = {
  store: AgentsStore;
  queue: AgentsWriteBehindQueue;
  pendingBatchByAgent: Map<string, AgentLocationInput>;
  previouslyOnlineAgents: Map<string, { campaignId: string | null; agentName: string }>;
  lastIngestAtMs: { value: number | null };
};

type ClientMessage =
  | { type: "location"; data: unknown }
  | { type: "location.batch"; data: unknown[] }
  | { type: "ping" }
  | { type: "pong" };

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

async function ingestSingle(
  data: unknown,
  ctx: IngestContext,
  logger: { info: (obj: Record<string, unknown>, msg: string) => void; warn: (obj: Record<string, unknown>, msg: string) => void },
): Promise<{ accepted: boolean; deduped: boolean; seq: number; agentId: string }> {
  const next = toState(data, "ws");
  const current = ctx.store.get(next.agentId);

  if (current && next.seq <= current.seq) {
    metricsRegistry.incCounter("tracking_dedupe_total", "live_seq");
    return { accepted: false, deduped: true, seq: next.seq, agentId: next.agentId };
  }

  const queueResult = await ctx.queue.enqueue(next);
  if (queueResult.queueFull) {
    return { accepted: false, deduped: false, seq: next.seq, agentId: next.agentId };
  }
  if (queueResult.deduped) {
    metricsRegistry.incCounter("tracking_dedupe_total", "pending_seq");
    return { accepted: false, deduped: true, seq: next.seq, agentId: next.agentId };
  }

  // Update in-memory store
  const wasOnline = ctx.previouslyOnlineAgents.has(next.agentId);
  ctx.store.upsert(next);
  const agent = ctx.store.serialize(next);

  // Track for disconnect events
  if (!wasOnline && next.campaignId) {
    const agentName = next.agentName ?? `Agente ${next.agentId.slice(0, 8)}`;
    ctx.previouslyOnlineAgents.set(next.agentId, {
      campaignId: next.campaignId,
      agentName,
    });
    emitCampaignEvent(next.campaignId, {
      type: "agent_connected",
      agent_id: next.agentId,
      agent_name: agentName,
      message: `${agentName} se conecto`,
    });
  } else if (next.campaignId) {
    const existing = ctx.previouslyOnlineAgents.get(next.agentId);
    if (existing) {
      existing.campaignId = next.campaignId;
      if (next.agentName) existing.agentName = next.agentName;
    }
  }

  ctx.lastIngestAtMs.value = Date.now();
  ctx.pendingBatchByAgent.set(agent.agent_id, agent);
  metricsRegistry.incCounter("tracking_ingest_total", "202");

  return { accepted: true, deduped: false, seq: next.seq, agentId: next.agentId };
}

// ─── Plugin ───────────────────────────────────────────────────

export function buildAgentsWsRoutes(env: AppEnv, ctx: IngestContext): FastifyPluginAsync {
  return async (app) => {
    const wsClients = new Set<WebSocket>();

    // Server-level ping/pong interval
    const WS_PING_INTERVAL_MS = 25_000;
    const WS_PONG_TIMEOUT_MS = 10_000;

    // Per-connection burst limit
    const MAX_MESSAGES_PER_SECOND = 10;

    const pingTimer = setInterval(() => {
      for (const ws of wsClients) {
        if (ws.readyState === ws.OPEN) {
          try {
            ws.ping();
          } catch {
            // Will be cleaned up by close handler
          }
        }
      }
    }, WS_PING_INTERVAL_MS);
    pingTimer.unref();

    app.addHook("onClose", () => {
      clearInterval(pingTimer);
      for (const ws of wsClients) {
        try {
          ws.close(1001, "server shutting down");
        } catch {
          // Ignore
        }
      }
      wsClients.clear();
    });

    app.get(
      "/ws/tracking",
      { websocket: true },
      async (socket, request) => {
        // ─── Dual-mode auth ──────────────────────────
        // New mobile sends JWT as ?token=<jwt> (has dots)
        // Old mobile sends shared secret as ?token=<legacy_token>
        const urlParams = new URL(request.url, "http://localhost").searchParams;
        const token = urlParams.get("token") ?? "";

        const auth = await resolveWsTrackingAuth(token, env.jwtSecret, env.agentIngestToken);
        if (!auth.ok) {
          metricsRegistry.incCounter("ws_auth_failed", auth.code);
          app.log.warn({ ip: request.ip, auth_code: auth.code }, "ws tracking auth failed");
          sendJson(socket, { type: "error", code: auth.code, message: auth.message });
          socket.close(4001, "auth failed");
          return;
        }

        const authMethod = auth.method; // "jwt" or "legacy_token"

        // ─── Connection setup ────────────────────────
        wsClients.add(socket);
        metricsRegistry.incCounter("ws_connections", "open");
        if (authMethod === "jwt") {
          metricsRegistry.incCounter("ws_auth_method", "jwt");
        } else {
          metricsRegistry.incCounter("ws_auth_method", "legacy_token");
        }

        // Rate limiting: sliding window per second
        let messageCount = 0;
        let windowStartMs = Date.now();

        // Track which agent is behind this socket.
        // For JWT auth, the agent is known immediately from the token.
        // For legacy auth, it's resolved from the first location message.
        let identifiedAgentId: string | null = auth.method === "jwt" ? auth.agentId : null;

        // If JWT auth, register agent immediately (don't wait for first location)
        if (identifiedAgentId) {
          ctx.store.addWsAgent(identifiedAgentId);
          app.log.info({ agent_id: identifiedAgentId, ip: request.ip, auth: "jwt" }, "ws agent identified (jwt)");
        }

        // Pong tracking for dead connection detection
        let lastPongMs = Date.now();
        const pongCheckTimer = setInterval(() => {
          if (Date.now() - lastPongMs > WS_PING_INTERVAL_MS + WS_PONG_TIMEOUT_MS) {
            app.log.info({ ip: request.ip, agent_id: identifiedAgentId }, "ws tracking pong timeout");
            socket.terminate();
          }
        }, WS_PONG_TIMEOUT_MS);
        pongCheckTimer.unref?.();

        socket.on("pong", () => {
          lastPongMs = Date.now();
          // Keep the agent alive in the store while WS is active (resolves 8.2).
          // This prevents a stationary agent from being marked as stale
          // just because no GPS updates are coming.
          const pongAgent = identifiedAgentId;
          if (pongAgent) {
            ctx.store.touchLastSeen(pongAgent);
          }
        });

        // Send welcome with current config (values from env, not hardcoded)
        sendJson(socket, {
          type: "config",
          interval_ms: env.trackingDefaultIntervalMs,
          distance_m: env.trackingDefaultDistanceM,
          server_ts: new Date().toISOString(),
        });

        // ─── Message handler ─────────────────────────
        socket.on("message", async (raw: Buffer | string) => {
          // Rate limit check
          const now = Date.now();
          if (now - windowStartMs > 1000) {
            messageCount = 0;
            windowStartMs = now;
          }
          messageCount++;
          if (messageCount > MAX_MESSAGES_PER_SECOND) {
            sendJson(socket, { type: "error", code: "RATE_LIMITED", message: "demasiados mensajes" });
            return;
          }

          let msg: ClientMessage;
          try {
            const text = typeof raw === "string" ? raw : raw.toString("utf-8");
            msg = JSON.parse(text) as ClientMessage;
          } catch {
            sendJson(socket, { type: "error", code: "INVALID_JSON", message: "JSON invalido" });
            return;
          }

          try {
            if (msg.type === "ping") {
              sendJson(socket, { type: "pong", server_ts: new Date().toISOString() });
              return;
            }

            if (msg.type === "pong") {
              // Application-level pong — update timestamps
              lastPongMs = Date.now();
              const pongAgent2 = identifiedAgentId;
              if (pongAgent2) {
                ctx.store.touchLastSeen(pongAgent2);
              }
              return;
            }

            if (msg.type === "location") {
              // When JWT auth, override agent_id in payload with server-authoritative identity
              const locationData = authMethod === "jwt" && auth.agentId
                ? { ...(msg.data as Record<string, unknown>), agent_id: auth.agentId }
                : msg.data;
              const result = await ingestSingle(locationData, ctx, app.log);

              // Identify this socket's agent from the first successful ingest (legacy only)
              if (!identifiedAgentId && result.agentId) {
                identifiedAgentId = result.agentId;
                ctx.store.addWsAgent(result.agentId);
                app.log.info({ agent_id: result.agentId, ip: request.ip, auth: authMethod }, "ws agent identified");
              }

              sendJson(socket, {
                type: "ack",
                seq: result.seq,
                accepted: result.accepted,
                deduped: result.deduped,
                server_ts: new Date().toISOString(),
              });
              metricsRegistry.incCounter("ws_messages_in", "location");
              return;
            }

            if (msg.type === "location.batch") {
              // When JWT auth, override agent_id in all batch payloads
              const batchData = authMethod === "jwt" && auth.agentId
                ? (msg.data as Array<Record<string, unknown>>).map((loc) => ({ ...loc, agent_id: auth.agentId }))
                : msg.data;

              const parsed = agentLocationBatchSchema.safeParse({ locations: batchData });
              if (!parsed.success) {
                sendJson(socket, { type: "error", code: "INVALID_PAYLOAD", message: "batch invalido" });
                return;
              }

              let accepted = 0;
              let deduped = 0;
              let failed = 0;

              // Process batch with bounded concurrency (up to 10 parallel Redis calls)
              // instead of fully sequential to reduce total latency on large batches.
              const CONCURRENCY = 10;
              const locations = parsed.data.locations;

              for (let i = 0; i < locations.length; i += CONCURRENCY) {
                const chunk = locations.slice(i, i + CONCURRENCY);
                const results = await Promise.allSettled(
                  chunk.map((loc) => ingestSingle(loc, ctx, app.log)),
                );
                for (const result of results) {
                  if (result.status === "fulfilled") {
                    if (result.value.accepted) accepted++;
                    else if (result.value.deduped) deduped++;
                    else failed++;

                    // Identify this socket's agent from the first successful ingest
                    if (!identifiedAgentId && result.value.agentId) {
                      identifiedAgentId = result.value.agentId;
                      ctx.store.addWsAgent(result.value.agentId);
                      app.log.info({ agent_id: result.value.agentId, ip: request.ip }, "ws agent identified (batch)");
                    }
                  } else {
                    failed++;
                  }
                }
              }

              sendJson(socket, {
                type: "ack.batch",
                accepted,
                deduped,
                failed,
                server_ts: new Date().toISOString(),
              });
              metricsRegistry.incCounter("ws_messages_in", "location.batch");
              return;
            }

            // Unknown message type — ignore silently
          } catch (error) {
            const message = error instanceof Error ? error.message : "error desconocido";
            app.log.error({ err: error }, "ws tracking message error");
            sendJson(socket, { type: "error", code: "INGEST_ERROR", message });
          }
        });

        // ─── Cleanup ─────────────────────────────────
        const cleanupWs = () => {
          clearInterval(pongCheckTimer);
          wsClients.delete(socket);
          const agentToRemove = identifiedAgentId;
          if (agentToRemove) {
            ctx.store.removeWsAgent(agentToRemove);
            app.log.info({ agent_id: agentToRemove }, "ws agent disconnected");
          }
        };

        socket.on("close", () => {
          cleanupWs();
          metricsRegistry.incCounter("ws_connections", "close");
        });

        socket.on("error", (err: Error) => {
          app.log.warn({ err, agent_id: identifiedAgentId }, "ws tracking socket error");
          cleanupWs();
        });
      },
    );

    // ─── Health sub-endpoint for WS ──────────────────
    app.get("/ws/tracking/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return {
        ok: true,
        service: "ws-tracking",
        ts: new Date().toISOString(),
        ws_clients: wsClients.size,
        ws_identified_agents: ctx.store.wsAgentCount,
      };
    });
  };
}
