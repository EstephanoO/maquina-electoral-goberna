import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize, ROLE_HIERARCHY, type Role } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import { encrypt, decrypt, maskToken } from "../../infra/crypto";
import * as repo from "./repository";
import type { CampaignConfig } from "./repository";
import { createCampaignSchema, updateCampaignSchema } from "./schemas";
import { createDefaultForCampaign } from "../form-definitions/repository";

// Twilio config schema for PUT /api/campaigns/:campaignId/integrations/twilio
const twilioConfigSchema = z.object({
  account_sid: z.string().min(1, "account_sid es requerido").max(200),
  auth_token: z.string().max(200).optional(),
  whatsapp_from: z.string().min(1, "whatsapp_from es requerido").max(50),
  messaging_service_sid: z.string().max(200).optional(),
});

// ── Event log (in-memory circular buffer) ─────────────────────────────
type CampaignEvent = {
  type: "form_submitted" | "agent_connected" | "agent_disconnected";
  agent_id: string;
  agent_name: string;
  timestamp: string;
  message: string;
};

const MAX_EVENTS_PER_CAMPAIGN = 50;
const campaignEventBuffers = new Map<string, CampaignEvent[]>();

export function emitCampaignEvent(campaignId: string, event: Omit<CampaignEvent, "timestamp">) {
  if (!campaignId) return;
  
  let buffer = campaignEventBuffers.get(campaignId);
  if (!buffer) {
    buffer = [];
    campaignEventBuffers.set(campaignId, buffer);
  }
  
  buffer.unshift({
    ...event,
    timestamp: new Date().toISOString(),
  });
  
  if (buffer.length > MAX_EVENTS_PER_CAMPAIGN) {
    buffer.pop();
  }
}

export function getRecentEvents(campaignId: string, limit = 20): CampaignEvent[] {
  const buffer = campaignEventBuffers.get(campaignId);
  if (!buffer) return [];
  return buffer.slice(0, limit);
}

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "consultor", "candidato", "brigadista_zonal", "agente_campo", "agente_digital"]),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(["consultor", "candidato", "brigadista_zonal", "agente_campo", "agente_digital"]),
});

const setConsultorCampaignsSchema = z.object({
  campaign_ids: z.array(z.string().uuid()),
});

function toDbRole(apiRole: string): string {
  return apiRole;
}

