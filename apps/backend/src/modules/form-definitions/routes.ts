import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import {
  createFormDefinitionSchema,
  formDefinitionResponseSchema,
  updateFormDefinitionSchema,
} from "./schemas";

export function buildFormDefinitionsRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── GET /api/form-definitions ─────────────────────────────────────
    // List all form definitions (admin only)
    app.get(
      "/api/form-definitions",
      { preHandler: [app.authenticate, authorize({ roles: ["admin", "supervisor"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { campaign_id, status } = request.query as {
          campaign_id?: string;
          status?: "draft" | "active" | "archived";
        };

        try {
          let definitions: repo.FormDefinitionRow[];

          if (campaign_id) {
            definitions = await repo.findByCampaignIdWithStatus(campaign_id, status);
          } else {
            definitions = await repo.findAll();
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            form_definitions: definitions,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form definitions list failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "FORM_DEFINITIONS_LIST_ERROR", "error listando definiciones de formulario"));
        }
      },
    );

    // ── GET /api/form-definitions/active ─────────────────────────────
    // Get active form definitions for a campaign (public for agents)
    app.get(
      "/api/form-definitions/active",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;
        const { campaign_id } = request.query as { campaign_id: string };

        if (!campaign_id) {
          return reply
            .code(400)
            .send(errorPayload(requestId, "VALIDATION_ERROR", "campaign_id requerido"));
        }

        try {
          const definitions = await repo.findByCampaignId(campaign_id);
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            form_definitions: definitions,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "active form definitions failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "FORM_DEFINITIONS_GET_ERROR", "error obteniendo formularios activos"));
        }
      },
    );

    // ── GET /api/form-definitions/:id ─────────────────────────────────
    // Get single form definition by ID
    app.get(
      "/api/form-definitions/:id",
      { preHandler: [app.authenticate] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        try {
          const definition = await repo.findById(id);

          if (!definition) {
            return reply
              .code(404)
              .send(errorPayload(requestId, "FORM_DEFINITION_NOT_FOUND", "definicion de formulario no encontrada"));
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            form_definition: definition,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form definition get failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "FORM_DEFINITION_GET_ERROR", "error obteniendo formulario"));
        }
      },
    );

    // ── POST /api/form-definitions ───────────────────────────────────
    // Create new form definition (admin only)
    app.post(
      "/api/form-definitions",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const authed = request as AuthenticatedRequest;

        const parsed = createFormDefinitionSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          // Check if slug already exists for this campaign
          const existing = await repo.findByCampaignAndSlug(
            parsed.data.campaign_id,
            parsed.data.slug,
          );

          if (existing) {
            return reply
              .code(409)
              .send(errorPayload(requestId, "FORM_DEFINITION_SLUG_EXISTS", "ya existe un formulario con este slug para este candidato"));
          }

          const created = await repo.create(
            parsed.data.campaign_id,
            parsed.data.name,
            parsed.data.slug,
            parsed.data.description ?? null,
            parsed.data.schema,
            authed.userId,
          );

          return reply.code(201).send({
            ok: true,
            request_id: requestId,
            form_definition: created,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form definition create failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "FORM_DEFINITION_CREATE_ERROR", "error creando formulario"));
        }
      },
    );

    // ── PUT /api/form-definitions/:id ────────────────────────────────
    // Update form definition (admin only)
    app.put(
      "/api/form-definitions/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        const parsed = updateFormDefinitionSchema.safeParse(request.body);
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => i.message).join(", ");
          return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", message));
        }

        try {
          // Check if exists
          const existing = await repo.findById(id);
          if (!existing) {
            return reply
              .code(404)
              .send(errorPayload(requestId, "FORM_DEFINITION_NOT_FOUND", "formulario no encontrado"));
          }

          // Check slug uniqueness if changing
          if (parsed.data.slug && parsed.data.slug !== existing.slug) {
            const slugExists = await repo.findByCampaignAndSlug(
              existing.campaign_id,
              parsed.data.slug,
            );
            if (slugExists) {
              return reply
                .code(409)
                .send(errorPayload(requestId, "FORM_DEFINITION_SLUG_EXISTS", "ya existe un formulario con este slug"));
            }
          }

          const updated = await repo.update(id, parsed.data);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            form_definition: updated,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form definition update failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "FORM_DEFINITION_UPDATE_ERROR", "error actualizando formulario"));
        }
      },
    );

    // ── DELETE /api/form-definitions/:id ─────────────────────────────
    // Delete form definition (admin only)
    app.delete(
      "/api/form-definitions/:id",
      { preHandler: [app.authenticate, authorize({ roles: ["admin"] })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const { id } = request.params as { id: string };

        try {
          const existing = await repo.findById(id);
          if (!existing) {
            return reply
              .code(404)
              .send(errorPayload(requestId, "FORM_DEFINITION_NOT_FOUND", "formulario no encontrado"));
          }

          const deleted = await repo.remove(id);

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            deleted,
          });
        } catch (error) {
          app.log.error({ err: error, request_id: requestId }, "form definition delete failed");
          return reply
            .code(500)
            .send(errorPayload(requestId, "FORM_DEFINITION_DELETE_ERROR", "error eliminando formulario"));
        }
      },
    );
  };
}
