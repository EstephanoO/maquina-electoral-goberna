import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { errorPayload } from "../../infra/http";
import type { IngestOutcome } from "../../infra/metrics";
import { metricsRegistry } from "../../infra/metrics";
import { onAgentLogin, onAgentLogout } from "../../infra/presence-events";
import { countOnlineAgents, getOnlineAgentIds } from "../../infra/redis";
import { resolveTrackingAuth } from "../../infra/tracking-auth";
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
      // Session-based paradigm: agents go offline ONLY on logout.
      // The stale sweep now only marks GPS-idle agents (no removal, no "offline" broadcast).
      const { idle } = store.sweepGpsIdle();
      const ts = new Date().toISOString();

      // Idle agents: session active but no recent GPS → mark as idle on dashboard
      for (const agentId of idle) {
        const agentInfo = previouslyOnlineAgents.get(agentId);
        broadcastAll("agent.idle", {
          agent_id: agentId,
          agent_name: agentInfo?.agentName ?? `Agente ${agentId.slice(0, 8)}`,
          campaign_id: agentInfo?.campaignId ?? null,
          ts,
        });
      }

      const queueStats = queue.getStats();
      metricsRegistry.setGauge("tracking_queue_depth", queueStats.depth);
      metricsRegistry.setGauge("tracking_sse_clients", clients.size);
      // Session-based: online = agents with active login session in Redis (fallback to store size)
      countOnlineAgents()
        .then((n) => metricsRegistry.setGauge("tracking_online_agents", n))
        .catch(() => metricsRegistry.setGauge("tracking_online_agents", store.countLive()));
      if (queueStats.lastFlushAtMs) {
        metricsRegistry.setGauge("tracking_last_flush_age_ms", Date.now() - queueStats.lastFlushAtMs);
      }
    }, Math.max(5000, Math.floor(env.agentStaleAfterMs / 2)));
    staleSweepTimer.unref();

    // ─── Session-based presence events (login/logout → SSE broadcast) ──
    onAgentLogin((event) => {
      const ts = new Date().toISOString();
      broadcastAll("agent.online", {
        agent_id: event.userId,
        agent_name: event.userName,
        campaign_ids: event.campaignIds,
        ts,
      });

      // Track as previously online so name is available for future events
      if (!previouslyOnlineAgents.has(event.userId) && event.campaignIds.length > 0) {
        previouslyOnlineAgents.set(event.userId, {
          campaignId: event.campaignIds[0]!,
          agentName: event.userName,
        });
      }
    });

    onAgentLogout((event) => {
      const ts = new Date().toISOString();
      broadcastAll("agent.offline", {
        agent_id: event.userId,
        agent_name: event.userName,
        ts,
      });

      // Emit disconnect event for each campaign
      for (const campaignId of event.campaignIds) {
        emitCampaignEvent(campaignId, {
          type: "agent_disconnected",
          agent_id: event.userId,
          agent_name: event.userName,
          message: `${event.userName} cerro sesion`,
        });
      }

      previouslyOnlineAgents.delete(event.userId);
    });

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
        // Admins see everything; others are scoped to their campaigns
        const agents =
          authed.userRole === "admin"
            ? allAgents
            : allAgents.filter((a) => a.campaign_id && campaignIds.includes(a.campaign_id));

        // Session-based online set (connected = has active session via login)
        const onlineAgentIds = await getOnlineAgentIds().catch(() => [] as string[]);

        return { ok: true, ts: new Date().toISOString(), agents, online_agent_ids: onlineAgentIds };
      },
    );

    app.get("/api/agents/health", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");

      const now = Date.now();
      // Session-based: online = agents with active login session in Redis
      const onlineAgents = await countOnlineAgents().catch(() => store.countLive());
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
        store_agents: store.countLive(),
        ws_identified_agents: store.wsAgentCount,
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

        const clientId = ++clientSeq;
        clients.set(clientId, { res: reply.raw, campaignIds, isAdmin });

        const filterAgents = (list: AgentLocationInput[]) =>
          isAdmin ? list : list.filter((a) => a.campaign_id && campaignIds.includes(a.campaign_id));

        reply.raw.write("retry: 5000\n\n");
        // Include session-based online set in snapshot
        const onlineIds = await getOnlineAgentIds().catch(() => [] as string[]);
        writeSseEvent(reply.raw, "snapshot", { ts: new Date().toISOString(), agents: filterAgents(store.listLive()), online_agent_ids: onlineIds });

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

        // Dual-mode auth: JWT Bearer (new) or x-agent-token (legacy)
        const auth = await resolveTrackingAuth(request, env.jwtSecret, env.agentIngestToken);
        if (!auth.ok) {
          markOutcome("auth_failed");
          metricsRegistry.incCounter("tracking_ingest_total", "401");
          metricsRegistry.incCounter("tracking_invalid_token_total", "invalid");
          app.log.warn(
            { request_id: requestId, ip: request.ip, auth_code: auth.code },
            "tracking auth failed",
          );
          return reply.code(auth.httpStatus).send(errorPayload(requestId, auth.code, auth.message));
        }

        try {
          const next = toState(request.body, "http");

          // When JWT is used, the server overrides the client-provided agent_id
          // with the JWT's sub claim. This prevents agent spoofing.
          if (auth.method === "jwt") {
            next.agentId = auth.agentId;
            // Also override agent_name if not provided but we have JWT email
            if (!next.agentName && auth.agentName) next.agentName = auth.agentName;
            // Validate campaign_id if provided — JWT agents can only report for their campaigns
            if (next.campaignId && !auth.campaignIds.includes(next.campaignId)) {
              app.log.warn(
                { request_id: requestId, agent_id: auth.agentId, campaign_id: next.campaignId },
                "tracking campaign_id not in JWT claims",
              );
              // Don't reject — just clear the campaign_id to prevent attribution to wrong campaign
              next.campaignId = null;
            }
          }

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
    const auxMapCleanupTimer = setInterval(async () => {
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

      // Prune in-memory store: remove agents that are (a) logged out AND (b) GPS stale >24h.
      // This prevents unbounded growth since sweepGpsIdle() no longer removes agents.
      try {
        const onlineIds = new Set(await getOnlineAgentIds());
        let pruned = 0;
        for (const agentId of Array.from(store.agentIds())) {
          if (onlineIds.has(agentId)) continue; // still logged in — keep
          const agent = store.get(agentId);
          if (!agent) continue;
          if (now - agent.lastSeenAtMs > STALE_MAP_CLEANUP_MS) {
            store.remove(agentId);
            pruned++;
          }
        }
        if (pruned > 0) {
          app.log.info({ pruned, remaining: store.size }, "store cleanup: removed logged-out stale agents");
        }
      } catch (err) {
        app.log.warn({ err }, "store cleanup: failed to fetch online set from Redis");
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

        // Dual-mode auth: JWT Bearer (new) or x-agent-token (legacy)
        const auth = await resolveTrackingAuth(request, env.jwtSecret, env.agentIngestToken);
        if (!auth.ok) {
          metricsRegistry.incCounter("tracking_ingest_total", "401");
          return reply.code(auth.httpStatus).send(errorPayload(requestId, auth.code, auth.message));
        }

        const parsed = agentStatusSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "INVALID_PAYLOAD", message));
        }

        // When JWT is used, override agent_id with server-authoritative identity
        const { agent_id: rawAgentId, status: agentStatus, agent_name, campaign_id } = parsed.data;
        const agentId = auth.method === "jwt" ? auth.agentId : rawAgentId;

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

        // Dual-mode auth: JWT Bearer (new) or x-agent-token (legacy)
        const auth = await resolveTrackingAuth(request, env.jwtSecret, env.agentIngestToken);
        if (!auth.ok) {
          metricsRegistry.incCounter("tracking_ingest_total", "401");
          metricsRegistry.incCounter("tracking_invalid_token_total", "invalid");
          app.log.warn(
            { request_id: requestId, ip: request.ip, auth_code: auth.code },
            "tracking batch auth failed",
          );
          return reply.code(auth.httpStatus).send(errorPayload(requestId, auth.code, auth.message));
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
              const next = toState(loc, "http");

              // When JWT is used, override agent_id with server-authoritative identity
              if (auth.method === "jwt") {
                next.agentId = auth.agentId;
                if (!next.agentName && auth.agentName) next.agentName = auth.agentName;
                if (next.campaignId && !auth.campaignIds.includes(next.campaignId)) {
                  next.campaignId = null;
                }
              }
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