export function buildCampaignsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── GET /api/candidates ──────────────────────────────────────────
    // Public endpoint for registration flow — lists active candidates
    app.get("/api/candidates", async (request, reply) => {
      const requestId = String(request.id);
      try {
        const campaigns = await repo.listActive();
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          candidates: campaigns.map((c) => {
            const config = c.config as { color_primario?: string; color_secundario?: string } | null;
            return {
              id: c.id,
              name: c.name,
              slug: c.slug,
              cargo: c.cargo,
              numero: c.numero,
              partido: c.partido,
              foto_url: c.foto_url,
              color_primario: config?.color_primario ?? "#1e40af",
              color_secundario: config?.color_secundario ?? "#fbbf24",
            };
          }),
        });
      } catch (error) {
        app.log.error({ err: error, request_id: requestId }, "candidates list failed");
        return reply.code(500).send(errorPayload(requestId, "CANDIDATES_LIST_ERROR", "error listando candidatos"));
      }
    });

    // ── GET /api/campaigns ────────────────────────────────────────────
    app.get(
      "/api/campaigns",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        try {
          if (authed.userRole === "admin") {
            const campaigns = await repo.listAll();
            return reply.code(200).send({ ok: true, request_id: requestId, campaigns });
          }

          const campaigns = await repo.listForUser(authed.userId);
          return reply.code(200).send({ ok: true, request_id: requestId, campaigns });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaigns list failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGNS_LIST_ERROR", "error listando campanas"));
        }
      },
    );

    // ── POST /api/campaigns ───────────────────────────────────────────
    app.post(
      "/api/campaigns",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);

        const parsed = createCampaignSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const existing = await repo.findBySlug(parsed.data.slug);
          if (existing) {
            return reply.code(409).send(errorPayload(requestId, "CAMPAIGN_SLUG_EXISTS", "slug ya existe"));
          }

          const authed = request as AuthenticatedRequest;
          const campaign = await repo.create(parsed.data);

          // Auto-create default "Formulario Principal" for the new campaign
          try {
            await createDefaultForCampaign(campaign.id, authed.userId);
          } catch (err) {
            app.log.warn({ err, campaign_id: campaign.id }, "default form creation failed (non-fatal)");
          }

          return reply.code(201).send({ ok: true, request_id: requestId, campaign });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign create failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_CREATE_ERROR", "error creando campana"));
        }
      },
    );

    // ── GET /api/campaigns/:campaignId ────────────────────────────────
    app.get(
      "/api/campaigns/:campaignId",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, campaign });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign get failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_GET_ERROR", "error obteniendo campana"));
        }
      },
    );

    // ── PUT /api/campaigns/:campaignId ────────────────────────────────
    app.put(
      "/api/campaigns/:campaignId",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        const parsed = updateCampaignSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const campaign = await repo.update(campaignId, parsed.data);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, campaign });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign update failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_UPDATE_ERROR", "error actualizando campana"));
        }
      },
    );

    // ── POST /api/campaigns/:campaignId/members ───────────────────────
    app.post(
      "/api/campaigns/:campaignId/members",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        const parsed = addMemberSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          await repo.addUserToCampaign(parsed.data.user_id, campaignId, parsed.data.role);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign add member failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_MEMBER_ERROR", "error agregando miembro"));
        }
      },
    );

    // ── GET /api/campaigns/:campaignId/members ────────────────────────
    // List team members of a campaign. Jefe de campana and above.
    app.get(
      "/api/campaigns/:campaignId/members",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const members = await repo.getCampaignMembers(campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId, members });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign members list failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_MEMBERS_ERROR", "error listando miembros"));
        }
      },
    );

    // ── DELETE /api/campaigns/:campaignId/members/:userId ─────────────
    app.delete(
      "/api/campaigns/:campaignId/members/:userId",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId, userId } = request.params as { campaignId: string; userId: string };

        try {
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          await repo.removeUserFromCampaign(userId, campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign remove member failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_MEMBER_ERROR", "error removiendo miembro"));
        }
      },
    );

    // ── PUT /api/campaigns/:campaignId/members/:userId/role ─────────────
    // Change a member's role within a campaign. Jefe de campana and above.
    app.put(
      "/api/campaigns/:campaignId/members/:userId/role",
      { preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { campaignId, userId } = request.params as { campaignId: string; userId: string };

        const parsed = updateMemberRoleSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        // Cannot promote to a role at or above your own level (unless you're admin)
        const callerLevel = ROLE_HIERARCHY[authed.userRole as Role] ?? 0;
        const targetLevel = ROLE_HIERARCHY[parsed.data.role as Role] ?? 0;
        if (authed.userRole !== "admin" && targetLevel >= callerLevel) {
          return reply.code(403).send(errorPayload(requestId, "AUTHZ_ROLE_INSUFFICIENT", "no puedes asignar un rol igual o superior al tuyo"));
        }

        try {
          const updated = await repo.updateMemberRole(userId, campaignId, parsed.data.role);
          if (!updated) {
            return reply.code(404).send(errorPayload(requestId, "MEMBER_NOT_FOUND", "miembro no encontrado en esta campana"));
          }

          return reply.code(200).send({ ok: true, request_id: requestId, member: updated });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign member role update failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_MEMBER_ERROR", "error actualizando rol de miembro"));
        }
      },
    );

    // ── GET /api/campaigns/:slug/stats ────────────────────────────────
    // Dashboard stats for a campaign by slug
    app.get(
      "/api/campaigns/:slug/stats",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { slug } = request.params as { slug: string };
        const period = (request.query as { period?: string }).period === "week" ? "week" : "day";

        try {
          const campaign = await repo.findBySlug(slug);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          // Non-admin users can only see stats for campaigns they belong to
          if (authed.userRole !== "admin" && !authed.campaignIds.includes(campaign.id)) {
            return reply.code(403).send(errorPayload(requestId, "AUTHZ_CAMPAIGN_DENIED", "sin acceso a esta campana"));
          }

          const config = (campaign.config ?? {}) as CampaignConfig;

          // Fetch all stats in parallel
          const [totals, topAgents, agentFormsData] = await Promise.all([
            repo.getFormsTotals(campaign.id),
            repo.getTopAgents(campaign.id, 500),
            repo.getAgentFormsForPeriod(campaign.id, period),
          ]);

          // Get recent events from in-memory buffer
          const recentEvents = getRecentEvents(campaign.id, 20);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            campaign: {
              id: campaign.id,
              name: campaign.name,
              slug: campaign.slug,
              cargo: campaign.cargo,
              numero: campaign.numero,
              partido: campaign.partido,
              foto_url: campaign.foto_url,
              color_primario: config.color_primario ?? "#1e40af",
              color_secundario: config.color_secundario ?? "#fbbf24",
              whatsapp_channel_url: (config as Record<string, unknown>).whatsapp_channel_url as string | undefined,
            },
            metas: {
              datos: config.meta_datos ?? 0,
              votos: config.meta_votos ?? 0,
            },
            totals,
            top_agents: topAgents,
            agent_forms_chart: agentFormsData,
            recent_events: recentEvents,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "campaign stats failed");
          return reply.code(500).send(errorPayload(requestId, "CAMPAIGN_STATS_ERROR", "error obteniendo stats"));
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════
    // CONSULTOR MANAGEMENT ENDPOINTS
    // Only admin can manage consultor assignments
    // ═══════════════════════════════════════════════════════════════════

    // ── GET /api/consultors ───────────────────────────────────────────
    // List all consultors (admin only)
    app.get(
      "/api/consultors",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);

        try {
          const consultors = await repo.listConsultors();
          return reply.code(200).send({ ok: true, request_id: requestId, consultors });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "consultors list failed");
          return reply.code(500).send(errorPayload(requestId, "CONSULTORS_LIST_ERROR", "error listando consultores"));
        }
      },
    );

    // ── GET /api/consultors/:userId/campaigns ─────────────────────────
    // Get campaigns assigned to a specific consultor
    app.get(
      "/api/consultors/:userId/campaigns",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { userId } = request.params as { userId: string };

        try {
          const campaigns = await repo.getConsultorCampaigns(userId);
          return reply.code(200).send({ ok: true, request_id: requestId, campaigns });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "consultor campaigns list failed");
          return reply.code(500).send(errorPayload(requestId, "CONSULTOR_CAMPAIGNS_ERROR", "error listando campanas del consultor"));
        }
      },
    );

    // ── PUT /api/consultors/:userId/campaigns ─────────────────────────
    // Set (replace) campaigns assigned to a consultor
    app.put(
      "/api/consultors/:userId/campaigns",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { userId } = request.params as { userId: string };

        const parsed = setConsultorCampaignsSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          await repo.setConsultorCampaigns(userId, parsed.data.campaign_ids);
          const campaigns = await repo.getConsultorCampaigns(userId);
          return reply.code(200).send({ ok: true, request_id: requestId, campaigns });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "set consultor campaigns failed");
          return reply.code(500).send(errorPayload(requestId, "CONSULTOR_CAMPAIGNS_ERROR", "error asignando campanas al consultor"));
        }
      },
    );

    // ── POST /api/consultors/:userId/campaigns/:campaignId ────────────
    // Add a single campaign to a consultor's assignments
    app.post(
      "/api/consultors/:userId/campaigns/:campaignId",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { userId, campaignId } = request.params as { userId: string; campaignId: string };

        try {
          // Verify campaign exists
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          await repo.addCampaignToConsultor(userId, campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "add campaign to consultor failed");
          return reply.code(500).send(errorPayload(requestId, "CONSULTOR_CAMPAIGNS_ERROR", "error agregando campana al consultor"));
        }
      },
    );

    // ── DELETE /api/consultors/:userId/campaigns/:campaignId ──────────
    // Remove a campaign from a consultor's assignments
    app.delete(
      "/api/consultors/:userId/campaigns/:campaignId",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { userId, campaignId } = request.params as { userId: string; campaignId: string };

        try {
          await repo.removeCampaignFromConsultor(userId, campaignId);
          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "remove campaign from consultor failed");
          return reply.code(500).send(errorPayload(requestId, "CONSULTOR_CAMPAIGNS_ERROR", "error removiendo campana del consultor"));
        }
      },
    );

    // ═══════════════════════════════════════════════════════════════════
    // TWILIO INTEGRATION PER CAMPAIGN
    // Only admin can read or write Twilio credentials.
    // Auth token is stored AES-256-GCM encrypted in campaigns.config JSONB.
    // ═══════════════════════════════════════════════════════════════════

    // ── GET /api/campaigns/:campaignId/integrations/twilio ─────────────
    // Returns masked Twilio config (auth_token is never returned in full).
    app.get(
      "/api/campaigns/:campaignId/integrations/twilio",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        try {
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campaña no encontrada"));
          }

          const config = (campaign.config ?? {}) as Record<string, unknown>;
          const twilio = (config.twilio ?? {}) as {
            account_sid?: string;
            auth_token?: string;  // encrypted
            whatsapp_from?: string;
          };

          const isConfigured = Boolean(twilio.account_sid && twilio.auth_token && twilio.whatsapp_from);

          // Derive hint from decrypted token — only last 4 chars
          let authTokenHint = "";
          if (twilio.auth_token) {
            try {
              const plain = decrypt(twilio.auth_token);
              authTokenHint = maskToken(plain, 4);
            } catch {
              authTokenHint = "****????";
            }
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            twilio: {
              configured: isConfigured,
              account_sid: twilio.account_sid ?? "",
              auth_token_hint: authTokenHint,
              whatsapp_from: twilio.whatsapp_from ?? "",
            },
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "twilio config get failed");
          return reply.code(500).send(errorPayload(requestId, "TWILIO_CONFIG_ERROR", "error obteniendo config de Twilio"));
        }
      },
    );

    // ── PUT /api/campaigns/:campaignId/integrations/twilio ─────────────
    // Save (or update) Twilio credentials for a campaign.
    // If auth_token is empty/omitted, preserves the existing encrypted value.
    app.put(
      "/api/campaigns/:campaignId/integrations/twilio",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaignId } = request.params as { campaignId: string };

        const parsed = twilioConfigSchema.safeParse(request.body);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((e) => e.message).join("; ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", msg));
        }

        const body = parsed.data;

        try {
          const campaign = await repo.findById(campaignId);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campaña no encontrada"));
          }

          const existingConfig = (campaign.config ?? {}) as Record<string, unknown>;
          const existingTwilio = (existingConfig.twilio ?? {}) as { auth_token?: string };

          // Encrypt new token if provided, otherwise keep existing encrypted value
          let encryptedToken = existingTwilio.auth_token ?? "";
          if (body.auth_token?.trim()) {
            try {
              encryptedToken = encrypt(body.auth_token.trim());
            } catch (encErr) {
              app.log.error({ err: encErr, request_id: requestId }, "twilio token encryption failed");
              return reply.code(500).send(errorPayload(requestId, "TWILIO_ENCRYPT_ERROR", "Error cifrando credenciales. Verificar TWILIO_ENCRYPTION_KEY."));
            }
          }

          // Merge twilio config into campaign config JSONB
          const twilioConfig: Record<string, string> = {
            account_sid: body.account_sid.trim(),
            auth_token: encryptedToken,
            whatsapp_from: body.whatsapp_from.trim(),
          };
          if (body.messaging_service_sid?.trim()) {
            twilioConfig.messaging_service_sid = body.messaging_service_sid.trim();
          }
          const newConfig = {
            ...existingConfig,
            twilio: twilioConfig,
          };

          await repo.updateConfig(campaignId, newConfig);

          return reply.code(200).send({ ok: true, request_id: requestId });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "twilio config save failed");
          return reply.code(500).send(errorPayload(requestId, "TWILIO_CONFIG_ERROR", "error guardando config de Twilio"));
        }
      },
    );
  };
}
