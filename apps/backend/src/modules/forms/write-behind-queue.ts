import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { metricsRegistry } from "../../infra/metrics";
import { ensureConsumerGroup, enqueueFormEvent, getStreamLag, redisClient, xAddDlq, xAutoClaimBatch, xReadGroupBatch } from "../../infra/redis";
import { insertFormsIdempotentBatch } from "./repository";
import type { FormInput } from "./schema";

type QueueOptions = {
  maxQueue: number;
  batchSize: number;
  flushMs: number;
  streamKey: string;
  streamGroup: string;
  streamMaxLen: number;
  dedupePrefix: string;
  dedupeTtlSec: number;
  claimIdleMs: number;
  claimBatchSize: number;
  dlqStreamKey: string;
  dlqMaxAttempts: number;
  logger: {
    info: (data: Record<string, unknown>, msg: string) => void;
    error: (data: Record<string, unknown>, msg: string) => void;
  };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FormsWriteBehindQueue {
  private readonly maxQueue: number;
  private readonly batchSize: number;
  private readonly flushMs: number;
  private readonly streamKey: string;
  private readonly streamGroup: string;
  private readonly streamMaxLen: number;
  private readonly dedupePrefix: string;
  private readonly dedupeTtlSec: number;
  private readonly claimIdleMs: number;
  private readonly claimBatchSize: number;
  private readonly dlqStreamKey: string;
  private readonly dlqMaxAttempts: number;
  private readonly logger: QueueOptions["logger"];
  private readonly consumerName = `worker-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  private readonly retryHashKey: string;

  private running = false;
  private flushing = false;
  private depth = 0;
  private lastFlushAtMs: number | null = null;

  constructor(options: QueueOptions) {
    this.maxQueue = options.maxQueue;
    this.batchSize = options.batchSize;
    this.flushMs = options.flushMs;
    this.streamKey = options.streamKey;
    this.streamGroup = options.streamGroup;
    this.streamMaxLen = options.streamMaxLen;
    this.dedupePrefix = options.dedupePrefix;
    this.dedupeTtlSec = options.dedupeTtlSec;
    this.claimIdleMs = options.claimIdleMs;
    this.claimBatchSize = options.claimBatchSize;
    this.dlqStreamKey = options.dlqStreamKey;
    this.dlqMaxAttempts = options.dlqMaxAttempts;
    this.logger = options.logger;
    this.retryHashKey = `${this.streamKey}:retry-count`;
  }

  async start() {
    if (this.running) return;
    await ensureConsumerGroup(this.streamKey, this.streamGroup);
    this.depth = await getStreamLag(this.streamKey, this.streamGroup);
    this.running = true;
    void this.consumeLoop();
  }

  stop() {
    this.running = false;
  }

  getStats() {
    return {
      depth: this.depth,
      flushing: this.flushing,
      lastFlushAtMs: this.lastFlushAtMs,
    };
  }

  async enqueue(form: FormInput): Promise<{ queued: boolean; deduped: boolean; queueFull: boolean }> {
    const currentDepth = await getStreamLag(this.streamKey, this.streamGroup);
    this.depth = currentDepth;
    metricsRegistry.setGauge("forms_queue_depth", this.depth);

    if (currentDepth >= this.maxQueue) {
      metricsRegistry.incCounter("forms_queue_enqueue_total", "queue_full");
      return { queued: false, deduped: false, queueFull: true };
    }

    const accepted = await enqueueFormEvent({
      dedupeKey: `${this.dedupePrefix}${form.client_id}`,
      streamKey: this.streamKey,
      payload: JSON.stringify(form),
      ttlSec: this.dedupeTtlSec,
      maxLen: this.streamMaxLen,
    });

    if (!accepted) {
      metricsRegistry.incCounter("forms_queue_enqueue_total", "deduped_stream");
      return { queued: false, deduped: true, queueFull: false };
    }

    this.depth += 1;
    metricsRegistry.incCounter("forms_queue_enqueue_total", "queued");
    metricsRegistry.setGauge("forms_queue_depth", this.depth);
    return { queued: true, deduped: false, queueFull: false };
  }

  async drain() {
    for (let i = 0; i < 40; i += 1) {
      await this.processOnce("new");
      await this.processOnce("claim");
      this.depth = await getStreamLag(this.streamKey, this.streamGroup);
      if (this.depth === 0) break;
      await sleep(25);
    }
  }

  private async consumeLoop() {
    while (this.running) {
      try {
        await this.processOnce("new");
        await this.processOnce("claim");
      } catch (error) {
        metricsRegistry.incCounter("forms_queue_flush_total", "error");
        this.logger.error({ err: error }, "forms stream consume failed");
        await sleep(1000);
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
      metricsRegistry.incCounter("forms_queue_reclaim_total", "claimed", streamMessages.length);
    }

    if (streamMessages.length === 0) {
      this.depth = await getStreamLag(this.streamKey, this.streamGroup);
      metricsRegistry.setGauge("forms_queue_depth", this.depth);
      return;
    }

    this.flushing = true;
    const startedAt = Date.now();

    try {
      const idsToAck: string[] = [];
      const forms: FormInput[] = [];

      for (const item of streamMessages) {
        const raw = item.values.payload;
        if (!raw) {
          idsToAck.push(item.id);
          continue;
        }
        try {
          forms.push(JSON.parse(raw) as FormInput);
          idsToAck.push(item.id);
        } catch {
          idsToAck.push(item.id);
          metricsRegistry.incCounter("forms_queue_rows_total", "invalid_payload");
        }
      }

      const result = await insertFormsIdempotentBatch(forms);

      if (idsToAck.length > 0) {
        await redisClient.xAck(this.streamKey, this.streamGroup, idsToAck);
        await redisClient.hDel(this.retryHashKey, idsToAck);
      }

      this.lastFlushAtMs = Date.now();
      this.depth = await getStreamLag(this.streamKey, this.streamGroup);
      metricsRegistry.incCounter("forms_queue_flush_total", "ok");
      metricsRegistry.incCounter("forms_queue_rows_total", "attempted", result.attempted);
      metricsRegistry.incCounter("forms_queue_rows_total", "accepted", result.accepted);
      metricsRegistry.incCounter("forms_queue_rows_total", "deduped", Math.max(0, result.attempted - result.accepted));
      metricsRegistry.observeLatency("forms_write_behind_flush", Date.now() - startedAt);
      metricsRegistry.setGauge("forms_queue_depth", this.depth);
      metricsRegistry.setGauge("forms_last_flush_age_ms", 0);

      this.logger.info(
        {
          attempted: result.attempted,
          accepted: result.accepted,
          queue_depth: this.depth,
        },
        "forms write-behind flush ok",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      metricsRegistry.incCounter("forms_queue_flush_total", "error");

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
          metricsRegistry.incCounter("forms_queue_rows_total", "dlq");
        }
      }

      this.logger.error({ err: error }, "forms flush failed, message retained or sent to dlq");
    } finally {
      this.flushing = false;
      if (this.lastFlushAtMs) {
        metricsRegistry.setGauge("forms_last_flush_age_ms", Date.now() - this.lastFlushAtMs);
      }
    }
  }
}
