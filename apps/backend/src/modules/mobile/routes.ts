import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { errorPayload } from "../../infra/http";
import { pool } from "../../db";
import { AuthRepository } from "../auth/repository";
import * as campaignsRepo from "../campaigns/repository";
import * as formDefsRepo from "../form-definitions/repository";

const authRepo = new AuthRepository(pool);

/**
 * GET /api/mobile/bootstrap
 *
 * Single endpoint que mobile llama después del login para traer todo el
 * estado inicial en una sola request. Reemplaza la cadena de calls que hoy
 * hace `app-context.tsx`:
 *   - getCandidates() (public)
 *   - getCampaign(activeCampaign.id)
 *   - getActiveFormDefinitions(activeCampaign.id)
 *
 * Query: ?campaign_id=<uuid>  (opcional — si no viene, server elige la
 * primera campaña active del user).
 *
 * Response:
 *   {
 *     user: { id, email, full_name, phone, role, status },
 *     campaigns: [{ id, name, slug, role, perm_audio_admin, whatsapp_number }],
 *     active_campaign: {
 *       id, name, slug, cargo, numero, partido, foto_url,
 *       config: { color_primario, color_secundario, ... },
 *       role, perm_tierra, perm_digital, perm_audio_admin,
 *       form_definitions: [{ id, name, slug, schema, status }]
 *     } | null,
 *     candidates: [{ id, name, slug, cargo, numero, partido, foto_url, color_primario, color_secundario }]
 *   }
 */
export function buildMobileRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    app.get(
      "/api/mobile/bootstrap",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { campaign_id: requestedCampaignId } = request.query as { campaign_id?: string };

        try {
          const user = await authRepo.findUserById(authed.userId);
          if (!user) {
            return reply.code(404).send(errorPayload(requestId, "USER_NOT_FOUND", "usuario no encontrado"));
          }

          // Same logic as /api/auth/me — admin sees all, otros solo asignadas
          const userCampaigns = user.role === "admin"
            ? await authRepo.getAllActiveCampaigns()
            : await authRepo.getUserCampaigns(user.id);

          const campaignsList = userCampaigns.map((c) => ({
            id: c.campaign_id,
            name: c.campaign_name,
            slug: c.campaign_slug,
            role: c.role,
            perm_audio_admin: c.perm_audio_admin,
            whatsapp_number:
              typeof c.campaign_config?.whatsapp_number === "string"
                ? (c.campaign_config.whatsapp_number as string)
                : null,
          }));

          // Resolver active_campaign: el query param tiene prioridad, sino primera del user.
          // El user debe tener acceso a la activeCampaign — protege contra clientes
          // pidiendo campañas ajenas.
          const activeCampaignRow = requestedCampaignId
            ? userCampaigns.find((c) => c.campaign_id === requestedCampaignId)
            : userCampaigns[0];

          let activeCampaign: Record<string, unknown> | null = null;
          if (activeCampaignRow) {
            const [campaign, forms] = await Promise.all([
              campaignsRepo.findById(activeCampaignRow.campaign_id),
              formDefsRepo.findByCampaignId(activeCampaignRow.campaign_id),
            ]);
            if (campaign) {
              activeCampaign = {
                id: campaign.id,
                name: campaign.name,
                slug: campaign.slug,
                cargo: campaign.cargo,
                numero: campaign.numero,
                partido: campaign.partido,
                foto_url: campaign.foto_url,
                config: campaign.config ?? {},
                role: activeCampaignRow.role,
                perm_tierra: activeCampaignRow.perm_tierra,
                perm_digital: activeCampaignRow.perm_digital,
                perm_audio_admin: activeCampaignRow.perm_audio_admin,
                form_definitions: forms.filter((f) => f.status === "active"),
              };
            }
          }

          const candidates = await campaignsRepo.listActive();

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            user: {
              id: user.id,
              email: user.email,
              full_name: user.full_name,
              phone: user.phone,
              role: user.role,
              status: user.status,
            },
            campaigns: campaignsList,
            active_campaign: activeCampaign,
            candidates: candidates.map((c) => {
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
          app.log.error({ err: error, request_id: requestId }, "mobile bootstrap failed");
          return reply.code(500).send(
            errorPayload(requestId, "MOBILE_BOOTSTRAP_ERROR", "error armando bootstrap"),
          );
        }
      },
    );
  };
}
