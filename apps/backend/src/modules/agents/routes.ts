import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { errorPayload } from "../../infra/http";
import type { IngestOutcome } from "../../infra/metrics";
import { metricsRegistry } from "../../infra/metrics";
import { emitCampaignEvent } from "../campaigns/routes";
import { toState } from "./helpers";
import { loadAllLiveAgentLocations } from "./repository";
import { agentLocationBatchSchema, agentStatusSchema } from "./schema";
import { AgentsStore } from "./store";
import type { AgentLocationInput } from "./types";
import { AgentsWriteBehindQueue } from "./write-behind-queue";
import { buildAgentsWsRoutes } from "./ws-routes";

// Track which agents were previously online (for disconnect events)
const previouslyOnlineAgents = new Map<string, { campaignId: string | null; agentName: string }>();

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
      /** When set, scope this client to a single campaign (tierra page view) */
      requestedCampaignId: string | null;
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
        // If client requested a specific campaign, scope to that single campaign.
        // Otherwise: admins get all agents; others get only their campaigns.
        const filtered = agents.filter((a) => {
          if (!a.campaign_id) return false;
          if (client.requestedCampaignId) return a.campaign_id === client.requestedCampaignId;
          if (client.isAdmin) return true;
          return client.campaignIds.includes(a.campaign_id);
        });

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
      metricsRegistry.setGauge("tracking_online_agents", store.countLive());
      if (queueStats.lastFlushAtMs) {
        metricsRegistry.setGauge("tracking_last_flush_age_ms", Date.now() - queueStats.lastFlushAtMs);
      }
    }, Math.max(5000, Math.floor(env.agentStaleAfterMs / 2)));
    staleSweepTimer.unref();

    app.addHook("onClose", async () => {
      clearInterval(batchFlushTimer);
      clearInterval(heartbeatTimer);
      clearInterval(staleSweepTimer);
      clearInterval(auxMapCleanupTimer);
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

        // If a specific campaign_id is requested (via query or header), scope to that single campaign.
        // This prevents cross-campaign leakage when viewing a specific campaign's tierra page.
        const requestedCampaignId =
          (request.query as Record<string, string>)?.campaign_id ??
          (request.headers["x-campaign-id"] as string | undefined) ??
          null;

        const agents = allAgents.filter((a) => {
          if (!a.campaign_id) return false;
          // If a specific campaign was requested, only return agents for that campaign
          if (requestedCampaignId) return a.campaign_id === requestedCampaignId;
          // Otherwise fall back to user's campaign scope (admins see all)
          if (authed.userRole === "admin") return true;
          return campaignIds.includes(a.campaign_id);
        });

        return { ok: true, ts: new Date().toISOString(), agents };
      },
    );

    app.get("/api/agents/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");

      const now = Date.now();
      const onlineAgents = store.countLive();
      const queueStats = queue.getStats();

      // Degrade health when queue lag exceeds threshold (stuck consumer, Redis issues, etc.)
      const lagDegraded = queueStats.depth > env.trackingHealthMaxLag;
      const healthy = !lagDegraded;

      if (!healthy) {
        reply.code(503);
      }

      return {
        ok: healthy,
        service: "agents-tracking",
        ts: new Date().toISOString(),
        degraded: lagDegraded ? "queue_lag_exceeded" : null,
        online_agents: onlineAgents,
        sse_clients: clients.size,
        stale_after_ms: env.agentStaleAfterMs,
        heartbeat_ms: env.agentStreamHeartbeatMs,
        queue_depth: queueStats.depth,
        queue_depth_max: env.trackingHealthMaxLag,
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

        // If a specific campaign_id is requested, scope the SSE stream to that single campaign.
        // This prevents cross-campaign leakage when viewing a specific campaign's tierra page.
        const requestedCampaignId =
          (request.query as Record<string, string>)?.campaign_id ?? null;

        const clientId = ++clientSeq;
        clients.set(clientId, { res: reply.raw, campaignIds, isAdmin, requestedCampaignId });

        const filterAgents = (list: AgentLocationInput[]) =>
          list.filter((a) => {
            if (!a.campaign_id) return false;
            if (requestedCampaignId) return a.campaign_id === requestedCampaignId;
            if (isAdmin) return true;
            return campaignIds.includes(a.campaign_id);
          });

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

    // ─── Agent Status (background/foreground) ──────────────────────
    // Fire-and-forget HTTP call from mobile when app goes to background/foreground.
    // Uses x-agent-token (same as location ingest) so it works even when WS is off.
    //
    // Throttle: only one status change per agent per 30s is broadcast/logged.
    // This prevents log spam when agents toggle between apps rapidly.
    const lastStatusByAgent = new Map<string, { status: string; ts: number }>();
    const STATUS_THROTTLE_MS = 30_000;

    // Periodic cleanup of stale entries in auxiliary Maps to prevent slow memory leaks.
    // Agents that haven't been seen for 24h are removed from previouslyOnlineAgents
    // and lastStatusByAgent.
    const STALE_MAP_CLEANUP_MS = 24 * 60 * 60 * 1000; // 24 hours
    const auxMapCleanupTimer = setInterval(() => {
      const now = Date.now();

      // Clean previouslyOnlineAgents for agents no longer in the live store
      for (const agentId of previouslyOnlineAgents.keys()) {
        const liveAgent = store.get(agentId);
        if (!liveAgent || now - liveAgent.lastSeenAtMs > STALE_MAP_CLEANUP_MS) {
          previouslyOnlineAgents.delete(agentId);
        }
      }

      // Clean lastStatusByAgent for entries older than 24h
      for (const [agentId, entry] of lastStatusByAgent.entries()) {
        if (now - entry.ts > STALE_MAP_CLEANUP_MS) {
          lastStatusByAgent.delete(agentId);
        }
      }
    }, 60 * 60 * 1000); // Run every hour
    auxMapCleanupTimer.unref();

    app.post(
      "/api/agents/status",
      {
        config: {
          rateLimit: {
            max: 30,
            timeWindow: "1 minute",
          },
        },
      },
      async (request, reply) => {
        const requestId = String(request.id);

        // Validate token (same as location ingest)
        if (env.agentIngestToken) {
          const provided = String(request.headers["x-agent-token"] ?? "").trim();
          if (!provided || provided !== env.agentIngestToken) {
            metricsRegistry.incCounter("tracking_ingest_total", "401");
            return reply.code(401).send(errorPayload(requestId, "INVALID_TOKEN", "token invalido"));
          }
        }

        const parsed = agentStatusSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "INVALID_PAYLOAD", message));
        }

        const { agent_id: agentId, status: agentStatus, agent_name, campaign_id } = parsed.data;

        const ts = new Date().toISOString();
        const now = Date.now();
        const name = agent_name ?? previouslyOnlineAgents.get(agentId)?.agentName ?? `Agente ${agentId.slice(0, 8)}`;
        const campaignId = campaign_id ?? previouslyOnlineAgents.get(agentId)?.campaignId ?? null;

        // Throttle: skip if same agent sent the same status within 30s
        const last = lastStatusByAgent.get(agentId);
        if (last && last.status === agentStatus && now - last.ts < STATUS_THROTTLE_MS) {
          return reply.code(200).send({ ok: true, request_id: requestId, status: agentStatus, throttled: true, server_ts: ts });
        }
        lastStatusByAgent.set(agentId, { status: agentStatus, ts: now });

        // Broadcast to all SSE dashboard clients (real-time status change)
        broadcastAll("agent.status", {
          agent_id: agentId,
          agent_name: name,
          status: agentStatus,
          campaign_id: campaignId,
          ts,
        });

        // Don't pollute the campaign event buffer with bg/fg toggles.
        // The SSE broadcast above is enough for real-time dashboard updates.
        // Real connect/disconnect events are emitted by the stale sweep and
        // location ingest handlers — those are the meaningful ones for the log.

        return reply.code(200).send({ ok: true, request_id: requestId, status: agentStatus, server_ts: ts });
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
