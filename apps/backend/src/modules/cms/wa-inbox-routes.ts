/**
 * WhatsApp Inbox — endpoints CMS para visualizar conversaciones del bot.
 *
 * El CMS clásico (apps/web/.../cms) está construido sobre form_submissions
 * (leads que vinieron de formularios capturados por brigadistas). Este
 * módulo agrega vistas paralelas para conversations + wa_messages, que
 * es donde aterrizan los inbounds del bot Baileys vía /api/cms/wa-events.
 *
 * Endpoints:
 *   GET  /api/cms/conversations              — lista con voter_profile + last msg
 *   GET  /api/cms/conversations/:id/messages — thread completo con media
 *   POST /api/cms/conversations/:id/read     — bumpea last_read_ms (placeholder)
 */

import type { FastifyPluginAsync } from "fastify";

import type { AppEnv } from "../../config/env";
import { pool } from "../../db";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";

// ── Types ────────────────────────────────────────────────────────────

type ConversationListRow = {
  id: string;
  jid: string;
  own_number: string;
  is_group: boolean;
  group_subject: string | null;
  contact_name: string | null;
  phone: string | null;
  message_count: number;
  inbound_count: number;
  updated_at: string;
  // voter_profile join
  vp_id: string | null;
  vp_name: string | null;
  vp_pipeline_status: string | null;
  vp_tags: string[] | null;
  vp_ai_classification: Record<string, unknown> | null;
  vp_vote_class: string | null;
  vp_category: string | null;
  vp_engagement_score: number | null;
  // last message
  last_msg_ts: string | null;
  last_msg_text: string | null;
  last_msg_type: string | null;
  last_msg_direction: string | null;
};

type MessageRow = {
  id: string;
  external_id: string | null;
  direction: "in" | "out";
  message_type: string;
  text: string;
  media_url: string | null;
  media_mime: string | null;
  media_size_bytes: number | null;
  media_caption: string | null;
  media_duration_sec: number | null;
  media_thumb_url: string | null;
  sender_jid: string | null;
  sender_name: string | null;
  reaction_to_external_id: string | null;
  reaction_emoji: string | null;
  quoted_external_id: string | null;
  operator_id: string | null;
  operator_name: string | null;
  ts_ms: string;
};

// ── Routes ───────────────────────────────────────────────────────────

