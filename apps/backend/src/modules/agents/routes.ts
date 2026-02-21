import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { errorPayload } from "../../infra/http";
import type { IngestOutcome } from "../../infra/metrics";
import { metricsRegistry } from "../../infra/metrics";
import { emitCampaignEvent } from "../campaigns/routes";
import { loadAllLiveAgentLocations } from "./repository";
import { agentLocationBatchSchema, agentLocationSchema } from "./schema";
import { AgentsStore } from "./store";
import type { AgentLiveState, AgentLocationInput } from "./types";
import { AgentsWriteBehindQueue } from "./write-behind-queue";
import { buildAgentsWsRoutes } from "./ws-routes";

// Track which agents were previously online (for disconnect events)
const previouslyOnlineAgents = new Map<string, { campaignId: string | null; agentName: string }>();

function toState(value: unknown): AgentLiveState {
  const parsed = agentLocationSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("payload invalido");
  }

  return {
    agentId: parsed.data.agent_id,
    agentName: parsed.data.agent_name ?? null,
    ts: new Date(parsed.data.ts).toISOString(),
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    accuracy: parsed.data.accuracy ?? null,
    speed: parsed.data.speed ?? null,
    heading: parsed.data.heading ?? null,
    battery: parsed.data.battery ?? null,
    seq: parsed.data.seq,
    campaignId: parsed.data.campaign_id ?? null,
    receivedAt: new Date().toISOString(),
    lastSeenAtMs: Date.now(),
  };
}

function writeSseEvent(res: ServerResponse, event: string, payload: unknown): boolean {
  try {
    const okEvent = res.write(`event: ${event}\n`);
    const okData = res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return okEvent && okData;
  } catch {
    return false;
  }
}

