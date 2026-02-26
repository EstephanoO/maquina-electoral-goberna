import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { metricsRegistry } from "../../infra/metrics";
import { ensureConsumerGroup, enqueueTrackingEvent, getStreamLag, redisClient, xAddDlq, xAutoClaimBatch, xReadGroupBatch } from "../../infra/redis";
import { upsertLatestAgentLocationsBatch } from "./repository";
import type { AgentLiveState } from "./types";

type EnqueueResult = {
  queued: boolean;
  deduped: boolean;
  queueFull: boolean;
};

type QueueStats = {
  depth: number;
  flushing: boolean;
  lastFlushAtMs: number | null;
  lastFlushDurationMs: number | null;
  lastFlushAttempted: number;
  lastFlushAccepted: number;
};

type QueueOptions = {
  maxQueue: number;
  batchSize: number;
  flushMs: number;
  streamKey: string;
  streamGroup: string;
  seqHashKey: string;
  streamMaxLen: number;
  dlqStreamKey: string;
  claimIdleMs: number;
  claimBatchSize: number;
  dlqMaxAttempts: number;
  logger: {
    info: (data: Record<string, unknown>, msg: string) => void;
    error: (data: Record<string, unknown>, msg: string) => void;
  };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AgentsWriteBehindQueue {
  private readonly maxQueue: number;
  private readonly batchSize: number;
  private readonly flushMs: number;
  private readonly streamKey: string;
  private readonly streamGroup: string;
  private readonly seqHashKey: string;
  private readonly streamMaxLen: number;
  private readonly dlqStreamKey: string;
  private readonly claimIdleMs: number;
  private readonly claimBatchSize: number;
  private readonly dlqMaxAttempts: number;
  private readonly logger: QueueOptions["logger"];
  private readonly consumerName = `worker-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  private readonly retryHashKey: string;

  private running = false;
  private flushing = false;
  private depth = 0;
  private lastFlushAtMs: number | null = null;
  private lastFlushDurationMs: number | null = null;
  private lastFlushAttempted = 0;
  private lastFlushAccepted = 0;
  private lastDepthSampleAtMs = 0;

  constructor(options: QueueOptions) {
    this.maxQueue = options.maxQueue;
    this.batchSize = options.batchSize;
    this.flushMs = options.flushMs;
    this.streamKey = options.streamKey;
    this.streamGroup = options.streamGroup;
    this.seqHashKey = options.seqHashKey;
    this.streamMaxLen = options.streamMaxLen;
    this.dlqStreamKey = options.dlqStreamKey;
    this.claimIdleMs = options.claimIdleMs;
    this.claimBatchSize = options.claimBatchSize;
    this.dlqMaxAttempts = options.dlqMaxAttempts;
    this.logger = options.logger;
    this.retryHashKey = `${this.streamKey}:retry-count`;
  }

  async start() {
    if (this.running) return;
    await ensureConsumerGroup(this.streamKey, this.streamGroup);
    await this.refreshDepth(true);
    this.running = true;
    void this.consumeLoop();
  }

  stop() {
    this.running = false;
  }

  getStats(): QueueStats {
    return {
      depth: this.depth,
      flushing: this.flushing,
      lastFlushAtMs: this.lastFlushAtMs,
      lastFlushDurationMs: this.lastFlushDurationMs,
      lastFlushAttempted: this.lastFlushAttempted,
      lastFlushAccepted: this.lastFlushAccepted,
    };
  }

  async enqueue(state: AgentLiveState): Promise<EnqueueResult> {
    await this.refreshDepth(false);
    metricsRegistry.setGauge("tracking_queue_depth", this.depth);

    if (this.depth >= this.maxQueue) {
      metricsRegistry.incCounter("tracking_queue_enqueue_total", "queue_full");
      const { tgQueueBackpressure } = await import("../../infra/telegram");
      tgQueueBackpressure("tracking");
      return { queued: false, deduped: false, queueFull: true };
    }

    const accepted = await enqueueTrackingEvent({
      seqHashKey: this.seqHashKey,
      streamKey: this.streamKey,
      agentId: state.agentId,
      seq: state.seq,
      payload: JSON.stringify(state),
      maxLen: this.streamMaxLen,
    });

    if (!accepted) {
      metricsRegistry.incCounter("tracking_queue_enqueue_total", "deduped_stream");
      return { queued: false, deduped: true, queueFull: false };
    }

    this.depth += 1;
    metricsRegistry.incCounter("tracking_queue_enqueue_total", "queued");
    metricsRegistry.setGauge("tracking_queue_depth", this.depth);
    return { queued: true, deduped: false, queueFull: false };
  }

  async drain() {
    for (let i = 0; i < 40; i += 1) {
      await this.processOnce("new");
      await this.processOnce("claim");
      const depth = await getStreamLag(this.streamKey, this.streamGroup);
      this.depth = depth;
      if (depth === 0) break;
      await sleep(25);
    }
  }

  private async consumeLoop() {
    while (this.running) {
      try {
        await this.processOnce("new");
        await this.processOnce("claim");
      } catch (error) {
        metricsRegistry.incCounter("tracking_queue_flush_total", "error");
        this.logger.error({ err: error }, "tracking stream consume failed");
        // Jitter prevents thundering herd when multiple workers retry simultaneously
        await sleep(1000 + Math.floor(Math.random() * 500));
      }
    }
  }

  private async processOnce(mode: "new" | "claim") {
    const streamMessages =
      mode === "new"
        ? await xReadGroupBatch({
            streamKey: this.streamKey,
            group: this.streamGroup,
            consumer: this.consumerName,
            count: this.batchSize,
            blockMs: this.flushMs,
          })
        : (
            await xAutoClaimBatch({
              streamKey: this.streamKey,
              group: this.streamGroup,
              consumer: this.consumerName,
              minIdleMs: this.claimIdleMs,
              count: this.claimBatchSize,
            })
          ).messages;

    if (mode === "claim" && streamMessages.length > 0) {
      metricsRegistry.incCounter("tracking_queue_reclaim_total", "claimed", streamMessages.length);
    }

    if (streamMessages.length === 0) {
      await this.refreshDepth(false);
      metricsRegistry.setGauge("tracking_queue_depth", this.depth);
      return;
    }

    this.flushing = true;
    const startedAt = Date.now();

    try {
      const dedupedByAgent = new Map<string, AgentLiveState>();
      const idsToAck: string[] = [];

      for (const item of streamMessages) {
        const raw = item.values.payload;
        if (!raw) {
          idsToAck.push(item.id);
          continue;
        }
        try {
          const state = JSON.parse(raw) as AgentLiveState;
          const prev = dedupedByAgent.get(state.agentId);
          if (!prev || state.seq > prev.seq) {
            dedupedByAgent.set(state.agentId, state);
          }
          idsToAck.push(item.id);
        } catch {
          idsToAck.push(item.id);
          metricsRegistry.incCounter("tracking_queue_rows_total", "invalid_payload");
        }
      }

      const batchStates = Array.from(dedupedByAgent.values());
      const result = await upsertLatestAgentLocationsBatch(batchStates);

      if (idsToAck.length > 0) {
        await redisClient.xAck(this.streamKey, this.streamGroup, idsToAck);
        await redisClient.hDel(this.retryHashKey, idsToAck);
      }

      this.lastFlushAttempted = result.attempted;
      this.lastFlushAccepted = result.accepted;
      this.lastFlushAtMs = Date.now();
      this.lastFlushDurationMs = this.lastFlushAtMs - startedAt;
      await this.refreshDepth(true);

      metricsRegistry.incCounter("tracking_queue_flush_total", "ok");
      metricsRegistry.incCounter("tracking_queue_rows_total", "attempted", result.attempted);
      metricsRegistry.incCounter("tracking_queue_rows_total", "accepted", result.accepted);
      metricsRegistry.incCounter("tracking_queue_rows_total", "deduped", Math.max(0, result.attempted - result.accepted));
      metricsRegistry.observeLatency("agents_write_behind_flush", this.lastFlushDurationMs);
      metricsRegistry.setGauge("tracking_queue_depth", this.depth);
      metricsRegistry.setGauge("tracking_last_flush_age_ms", 0);

      this.logger.info(
        {
          attempted: result.attempted,
          accepted: result.accepted,
          queue_depth: this.depth,
          flush_ms: this.lastFlushDurationMs,
        },
        "tracking write-behind flush ok",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      metricsRegistry.incCounter("tracking_queue_flush_total", "error");

      for (const item of streamMessages) {
        const retryCount = await redisClient.hIncrBy(this.retryHashKey, item.id, 1);
        if (retryCount >= this.dlqMaxAttempts) {
          await xAddDlq({
            streamKey: this.dlqStreamKey,
            payload: item.values.payload ?? "",
            error: message,
            sourceStream: this.streamKey,
            sourceId: item.id,
            maxLen: this.streamMaxLen,
          });
          await redisClient.xAck(this.streamKey, this.streamGroup, item.id);
          await redisClient.hDel(this.retryHashKey, item.id);
          metricsRegistry.incCounter("tracking_queue_rows_total", "dlq");
          const { tgDlq } = await import("../../infra/telegram");
          tgDlq("tracking", message);
        }
      }

      this.logger.error({ err: error }, "tracking flush failed, message retained or sent to dlq");
    } finally {
      this.flushing = false;
    }
  }

  private async refreshDepth(force: boolean) {
    const now = Date.now();
    if (!force && now - this.lastDepthSampleAtMs < 2000) {
      return;
    }
    this.depth = await getStreamLag(this.streamKey, this.streamGroup);
    this.lastDepthSampleAtMs = now;
  }
}
