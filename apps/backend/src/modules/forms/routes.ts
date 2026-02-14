import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import { metricsRegistry } from "../../infra/metrics";
import { consumeWeightedRateLimit } from "../../infra/redis";
import { formSchema, type FormInput } from "./schema";
import { FormsWriteBehindQueue } from "./write-behind-queue";

function parseFormsPayload(body: unknown): FormInput[] {
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0) {
    throw new Error("payload vacio");
  }

  const parsed: FormInput[] = [];
  for (const item of items) {
    const result = formSchema.safeParse(item);
    if (!result.success) {
      throw new Error("payload invalido");
    }
    parsed.push(result.data);
  }

  return parsed;
}

export function buildFormsRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    const queue = new FormsWriteBehindQueue({
      maxQueue: env.formsWriteBehindMaxQueue,
      batchSize: env.formsWriteBehindBatchSize,
      flushMs: env.formsWriteBehindFlushMs,
      streamKey: env.formsStreamKey,
      streamGroup: env.formsStreamGroup,
      streamMaxLen: env.formsStreamMaxLen,
      dedupePrefix: env.formsDedupePrefix,
      dedupeTtlSec: env.formsDedupeTtlSec,
      claimIdleMs: env.streamClaimIdleMs,
      claimBatchSize: env.streamClaimBatchSize,
      dlqStreamKey: env.formsDlqStreamKey,
      dlqMaxAttempts: env.streamDlqMaxAttempts,
      logger: app.log,
    });

    await queue.start();

    app.addHook("onClose", async () => {
      queue.stop();
      await queue.drain();
    });

    const enqueueForms = async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = String(request.id);

      try {
        const forms = parseFormsPayload(request.body);

        if (forms.length > env.formsBatchRequestLimit) {
          metricsRegistry.incCounter("forms_ingest_total", "413");
          return reply.code(413).send(errorPayload(requestId, "PAYLOAD_TOO_LARGE", "batch demasiado grande"));
        }

        const limiterKey = `forms:rl:${String(request.headers["x-agent-id"] ?? request.ip)}`;
        const allowed = await consumeWeightedRateLimit({
          key: limiterKey,
          limit: env.rateLimitFormsPerMinute,
          cost: forms.length,
          ttlSec: 60,
        });

        if (!allowed) {
          metricsRegistry.incCounter("forms_ingest_total", "429");
          return reply.code(429).send(errorPayload(requestId, "RATE_LIMITED", "demasiadas forms por minuto"));
        }

        let queued = 0;
        let deduped = 0;

        for (const form of forms) {
          const result = await queue.enqueue(form);

          if (result.queueFull) {
            metricsRegistry.incCounter("forms_ingest_total", "503");
            return reply.code(503).send(errorPayload(requestId, "FORMS_BACKPRESSURE", "forms temporalmente saturado"));
          }

          if (result.deduped) {
            deduped += 1;
            metricsRegistry.incCounter("forms_dedupe_total", "client_id_pending");
          }

          if (result.queued) {
            queued += 1;
          }
        }

        metricsRegistry.incCounter("forms_ingest_total", "202");
        const stats = queue.getStats();
        metricsRegistry.setGauge("forms_queue_depth", stats.depth);

        return reply.code(202).send({
          ok: true,
          request_id: requestId,
          accepted: queued,
          deduped,
          queue_depth: stats.depth,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "error desconocido";
        const status = message.includes("payload") ? 400 : 500;
        metricsRegistry.incCounter("forms_ingest_total", String(status));
        app.log.error({ err: error, request_id: requestId }, "forms ingest failed");
        return reply.code(status).send(errorPayload(requestId, status === 400 ? "INVALID_PAYLOAD" : "INGEST_ERROR", status === 400 ? "payload invalido" : "error procesando formulario"));
      }
    };

    app.post(
      "/api/forms",
      {},
      async (request, reply) => enqueueForms(request, reply),
    );

    app.post(
      "/api/forms/batch",
      {},
      async (request, reply) => enqueueForms(request, reply),
    );
  };
}