export function buildAgentsRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const store = new AgentsStore(env);
    const queue = new AgentsWriteBehindQueue({
      maxQueue: env.trackingWriteBehindMaxQueue,
      batchSize: env.trackingWriteBehindBatchSize,
      flushMs: env.trackingWriteBehindFlushMs,
      streamKey: env.trackingStreamKey,
      streamGroup: env.trackingStreamGroup,
      seqHashKey: env.trackingSeqHashKey,
      streamMaxLen: env.trackingStreamMaxLen,
      dlqStreamKey: env.trackingDlqStreamKey,
      claimIdleMs: env.streamClaimIdleMs,
      claimBatchSize: env.streamClaimBatchSize,
      dlqMaxAttempts: env.streamDlqMaxAttempts,
      logger: app.log,
    });

    const seeded = await loadAllLiveAgentLocations();
    store.seed(seeded);
    await queue.start();

    type SSEClient = {
      res: ServerResponse;
      campaignIds: string[];
      isAdmin: boolean;
    };

    const clients = new Map<number, SSEClient>();
    let clientSeq = 0;
    let lastIngestAtMs: number | null = null;
    const pendingBatchByAgent = new Map<string, AgentLocationInput>();

    const pruneSlowClients = (entries: Array<[number, SSEClient]>) => {
      for (const [clientId, client] of entries) {
        try {
          client.res.end();
        } catch {
          // ignore close errors
        }
        clients.delete(clientId);
      }
    };

    /** Broadcast to all clients (heartbeat, agent.offline — no filtering needed) */
    const broadcastAll = (event: string, payload: unknown) => {
      const toPrune: Array<[number, SSEClient]> = [];
      for (const entry of clients.entries()) {
        const [clientId, client] = entry;
        const writable = writeSseEvent(client.res, event, payload);
        if (!writable) {
          toPrune.push([clientId, client]);
        }
      }
      if (toPrune.length > 0) {
        pruneSlowClients(toPrune);
      }
    };

    /** Broadcast location batch filtered per-client by campaign_id */
    const broadcastFiltered = (agents: AgentLocationInput[]) => {
      if (clients.size === 0) return;
      const toPrune: Array<[number, SSEClient]> = [];
      const ts = new Date().toISOString();

      for (const [clientId, client] of clients.entries()) {
        // Admins get all agents; others get only their campaigns
        const filtered = client.isAdmin
          ? agents
          : agents.filter((a) => a.campaign_id && client.campaignIds.includes(a.campaign_id));

        if (filtered.length === 0) continue;

        const writable = writeSseEvent(client.res, "location.batch", { ts, agents: filtered });
        if (!writable) {
          toPrune.push([clientId, client]);
        }
      }
      if (toPrune.length > 0) {
        pruneSlowClients(toPrune);
      }
    };

    const batchFlushTimer = setInterval(() => {
      if (pendingBatchByAgent.size === 0) return;
      const agents = Array.from(pendingBatchByAgent.values());
      pendingBatchByAgent.clear();
      broadcastFiltered(agents);
    }, env.agentStreamBatchFlushMs);
    batchFlushTimer.unref();

    const heartbeatTimer = setInterval(() => {
      broadcastAll("heartbeat", { ts: new Date().toISOString() });
    }, env.agentStreamHeartbeatMs);
    heartbeatTimer.unref();

    const staleSweepTimer = setInterval(() => {
      const removed = store.removeStale();
      for (const agentId of removed) {
        const agentInfo = previouslyOnlineAgents.get(agentId);
        broadcastAll("agent.offline", {
          agent_id: agentId,
          agent_name: agentInfo?.agentName ?? `Agente ${agentId.slice(0, 8)}`,
          ts: new Date().toISOString(),
        });
        
        // Emit disconnect event for campaign dashboard
        if (agentInfo?.campaignId) {
          emitCampaignEvent(agentInfo.campaignId, {
            type: "agent_disconnected",
            agent_id: agentId,
            agent_name: agentInfo.agentName,
            message: `${agentInfo.agentName} se desconecto`,
          });
        }
        previouslyOnlineAgents.delete(agentId);
      }

      const queueStats = queue.getStats();
      metricsRegistry.setGauge("tracking_queue_depth", queueStats.depth);
      metricsRegistry.setGauge("tracking_sse_clients", clients.size);
      metricsRegistry.setGauge("tracking_online_agents", store.listLive().length);
      if (queueStats.lastFlushAtMs) {
        metricsRegistry.setGauge("tracking_last_flush_age_ms", Date.now() - queueStats.lastFlushAtMs);
      }
    }, Math.max(5000, Math.floor(env.agentStaleAfterMs / 2)));
    staleSweepTimer.unref();

    app.addHook("onClose", async () => {
      clearInterval(batchFlushTimer);
      clearInterval(heartbeatTimer);
      clearInterval(staleSweepTimer);
      queue.stop();
      await queue.drain();
      for (const client of clients.values()) {
        client.res.end();
      }
      clients.clear();
    });

    // ─── WebSocket tracking endpoint ─────────────────────────
    // Shares the same ingest pipeline (store, queue, SSE broadcast)
    app.register(
      buildAgentsWsRoutes(env, {
        store,
        queue,
        pendingBatchByAgent,
        previouslyOnlineAgents,
        lastIngestAtMs: { get value() { return lastIngestAtMs; }, set value(v) { lastIngestAtMs = v; } },
      }),
    );

    app.get(
      "/api/agents/live",
      {
        preHandler: [app.authenticate],
        config: {
          rateLimit: {
            max: env.rateLimitAgentsLivePerMinute,
            timeWindow: "1 minute",
          },
        },
      },
      async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        const authed = request as AuthenticatedRequest;
        const campaignIds = authed.campaignIds;
        const allAgents = store.listLive();
        // Admins see everything; others are scoped to their campaigns
        const agents =
          authed.userRole === "admin"
            ? allAgents
            : allAgents.filter((a) => a.campaign_id && campaignIds.includes(a.campaign_id));
        return { ok: true, ts: new Date().toISOString(), agents };
      },
    );

    app.get("/api/agents/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");

      const now = Date.now();
      const onlineAgents = store.listLive().length;
      const queueStats = queue.getStats();

      return {
        ok: true,
        service: "agents-tracking",
        ts: new Date().toISOString(),
        online_agents: onlineAgents,
        sse_clients: clients.size,
        stale_after_ms: env.agentStaleAfterMs,
        heartbeat_ms: env.agentStreamHeartbeatMs,
        queue_depth: queueStats.depth,
        queue_flushing: queueStats.flushing,
        last_flush_at: queueStats.lastFlushAtMs ? new Date(queueStats.lastFlushAtMs).toISOString() : null,
        last_flush_duration_ms: queueStats.lastFlushDurationMs,
        last_flush_attempted: queueStats.lastFlushAttempted,
        last_flush_accepted: queueStats.lastFlushAccepted,
        last_ingest_at: lastIngestAtMs ? new Date(lastIngestAtMs).toISOString() : null,
        last_ingest_age_ms: lastIngestAtMs ? now - lastIngestAtMs : null,
      };
    });

    app.get(
      "/api/agents/stream",
      {
        preHandler: [app.authenticate],
        config: {
          rateLimit: {
            max: env.rateLimitAgentsStreamPerMinute,
            timeWindow: "1 minute",
          },
        },
      },
      async (request, reply) => {
        reply.raw.statusCode = 200;
        reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
        reply.raw.setHeader("Connection", "keep-alive");
        reply.raw.setHeader("X-Accel-Buffering", "no");
        reply.raw.flushHeaders?.();

        const authed = request as AuthenticatedRequest;
        const campaignIds = authed.campaignIds;
        const isAdmin = authed.userRole === "admin";

        const clientId = ++clientSeq;
        clients.set(clientId, { res: reply.raw, campaignIds, isAdmin });

        const filterAgents = (list: AgentLocationInput[]) =>
          isAdmin ? list : list.filter((a) => a.campaign_id && campaignIds.includes(a.campaign_id));

        reply.raw.write("retry: 5000\n\n");
        writeSseEvent(reply.raw, "snapshot", { ts: new Date().toISOString(), agents: filterAgents(store.listLive()) });

        const cleanup = () => {
          clients.delete(clientId);
        };

        request.raw.on("close", cleanup);
        request.raw.on("end", cleanup);
        request.raw.on("error", cleanup);

        return reply;
      },
    );

    app.post(
      "/api/agents/location",
      {
        config: {
          rateLimit: {
            max: env.rateLimitAgentsLocationPerMinute,
            timeWindow: "1 minute",
            keyGenerator: (request: { headers: Record<string, unknown>; ip: string }) =>
              String(request.headers["x-agent-id"] ?? request.headers["x-agent-token"] ?? request.ip),
          },
        },
      },
      async (request, reply) => {
        const requestId = String(request.id);
        const markOutcome = (outcome: IngestOutcome) => {
          (request as unknown as { __ingestOutcome?: IngestOutcome }).__ingestOutcome = outcome;
        };

        if (env.agentIngestToken) {
          const provided = String(request.headers["x-agent-token"] ?? "").trim();
          if (!provided || provided !== env.agentIngestToken) {
            markOutcome("auth_failed");
            metricsRegistry.incCounter("tracking_ingest_total", "401");
            metricsRegistry.incCounter("tracking_invalid_token_total", "invalid");
            app.log.warn(
              {
                request_id: requestId,
                ip: request.ip,
                agent_id_header: String(request.headers["x-agent-id"] ?? ""),
                has_token: provided.length > 0,
              },
              "tracking invalid token",
            );
            return reply.code(401).send(errorPayload(requestId, "INVALID_TOKEN", "token invalido"));
          }
        }

        try {
          const next = toState(request.body);
          const current = store.get(next.agentId);
          if (current && next.seq <= current.seq) {
            markOutcome("deduped");
            metricsRegistry.incCounter("tracking_dedupe_total", "live_seq");
            metricsRegistry.incCounter("tracking_ingest_total", "200");
            app.log.info({ request_id: requestId, agent_id: next.agentId, seq: next.seq }, "tracking dedupe");
            return reply.code(200).send({
              ok: true,
              request_id: requestId,
              deduped: true,
              accepted: false,
            });
          }

          const queueResult = await queue.enqueue(next);
          if (queueResult.queueFull) {
            markOutcome("backpressure");
            metricsRegistry.incCounter("tracking_ingest_total", "503");
            return reply.code(503).send(errorPayload(requestId, "TRACKING_BACKPRESSURE", "tracking temporalmente saturado"));
          }

          if (queueResult.deduped) {
            markOutcome("deduped");
            metricsRegistry.incCounter("tracking_dedupe_total", "pending_seq");
            metricsRegistry.incCounter("tracking_ingest_total", "200");
            return reply.code(200).send({
              ok: true,
              request_id: requestId,
              deduped: true,
              accepted: false,
            });
          }

          // Check if this is a new connection (agent wasn't previously online)
          const wasOnline = previouslyOnlineAgents.has(next.agentId);
          
          store.upsert(next);

          const agent = store.serialize(next);

          // Track agent for disconnect events and emit connect event if new
          if (!wasOnline && next.campaignId) {
            const agentName = next.agentName ?? `Agente ${next.agentId.slice(0, 8)}`;
            previouslyOnlineAgents.set(next.agentId, {
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
            // Update campaign/name info in case it changed
            const existing = previouslyOnlineAgents.get(next.agentId);
            if (existing) {
              existing.campaignId = next.campaignId;
              if (next.agentName) existing.agentName = next.agentName;
            }
          }

          lastIngestAtMs = Date.now();
          pendingBatchByAgent.set(agent.agent_id, agent);
          markOutcome("accepted");
          metricsRegistry.incCounter("tracking_ingest_total", "202");
          app.log.info({ request_id: requestId, agent_id: next.agentId, seq: next.seq }, "tracking accepted");

          return reply.code(202).send({
            ok: true,
            request_id: requestId,
            accepted: true,
            server_ts: next.receivedAt,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "error desconocido";
          const status = message.includes("payload") ? 400 : 500;
          const code = status === 400 ? "INVALID_PAYLOAD" : "TRACKING_INGEST_ERROR";
          if (status === 400) {
            markOutcome("invalid_payload");
          }
          metricsRegistry.incCounter("tracking_ingest_total", String(status));
          app.log.error({ err: error, request_id: requestId }, "error recibiendo location agent");
          return reply.code(status).send(errorPayload(requestId, code, status === 400 ? "payload invalido" : "error ingestando tracking"));
        }
      },
    );

    // ─── Batch Location Ingest ────────────────────────────────────
    // More efficient for mobile sync: send up to 100 locations in one request
    app.post(
      "/api/agents/locations/batch",
      {
        config: {
          rateLimit: {
            max: env.rateLimitAgentsLocationPerMinute,
            timeWindow: "1 minute",
            keyGenerator: (request: { headers: Record<string, unknown>; ip: string }) =>
              String(request.headers["x-agent-id"] ?? request.headers["x-agent-token"] ?? request.ip),
          },
        },
      },
      async (request, reply) => {
        const requestId = String(request.id);

        // Validate token
        if (env.agentIngestToken) {
          const provided = String(request.headers["x-agent-token"] ?? "").trim();
          if (!provided || provided !== env.agentIngestToken) {
            metricsRegistry.incCounter("tracking_ingest_total", "401");
            metricsRegistry.incCounter("tracking_invalid_token_total", "invalid");
            app.log.warn(
              { request_id: requestId, ip: request.ip, has_token: provided.length > 0 },
              "tracking batch invalid token",
            );
            return reply.code(401).send(errorPayload(requestId, "INVALID_TOKEN", "token invalido"));
          }
        }

        try {
          const parsed = agentLocationBatchSchema.safeParse(request.body);
          if (!parsed.success) {
            metricsRegistry.incCounter("tracking_ingest_total", "400");
            return reply.code(400).send(errorPayload(requestId, "INVALID_PAYLOAD", "payload invalido"));
          }

          const { locations } = parsed.data;
          let accepted = 0;
          let deduped = 0;
          let failed = 0;

          for (const loc of locations) {
            try {
              const next = toState(loc);
              const current = store.get(next.agentId);

              // Dedupe check
              if (current && next.seq <= current.seq) {
                metricsRegistry.incCounter("tracking_dedupe_total", "live_seq");
                deduped++;
                continue;
              }

              // Enqueue
              const queueResult = await queue.enqueue(next);
              if (queueResult.queueFull) {
                failed++;
                continue;
              }

              if (queueResult.deduped) {
                metricsRegistry.incCounter("tracking_dedupe_total", "pending_seq");
                deduped++;
                continue;
              }

              // Update store and broadcast
              const wasOnline = previouslyOnlineAgents.has(next.agentId);
              store.upsert(next);
              const agent = store.serialize(next);

              // Track for disconnect events
              if (!wasOnline && next.campaignId) {
                const agentName = next.agentName ?? `Agente ${next.agentId.slice(0, 8)}`;
                previouslyOnlineAgents.set(next.agentId, {
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
                const existing = previouslyOnlineAgents.get(next.agentId);
                if (existing) {
                  existing.campaignId = next.campaignId;
                  if (next.agentName) existing.agentName = next.agentName;
                }
              }

              lastIngestAtMs = Date.now();
              pendingBatchByAgent.set(agent.agent_id, agent);
              accepted++;
            } catch {
              failed++;
            }
          }

          metricsRegistry.incCounter("tracking_ingest_total", "202");
          app.log.info(
            { request_id: requestId, total: locations.length, accepted, deduped, failed },
            "tracking batch processed",
          );

          return reply.code(202).send({
            ok: true,
            request_id: requestId,
            total: locations.length,
            accepted,
            deduped,
            failed,
            server_ts: new Date().toISOString(),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "error desconocido";
          metricsRegistry.incCounter("tracking_ingest_total", "500");
          app.log.error({ err: error, request_id: requestId }, "error procesando batch de locations");
          return reply.code(500).send(errorPayload(requestId, "TRACKING_BATCH_ERROR", message));
        }
      },
    );
  };
}