export function buildWaInboxRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── GET /api/cms/conversations ──────────────────────────────────
    //
    // Lista las conversations de la campaña activa con su voter_profile,
    // tags, classification y preview del último mensaje. Soporta filtros:
    //   ?engagement=comparte|responde|fidelizado|nuevo|...
    //   ?tag=sector:salud   (un solo tag, exact match contra voter_profiles.tags)
    //   ?country=peru       (slug, matchea con país:<slug>)
    //   ?is_group=true|false
    //   ?search=texto       (en contact_name, group_subject, last msg text)
    //   ?limit=50&offset=0
    app.get(
      "/api/cms/conversations",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        const q = request.query as {
          engagement?: string;
          tag?: string;
          country?: string;
          is_group?: string;
          search?: string;
          limit?: string;
          offset?: string;
        };
        const limit = Math.min(Number(q.limit) || 50, 200);
        const offset = Number(q.offset) || 0;
        const engagement = q.engagement?.trim();
        const tag = q.tag?.trim();
        const country = q.country?.trim();
        const isGroupFilter = q.is_group === "true" ? true : q.is_group === "false" ? false : null;
        const search = q.search?.trim() || "";

        const where: string[] = ["c.campaign_id = $1"];
        const params: unknown[] = [campaignId];
        let p = 2;

        if (engagement) {
          where.push(`vp.pipeline_status = $${p++}`);
          params.push(engagement);
        }
        if (tag) {
          where.push(`$${p++} = ANY(vp.tags)`);
          params.push(tag);
        }
        if (country) {
          where.push(`$${p++} = ANY(vp.tags)`);
          params.push(`país:${country}`);
        }
        if (isGroupFilter !== null) {
          where.push(`c.is_group = $${p++}`);
          params.push(isGroupFilter);
        }
        if (search) {
          where.push(`(
            c.contact_name ILIKE $${p}
            OR c.group_subject ILIKE $${p}
            OR last_msg.text ILIKE $${p}
            OR vp.canonical_name ILIKE $${p}
          )`);
          params.push(`%${search}%`);
          p++;
        }

        const whereClause = where.join(" AND ");

        // last_msg = última fila de wa_messages por conversation. Subquery con
        // DISTINCT ON (conversation_id) ordenada por ts_ms DESC.
        const sql = `
          WITH last_msg AS (
            SELECT DISTINCT ON (conversation_id)
              conversation_id, ts_ms, text, message_type, direction
            FROM wa_messages
            ORDER BY conversation_id, ts_ms DESC
          )
          SELECT
            c.id::text                AS id,
            c.jid,
            c.own_number,
            c.is_group,
            c.group_subject,
            c.contact_name,
            c.phone,
            c.message_count,
            c.inbound_count,
            c.updated_at,
            vp.id::text               AS vp_id,
            vp.canonical_name         AS vp_name,
            vp.pipeline_status        AS vp_pipeline_status,
            vp.tags                   AS vp_tags,
            vp.ai_classification      AS vp_ai_classification,
            vp.vote_class             AS vp_vote_class,
            vp.category               AS vp_category,
            vp.engagement_score       AS vp_engagement_score,
            last_msg.ts_ms::text      AS last_msg_ts,
            last_msg.text             AS last_msg_text,
            last_msg.message_type     AS last_msg_type,
            last_msg.direction        AS last_msg_direction
          FROM conversations c
          LEFT JOIN voter_profiles vp
            ON vp.campaign_id = c.campaign_id
            AND vp.canonical_phone = RIGHT(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 9)
          LEFT JOIN last_msg ON last_msg.conversation_id = c.id
          WHERE ${whereClause}
          ORDER BY COALESCE(last_msg.ts_ms, EXTRACT(EPOCH FROM c.updated_at)::bigint * 1000) DESC
          LIMIT $${p++} OFFSET $${p++}
        `;
        params.push(limit, offset);

        try {
          const { rows } = await pool.query<ConversationListRow>(sql, params);

          const conversations = rows.map((r) => ({
            id: r.id,
            jid: r.jid,
            own_number: r.own_number,
            is_group: r.is_group,
            group_subject: r.group_subject,
            contact_name: r.contact_name,
            phone: r.phone,
            message_count: r.message_count,
            inbound_count: r.inbound_count,
            updated_at: r.updated_at,
            voter_profile: r.vp_id ? {
              id: r.vp_id,
              canonical_name: r.vp_name ?? "",
              pipeline_status: r.vp_pipeline_status ?? "nuevo",
              tags: r.vp_tags ?? [],
              ai_classification: r.vp_ai_classification ?? {},
              vote_class: r.vp_vote_class ?? "",
              category: r.vp_category ?? "",
              engagement_score: r.vp_engagement_score ?? 0,
            } : null,
            last_message: r.last_msg_ts ? {
              ts_ms: Number(r.last_msg_ts),
              text: r.last_msg_text ?? "",
              message_type: r.last_msg_type ?? "text",
              direction: r.last_msg_direction ?? "in",
            } : null,
          }));

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            conversations,
          });
        } catch (err) {
          app.log.error({ err, request_id: requestId }, "wa-inbox list failed");
          return reply.code(500).send(errorPayload(requestId, "WA_INBOX_LIST_ERROR", "error listando conversaciones"));
        }
      },
    );

    // ── GET /api/cms/conversations/:id/messages ─────────────────────
    //
    // Thread completo con media + reactions + group sender. Soporta paginación
    // por before_ts (cursor descendente):
    //   ?limit=100&before_ts=<epoch_ms>
    app.get(
      "/api/cms/conversations/:id/messages",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        const { id } = request.params as { id: string };
        const conversationId = Number(id);
        if (!Number.isFinite(conversationId)) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_ID", "id de conversación inválido"));
        }

        const q = request.query as { limit?: string; before_ts?: string };
        const limit = Math.min(Number(q.limit) || 100, 500);
        const beforeTs = q.before_ts ? Number(q.before_ts) : null;

        try {
          // 1. Verifica que la conversation pertenece a la campaña activa.
          const convRow = await pool.query<{
            id: string; jid: string; own_number: string; is_group: boolean; group_subject: string | null;
            contact_name: string | null; phone: string | null; message_count: number; inbound_count: number;
            updated_at: string; vp_id: string | null; vp_name: string | null; vp_pipeline_status: string | null;
            vp_tags: string[] | null; vp_ai_classification: Record<string, unknown> | null;
            vp_vote_class: string | null; vp_category: string | null; vp_engagement_score: number | null;
          }>(
            `SELECT
                c.id::text AS id, c.jid, c.own_number, c.is_group, c.group_subject,
                c.contact_name, c.phone, c.message_count, c.inbound_count, c.updated_at,
                vp.id::text AS vp_id, vp.canonical_name AS vp_name,
                vp.pipeline_status AS vp_pipeline_status, vp.tags AS vp_tags,
                vp.ai_classification AS vp_ai_classification, vp.vote_class AS vp_vote_class,
                vp.category AS vp_category, vp.engagement_score AS vp_engagement_score
              FROM conversations c
              LEFT JOIN voter_profiles vp
                ON vp.campaign_id = c.campaign_id
                AND vp.canonical_phone = RIGHT(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 9)
              WHERE c.id = $1 AND c.campaign_id = $2`,
            [conversationId, campaignId],
          );
          const conv = convRow.rows[0];
          if (!conv) {
            return reply.code(404).send(errorPayload(requestId, "NOT_FOUND", "conversación no encontrada"));
          }

          // 2. Carga mensajes paginados (cursor descendente por ts_ms).
          const msgWhere = ["m.conversation_id = $1"];
          const msgParams: unknown[] = [conversationId];
          if (beforeTs) {
            msgWhere.push("m.ts_ms < $2");
            msgParams.push(beforeTs);
          }
          msgParams.push(limit);

          const { rows: messages } = await pool.query<MessageRow>(
            `SELECT
                m.id::text AS id, m.external_id, m.direction, m.message_type, m.text,
                m.media_url, m.media_mime, m.media_size_bytes, m.media_caption,
                m.media_duration_sec, m.media_thumb_url,
                m.sender_jid, m.sender_name,
                m.reaction_to_external_id, m.reaction_emoji,
                m.quoted_external_id,
                m.operator_id::text AS operator_id, m.operator_name,
                m.ts_ms::text AS ts_ms
              FROM wa_messages m
              WHERE ${msgWhere.join(" AND ")}
              ORDER BY m.ts_ms DESC
              LIMIT $${msgParams.length}`,
            msgParams,
          );

          // El frontend va a renderizar oldest-first, pero el query trae newest
          // first para paginación. Los invertimos antes de devolver para que el
          // cliente no tenga que pensar en orden.
          messages.reverse();

          const conversation = {
            id: conv.id,
            jid: conv.jid,
            own_number: conv.own_number,
            is_group: conv.is_group,
            group_subject: conv.group_subject,
            contact_name: conv.contact_name,
            phone: conv.phone,
            message_count: conv.message_count,
            inbound_count: conv.inbound_count,
            updated_at: conv.updated_at,
            voter_profile: conv.vp_id ? {
              id: conv.vp_id,
              canonical_name: conv.vp_name ?? "",
              pipeline_status: conv.vp_pipeline_status ?? "nuevo",
              tags: conv.vp_tags ?? [],
              ai_classification: conv.vp_ai_classification ?? {},
              vote_class: conv.vp_vote_class ?? "",
              category: conv.vp_category ?? "",
              engagement_score: conv.vp_engagement_score ?? 0,
            } : null,
          };

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            conversation,
            messages: messages.map((m) => ({
              ...m,
              ts_ms: Number(m.ts_ms),
              media_size_bytes: m.media_size_bytes != null ? Number(m.media_size_bytes) : null,
              media_duration_sec: m.media_duration_sec != null ? Number(m.media_duration_sec) : null,
            })),
            // has_more: si trajimos exactly `limit`, es probable que haya más (no exact pero suficiente)
            has_more: messages.length === limit,
          });
        } catch (err) {
          app.log.error({ err, request_id: requestId }, "wa-inbox messages failed");
          return reply.code(500).send(errorPayload(requestId, "WA_INBOX_MESSAGES_ERROR", "error obteniendo mensajes"));
        }
      },
    );

    // ── POST /api/cms/conversations/:id/read ────────────────────────
    //
    // Marcador "leído" sobre voter_profile.last_engagement_at. No es un
    // mark-as-read estricto (electoral no tiene last_read_ms en conversations
    // todavía) — sólo bump del timestamp de engagement para que el operador
    // vea el chat como "activo recientemente". Mark-as-read real queda para
    // una migration posterior.
    app.post(
      "/api/cms/conversations/:id/read",
      { preHandler: [app.authenticate, authorize({ requireCampaign: true })] },
      async (request, reply) => {
        const requestId = String(request.id);
        const campaignId = request.activeCampaignId;
        if (!campaignId) {
          return reply.code(400).send(errorPayload(requestId, "MISSING_CAMPAIGN", "campaign_id requerido"));
        }

        const authed = request as AuthenticatedRequest;
        void authed; // por ahora no usamos userId, pero queda para auditoría futura

        const { id } = request.params as { id: string };
        const conversationId = Number(id);
        if (!Number.isFinite(conversationId)) {
          return reply.code(400).send(errorPayload(requestId, "INVALID_ID", "id inválido"));
        }

        try {
          const result = await pool.query(
            `UPDATE voter_profiles vp
                SET last_engagement_at = now(),
                    updated_at         = now()
              FROM conversations c
              WHERE c.id = $1
                AND c.campaign_id = $2
                AND vp.campaign_id = c.campaign_id
                AND vp.canonical_phone = RIGHT(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 9)`,
            [conversationId, campaignId],
          );
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            updated: result.rowCount ?? 0,
          });
        } catch (err) {
          app.log.error({ err, request_id: requestId }, "wa-inbox mark-read failed");
          return reply.code(500).send(errorPayload(requestId, "WA_INBOX_READ_ERROR", "error marcando como leído"));
        }
      },
    );
  };
}
