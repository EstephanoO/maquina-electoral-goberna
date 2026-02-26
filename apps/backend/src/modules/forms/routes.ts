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
import { getFormsByCampaign, getRecentForms, deleteFormById, softDeleteFormById, restoreFormById, getPendingDeletions, updateFormById } from "./repository";

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
  if (firstEncuestadorId && forms.every((form) => form.encuestador_id?.trim() === firstEncuestadorId)) {
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

    // GET /api/forms - List forms for a campaign
    app.get(
      "/api/forms",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const query = request.query as { limit?: string; offset?: string };
          const limit = Math.min(Number(query.limit) || 50, 200);
          const offset = Number(query.offset) || 0;

          const { forms, total } = await getFormsByCampaign(campaignId, limit, offset);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            forms,
            total,
            limit,
            offset,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "forms list failed");
          return reply.code(500).send(errorPayload(requestId, "FORMS_LIST_ERROR", "error listando formularios"));
        }
      },
    );

    // GET /api/forms/recent - Get recent forms for dashboard
    app.get(
      "/api/forms/recent",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const query = request.query as { limit?: string; from?: string; to?: string };
          const limit = Math.min(Number(query.limit) || 20, 1000);

          // Validate ISO date strings (optional)
          const from = query.from && !isNaN(Date.parse(query.from)) ? query.from : undefined;
          const to = query.to && !isNaN(Date.parse(query.to)) ? query.to : undefined;

          const forms = await getRecentForms(campaignId, limit, from, to);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            forms,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "forms recent failed");
          return reply.code(500).send(errorPayload(requestId, "FORMS_RECENT_ERROR", "error obteniendo formularios recientes"));
        }
      },
    );

    // DELETE /api/forms/:id - Delete a form (admin only)
    app.delete(
      "/api/forms/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        const { id } = request.params as { id: string };

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        try {
          const result = await deleteFormById(id, campaignId);

          if (!result.deleted) {
            return reply.code(404).send(errorPayload(requestId, "FORM_NOT_FOUND", "formulario no encontrado"));
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            deleted: true,
            source: result.source,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form delete failed");
          return reply.code(500).send(errorPayload(requestId, "FORM_DELETE_ERROR", "error eliminando formulario"));
        }
      },
    );

    // PUT /api/forms/:id - Update a form (admin/consultor only)
    app.put(
      "/api/forms/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["consultor"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        const { id } = request.params as { id: string };

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        const body = request.body as {
          nombre?: string;
          telefono?: string;
          zona?: string;
          comentarios?: string | null;
        };

        // Validate at least one field to update
        const updates: Record<string, string | null | undefined> = {};
        if (typeof body.nombre === "string" && body.nombre.trim()) updates.nombre = body.nombre.trim();
        if (typeof body.telefono === "string" && body.telefono.trim()) updates.telefono = body.telefono.trim();
        if (typeof body.zona === "string" && body.zona.trim()) updates.zona = body.zona.trim();
        if (body.comentarios !== undefined) updates.comentarios = typeof body.comentarios === "string" ? body.comentarios.trim() : null;

        if (Object.keys(updates).length === 0) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_PAYLOAD", "al menos un campo para actualizar"));
        }

        try {
          const result = await updateFormById(id, campaignId, updates);

          if (!result.updated) {
            return reply.code(404).send(errorPayload(requestId, "FORM_NOT_FOUND", "formulario no encontrado"));
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            updated: true,
            source: result.source,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form update failed");
          return reply.code(500).send(errorPayload(requestId, "FORM_UPDATE_ERROR", "error actualizando formulario"));
        }
      },
    );

    // DELETE /api/forms/batch - Admin: hard-delete. Non-admin: soft-delete (pending review).
    app.delete(
      "/api/forms/batch",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        const isAdmin = req.userRole === "admin";
        const { ids } = request.body as { ids: string[] };

        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        if (!Array.isArray(ids) || ids.length === 0) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_PAYLOAD", "ids array requerido"));
        }

        if (ids.length > 100) {
          return reply.code(400).send(errorPayload(requestId, "PAYLOAD_TOO_LARGE", "maximo 100 ids por request"));
        }

        try {
          let deleted = 0;
          for (const id of ids) {
            const result = isAdmin
              ? await deleteFormById(id, campaignId)
              : await softDeleteFormById(id, campaignId, req.userId);
            if (result.deleted) deleted++;
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            deleted,
            total: ids.length,
            mode: isAdmin ? "hard_delete" : "pending_review",
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "forms batch delete failed");
          return reply.code(500).send(errorPayload(requestId, "FORMS_DELETE_ERROR", "error eliminando formularios"));
        }
      },
    );

    // GET /api/forms/pending-deletions - Admin: view soft-deleted forms pending review
    app.get(
      "/api/forms/pending-deletions",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }
        const rows = await getPendingDeletions(campaignId);
        return { ok: true, request_id: requestId, pending: rows };
      },
    );

    // POST /api/forms/confirm-deletion - Admin: permanently delete soft-deleted forms
    app.post(
      "/api/forms/confirm-deletion",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        const { ids } = request.body as { ids: string[] };
        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }
        if (!Array.isArray(ids) || ids.length === 0) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_PAYLOAD", "ids array requerido"));
        }
        let confirmed = 0;
        for (const id of ids) {
          const result = await deleteFormById(id, campaignId);
          if (result.deleted) confirmed++;
        }
        return { ok: true, request_id: requestId, confirmed, total: ids.length };
      },
    );

    // POST /api/forms/restore - Admin: restore soft-deleted forms
    app.post(
      "/api/forms/restore",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        const { ids } = request.body as { ids: string[] };
        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }
        if (!Array.isArray(ids) || ids.length === 0) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_PAYLOAD", "ids array requerido"));
        }
        let restored = 0;
        for (const id of ids) {
          const ok = await restoreFormById(id, campaignId);
          if (ok) restored++;
        }
        return { ok: true, request_id: requestId, restored, total: ids.length };
      },
    );
  };
}
