// blast/routes.ts — Endpoints para el call center masivo WA
//
// Arquitectura:
//   GET  /api/blast/form-contacts  → contactos del segmento del número activo
//   PUT  /api/blast/mark-hablado   → marcar contactos como hablado post-envío
//   POST /api/blast/report         → guardar log de mensajes enviados/fallidos
//   GET  /api/blast/stats          → progreso global + por número
//   POST /api/blast/number-config  → registrar/actualizar configuración de un celular
//   GET  /api/blast/number-config  → obtener configuración del número activo

import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import {
  markHabladoSchema,
  blastReportSchema,
  numberConfigSchema,
  reportConversationSchema,
  resolvePhoneSchema,
  checkContactsSchema,
  reportSkipsSchema,
} from "./schemas";
import * as repo from "./repository";

// Default segmentation: 6 slots (one per candidate phone)
const DEFAULT_TOTAL_SLOTS = 6;

export function buildBlastRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    await repo.ensureBlastTables();

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast/form-contacts
    // Returns contacts for the calling WA number's segment.
    // The extension passes x-wa-number header to identify the celular.
    // Falls back to auto-assignment if no config exists yet.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast/form-contacts",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req       = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        const qs     = request.query as Record<string, string>;
        // FIX: Guard against NaN from malformed query params (parseInt("abc") = NaN)
        const limit  = Math.min(500, Math.max(1, parseInt(qs.limit  ?? "200", 10) || 200));
        const offset = Math.max(0,             parseInt(qs.offset ?? "0",   10) || 0);
        const status     = qs.status     ?? "nuevo";
        const district   = qs.district   ?? "";
        const brigadista = qs.brigadista ?? "";

        // Identify which WA number is sending this request
        const waNumber = (request.headers["x-wa-number"] as string ?? "").replace(/\D/g, "").slice(0, 20);

        // Look up or create segment config for this number
        let config = waNumber
          ? await repo.getNumberConfig(campaignId, waNumber)
          : null;

        // Auto-assign segment if not configured yet
        // Uses a deterministic slot based on a hash of the wa_number
        let segmentIdx  = 0;
        let totalSlots  = DEFAULT_TOTAL_SLOTS;

        if (config) {
          segmentIdx = config.segment_idx;
          totalSlots = config.total_slots;
        } else if (waNumber) {
          // Auto-register: asigna el primer slot libre para evitar solapamiento.
          // Un hash débil puede asignar el mismo slot a dos números distintos.
          const usedSlots = await repo.getUsedSegments(campaignId);
          let freeSlot = 0;
          for (let s = 0; s < DEFAULT_TOTAL_SLOTS; s++) {
            if (!usedSlots.has(s)) { freeSlot = s; break; }
          }
          segmentIdx = freeSlot;
          await repo.upsertNumberConfig({
            campaign_id: campaignId,
            wa_number:   waNumber,
            segment_idx: segmentIdx,
            total_slots: DEFAULT_TOTAL_SLOTS,
          }).catch(() => {}); // best-effort
        }

        try {
          const { contacts, total } = await repo.getFormContactsForNumber({
            campaign_id: campaignId,
            wa_number:   waNumber || "unknown",
            segment_idx: segmentIdx,
            total_slots: totalSlots,
            status:      status    || undefined,
            district:    district  || undefined,
            brigadista:  brigadista || undefined,
            limit,
            offset,
          });

          app.log.info(
            { campaignId, waNumber, segmentIdx, totalSlots, returned: contacts.length, total },
            "[blast] form-contacts"
          );

          return reply.code(200).send({
            ok:          true,
            request_id:  requestId,
            contacts,
            total,
            segment_idx: segmentIdx,
            total_slots: totalSlots,
          });
        } catch (err) {
          app.log.error({ err }, "[blast] getFormContactsForNumber failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener contactos")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // PUT /api/blast/mark-hablado
    // Called after each batch of messages is sent.
    // Marks form_submission IDs as cms_status = 'hablado'.
    // ──────────────────────────────────────────────────────────────────
    app.put(
      "/api/blast/mark-hablado",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req       = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = markHabladoSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload inválido")
          );
        }

        const waNumber = (request.headers["x-wa-number"] as string ?? "").replace(/\D/g, "").slice(0, 20) || null;

        try {
          const updated = await repo.markHablado(
            campaignId,
            parsed.data.ids,
            waNumber,
            parsed.data.no_wa_ids ?? []
          );
          app.log.info({ campaignId, waNumber, ids: parsed.data.ids.length, no_wa: parsed.data.no_wa_ids?.length ?? 0, updated, sample_ids: parsed.data.ids.slice(0,2) }, "[blast] mark-hablado");
          return reply.code(200).send({ ok: true, request_id: requestId, updated });
        } catch (err) {
          app.log.error({ err }, "[blast] markHablado failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al marcar hablado")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast/report
    // Saves a batch of blast results (sent/failed) to blast_log.
    // Used for audit trail and progress tracking.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast/report",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = blastReportSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload inválido")
          );
        }

        try {
          const saved = await repo.saveBlastReport(campaignId, parsed.data.results);
          return reply.code(200).send({ ok: true, request_id: requestId, saved });
        } catch (err) {
          app.log.error({ err }, "[blast] saveBlastReport failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al guardar reporte")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast/stats
    // Returns global stats + per-number breakdown.
    // Used by the popup "Call Center" tab to show progress of all 6 phones.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast/stats",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        try {
          const result = await repo.getBlastStats(campaignId);
          return reply.code(200).send({
            ok:         true,
            request_id: requestId,
            ...result,
          });
        } catch (err) {
          app.log.error({ err }, "[blast] getBlastStats failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener estadísticas")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast/number-config
    // Registers or updates a WA number as a blast slot.
    // Coordinators use this to set up the 6 phones before the campaign.
    // Auth: candidato+
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast/number-config",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["candidato"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = numberConfigSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload inválido")
          );
        }

        try {
          await repo.upsertNumberConfig({
            campaign_id: campaignId,
            ...parsed.data,
          });
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (err) {
          app.log.error({ err }, "[blast] upsertNumberConfig failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al guardar configuración")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast/number-config
    // Returns config for the calling WA number.
    // The extension uses this to know its segment_idx at startup.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast/number-config",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        const waNumber = (request.headers["x-wa-number"] as string ?? "").replace(/\D/g, "").slice(0, 20);
        if (!waNumber) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", "Falta header x-wa-number")
          );
        }

        // FIX: Was missing try/catch — DB errors would leak stack traces
        try {
          const config = await repo.getNumberConfig(campaignId, waNumber);
          return reply.code(200).send({
            ok:         true,
            request_id: requestId,
            config:     config ?? null,
          });
        } catch (err) {
          app.log.error({ err }, "[blast] getNumberConfig failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener configuración del número")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast/number-health
    // Returns health/limits for the calling WA number (hourly, daily,
    // warm-up status). Used by the extension to enforce cooldowns.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast/number-health",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        const waNumber = (request.headers["x-wa-number"] as string ?? "").replace(/\D/g, "").slice(0, 20);
        if (!waNumber) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", "Falta header x-wa-number")
          );
        }

        try {
          const health = await repo.getNumberHealth(campaignId, waNumber);
          return reply.code(200).send({
            ok:         true,
            request_id: requestId,
            ...health,
          });
        } catch (err) {
          app.log.error({ err }, "[blast] getNumberHealth failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener salud del número")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast/dashboard
    // Dashboard completo: stats por celular + quality + spam + ritmo
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast/dashboard",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;
        try {
          const data = await repo.getDashboardStats(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, ...data });
        } catch (err) {
          app.log.error({ err }, "[blast] getDashboardStats failed");
          return reply.code(500).send(errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener dashboard"));
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast/block-stats/:blockId
    // Devuelve cuántos del bloque respondieron — para el checkpoint.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast/block-stats/:blockId",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;
        const blockId = String((request.params as { blockId: string }).blockId ?? "").slice(0, 50);
        if (!blockId) {
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", "blockId requerido"));
        }
        try {
          const stats = await repo.getBlockStats(campaignId, blockId);
          return reply.code(200).send({ ok: true, request_id: requestId, ...stats });
        } catch (err) {
          app.log.error({ err }, "[blast] getBlockStats failed");
          return reply.code(500).send(errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener stats del bloque"));
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast/retry-no-wa
    // Vuelve a 'nuevo' los contactos sin WhatsApp de más de 24h.
    // Llamado al arrancar el blast para reintentarlos al día siguiente.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast/retry-no-wa",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;
        try {
          const resetCount = await repo.retryNoWaContacts(campaignId);
          app.log.info({ campaignId, resetCount }, "[blast] retry-no-wa");
          return reply.code(200).send({ ok: true, request_id: requestId, reset: resetCount });
        } catch (err) {
          app.log.error({ err }, "[blast] retryNoWa failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al reintentar no_wa")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast/report-conversation
    // Called by the extension immediately after a blast message is sent.
    // Stores jid→phone mapping in blast_jid_phone_map and creates the
    // conversation entry with source='blast'.
    //
    // This closes the gap: blast sends never created conversations with
    // phone, causing 78% of conversations to have phone=NULL.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast/report-conversation",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = reportConversationSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido")
          );
        }

        try {
          const result = await repo.reportBlastConversation({
            campaign_id:  campaignId,
            own_number:   parsed.data.own_number,
            jid:          parsed.data.jid,
            phone:        parsed.data.phone.replace(/\D/g, "").slice(-9), // canonical 9-digit
            contact_name: parsed.data.contact_name ?? null,
          });

          return reply.code(200).send({
            ok:             true,
            request_id:     requestId,
            conversation_id: result.conversation_id,
            is_new:         result.is_new,
          });
        } catch (err) {
          app.log.error({ err }, "[blast] reportBlastConversation failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al registrar conversación de blast")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast/resolve-phone?jid=xxx
    // Called by the extension on every incoming message.
    // Looks up the canonical phone number for a JID so that:
    //   1. conversations.phone is backfilled
    //   2. voter_profiles.blast_replied is updated
    //   3. CMS auto-transition (hablado→respondieron) works for blast contacts
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast/resolve-phone",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        const { jid } = request.query as { jid?: string };
        if (!jid) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", "jid requerido")
          );
        }

        try {
          const result = await repo.resolvePhoneByJid({ campaign_id: campaignId, jid });
          return reply.code(200).send({
            ok:           true,
            request_id:   requestId,
            jid,
            phone:        result.phone,
            contact_name: result.contact_name,
          });
        } catch (err) {
          app.log.error({ err }, "[blast] resolvePhoneByJid failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al resolver teléfono")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast/check-contacts — Capa 5 anti-duplicado realtime
    // Recibe {contacts: [{id, phone}]} y devuelve {valid: [id...]}.
    // Se llama antes de procesar cada batch para detectar contactos
    // marcados 'hablado' por OTRO phone mientras este corre.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast/check-contacts",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = checkContactsSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido")
          );
        }

        const waNumber = (request.headers["x-wa-number"] as string ?? "")
          .replace(/\D/g, "").slice(0, 20);

        try {
          const valid = await repo.checkContactsStillNew({
            campaign_id: campaignId,
            wa_number:   waNumber || "unknown",
            contacts:    parsed.data.contacts,
          });
          return reply.code(200).send({
            ok:        true,
            request_id: requestId,
            valid:     [...valid],
          });
        } catch (err) {
          app.log.error({ err }, "[blast] checkContactsStillNew failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al verificar contactos")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast/report-skips — Capa 6 visibilidad de skips
    // Registra en blast_log los contactos saltados y su razón.
    // Permite trazabilidad completa en el dashboard.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast/report-skips",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = reportSkipsSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido")
          );
        }

        const waNumber = (request.headers["x-wa-number"] as string ?? "")
          .replace(/\D/g, "").slice(0, 20);

        try {
          const saved = await repo.reportSkips({
            campaign_id: campaignId,
            wa_number:   waNumber || "unknown",
            skips:       parsed.data.skips,
          });
          app.log.info({ campaignId, waNumber, saved, count: parsed.data.skips.length },
            "[blast] report-skips");
          return reply.code(200).send({ ok: true, request_id: requestId, saved });
        } catch (err) {
          app.log.error({ err }, "[blast] reportSkips failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al reportar skips")
          );
        }
      }
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast/sync-status
    // Sincroniza cms_status con blast_log. Marca como 'hablado' todos los
    // contactos que tienen registro en blast_log con status='sent' pero
    // que aún tienen cms_status='nuevo'.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast/sync-status",
      {
        preHandler: [
          app.authenticate,
          authorize({ requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req        = request as AuthenticatedRequest;
        const requestId  = String(request.id);
        const campaignId = req.activeCampaignId!;

        try {
          const result = await repo.syncCmsStatusWithBlastLog(campaignId);
          app.log.info({ campaignId, ...result }, "[blast] sync-status completed");
          return reply.code(200).send({
            ok:         true,
            request_id: requestId,
            ...result,
            message: `Sincronizados ${result.synced} contactos. Ahora hay ${result.pending_nuevo - result.synced} pendientes reales.`,
          });
        } catch (err) {
          app.log.error({ err }, "[blast] syncCmsStatusWithBlastLog failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al sincronizar status")
          );
        }
      }
    );
  };
}
