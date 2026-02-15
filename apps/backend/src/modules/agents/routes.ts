import type { FastifyPluginAsync } from "fastify";
import type { ServerResponse } from "node:http";

import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import type { IngestOutcome } from "../../infra/metrics";
import { metricsRegistry } from "../../infra/metrics";
import { loadAllLiveAgentLocations } from "./repository";
import { agentLocationSchema } from "./schema";
import { AgentsStore } from "./store";
import type { AgentLiveState } from "./types";
import { AgentsWriteBehindQueue } from "./write-behind-queue";

function toState(value: unknown): AgentLiveState {
  const parsed = agentLocationSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("payload invalido");
  }

  return {
    agentId: parsed.data.agent_id,
    ts: new Date(parsed.data.ts).toISOString(),
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    accuracy: parsed.data.accuracy ?? null,
    speed: parsed.data.speed ?? null,
    heading: parsed.data.heading ?? null,
    battery: parsed.data.battery ?? null,
    seq: parsed.data.seq,
    receivedAt: new Date().toISOString(),
    lastSeenAtMs: Date.now(),
  };
}

function writeSseEvent(res: ServerResponse, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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

    const clients = new Map<number, ServerResponse>();
    let clientSeq = 0;
    let lastIngestAtMs: number | null = null;

    const broadcast = (event: string, payload: unknown) => {
      for (const client of clients.values()) {
        writeSseEvent(client, event, payload);
      }
    };

    const staleSweepTimer = setInterval(() => {
      const removed = store.removeStale();
      for (const agentId of removed) {
        broadcast("agent.offline", { agent_id: agentId, ts: new Date().toISOString() });
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
      clearInterval(staleSweepTimer);
      queue.stop();
      await queue.drain();
      for (const client of clients.values()) {
        client.end();
      }
      clients.clear();
    });

    app.get(
      "/api/agents/live",
      {
        config: {
          rateLimit: {
            max: env.rateLimitAgentsLivePerMinute,
            timeWindow: "1 minute",
          },
        },
      },
      async (_request, reply) => {
        reply.header("Cache-Control", "no-store");
        return { ok: true, ts: new Date().toISOString(), agents: store.listLive() };
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

        const clientId = ++clientSeq;
        clients.set(clientId, reply.raw);

        reply.raw.write("retry: 5000\n\n");
        writeSseEvent(reply.raw, "snapshot", { ts: new Date().toISOString(), agents: store.listLive() });

        const heartbeatTimer = setInterval(() => {
          writeSseEvent(reply.raw, "heartbeat", { ts: new Date().toISOString() });
        }, env.agentStreamHeartbeatMs);

        const cleanup = () => {
          clearInterval(heartbeatTimer);
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

          store.upsert(next);

          const payload = {
            agent: store.serialize(next),
            server_ts: next.receivedAt,
          };

          lastIngestAtMs = Date.now();
          broadcast("location.update", payload);
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
  };
}
