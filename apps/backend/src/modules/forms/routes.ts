import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import type { IngestOutcome } from "../../infra/metrics";
import { metricsRegistry } from "../../infra/metrics";
import { consumeDualWeightedRateLimit } from "../../infra/redis";
import { emitCampaignEvent } from "../campaigns/routes";
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

function resolveFormsLimiterActor(request: FastifyRequest, forms: FormInput[]): string {
  const headerAgentId = String(request.headers["x-agent-id"] ?? "").trim();
  if (headerAgentId) {
    return `agent:${headerAgentId}`;
  }

  const firstEncuestadorId = forms[0]?.encuestador_id?.trim() ?? "";
  if (firstEncuestadorId && forms.every((form) => form.encuestador_id.trim() === firstEncuestadorId)) {
    return `enc:${firstEncuestadorId}`;
  }

  return `ip:${request.ip}`;
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
      const markOutcome = (outcome: IngestOutcome) => {
        (request as unknown as { __ingestOutcome?: IngestOutcome }).__ingestOutcome = outcome;
      };

      try {
        const forms = parseFormsPayload(request.body);

        // Inject campaign_id from auth context when available
        const campaignId = (request as AuthenticatedRequest).userId
          ? request.activeCampaignId
          : undefined;
        if (campaignId) {
          for (const form of forms) {
            form.campaign_id = campaignId;
          }
        }

        if (forms.length > env.formsBatchRequestLimit) {
          markOutcome("invalid_payload");
          metricsRegistry.incCounter("forms_ingest_total", "413");
          return reply.code(413).send(errorPayload(requestId, "PAYLOAD_TOO_LARGE", "batch demasiado grande"));
        }

        const actorId = resolveFormsLimiterActor(request, forms);
        const allowed = await consumeDualWeightedRateLimit({
          actorKey: `forms:rl:actor:${actorId}`,
          ipKey: `forms:rl:ip:${request.ip}`,
          actorLimit: env.rateLimitFormsPerMinute,
          ipLimit: env.rateLimitFormsIpPerMinute,
          cost: forms.length,
          ttlSec: env.rateLimitFormsWindowSec,
        });

        if (!allowed) {
          markOutcome("rate_limited");
          metricsRegistry.incCounter("forms_ingest_total", "429");
          return reply.code(429).send(errorPayload(requestId, "RATE_LIMITED", "demasiadas forms por minuto"));
        }

        let queued = 0;
        let deduped = 0;

        for (const form of forms) {
          const result = await queue.enqueue(form);

          if (result.queueFull) {
            markOutcome("backpressure");
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
        markOutcome(queued > 0 ? "accepted" : "deduped");

        // Emit event for dashboard log
        if (queued > 0) {
          const firstForm = forms[0];
          if (firstForm?.campaign_id) {
            emitCampaignEvent(firstForm.campaign_id, {
              type: "form_submitted",
              agent_id: firstForm.encuestador_id ?? "unknown",
              agent_name: firstForm.encuestador ?? "Agente",
              message: `${firstForm.encuestador ?? "Agente"} envio ${queued} registro${queued > 1 ? "s" : ""}`,
            });
          }
        }

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
        if (status === 400) {
          markOutcome("invalid_payload");
        }
        metricsRegistry.incCounter("forms_ingest_total", String(status));
        app.log.error({ err: error, request_id: requestId }, "forms ingest failed");
        return reply.code(status).send(errorPayload(requestId, status === 400 ? "INVALID_PAYLOAD" : "INGEST_ERROR", status === 400 ? "payload invalido" : "error procesando formulario"));
      }
    };

    app.post(
      "/api/forms",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => enqueueForms(request, reply),
    );

    app.post(
      "/api/forms/batch",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => enqueueForms(request, reply),
    );
  };
}
