import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import type { CampaignConfig } from "./repository";
import { createCampaignSchema, updateCampaignSchema } from "./schemas";
import { createDefaultForCampaign } from "../form-definitions/repository";

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
  role: z.enum(["admin", "supervisor", "agent"]),
});

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
      { preHandler: [app.authenticate, authorize({ roles: ["admin", "supervisor"], requireCampaign: true })] },
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
    // List team members of a campaign. Admin/supervisor only.
    app.get(
      "/api/campaigns/:campaignId/members",
      { preHandler: [app.authenticate, authorize({ roles: ["supervisor"], requireCampaign: true })] },
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

    // ── GET /api/campaigns/:slug/stats ────────────────────────────────
    // Dashboard stats for a campaign by slug
    app.get(
      "/api/campaigns/:slug/stats",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { slug } = request.params as { slug: string };
        const period = (request.query as { period?: string }).period === "week" ? "week" : "day";

        try {
          const campaign = await repo.findBySlug(slug);
          if (!campaign) {
            return reply.code(404).send(errorPayload(requestId, "CAMPAIGN_NOT_FOUND", "campana no encontrada"));
          }

          const config = (campaign.config ?? {}) as CampaignConfig;

          // Fetch all stats in parallel
          const [totals, topAgents, agentFormsData] = await Promise.all([
            repo.getFormsTotals(campaign.id),
            repo.getTopAgents(campaign.id, 10),
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
  };
}
