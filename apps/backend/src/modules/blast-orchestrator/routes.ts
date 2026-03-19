// blast-orchestrator/routes.ts
// HTTP endpoints for the orchestration engine.
// Prefix: /api/blast-orchestrator/*
// See: docs/BLAST-V2-ARCHITECTURE.md

import type { FastifyPluginAsync } from "fastify";
import type { AppEnv } from "../../config/env";
import type { AuthenticatedRequest } from "../../infra/auth";
import { authorize } from "../../infra/authorize";
import { errorPayload } from "../../infra/http";
import * as repo from "./repository";
import * as sm from "./state-machine";
import * as rc from "./rate-controller";
import {
  signalSchema,
  heartbeatSchema,
  counterIncrementSchema,
  replyReceivedSchema,
  resolveAssignmentSchema,
  createTemplateSchema,
  updateTemplateSchema,
} from "./schemas";

export function buildBlastOrchestratorRoutes(_env: AppEnv): FastifyPluginAsync {
  return async (app) => {

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast-orchestrator/phone-state/:waNumber
    // Returns the full orchestration state for a phone.
    // The extension polls this every 30s to know limits, state, etc.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast-orchestrator/phone-state/:waNumber",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;
        const { waNumber } = request.params as { waNumber: string };

        const clean = waNumber.replace(/\D/g, "").slice(0, 20);
        if (!clean) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR", "waNumber inválido"),
          );
        }

        const state = await repo.getPhoneState(campaignId, clean);
        if (!state) {
          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            registered: false,
            state: null,
          });
        }

        // Compute adaptive daily limit
        const replyRate = await repo.computeReplyRate7d(campaignId, clean);
        const dailyLimit = rc.computeDailyLimit({
          warmup_day: state.warmup_day,
          reply_rate_7d: replyRate,
          blocks_without_incident: 0, // TODO: track in future
          reports_received: 0,
          quality_rating: state.quality_rating,
          consecutive_healthy_days: 0,
          no_wa_rate: state.sent_today > 0
            ? state.no_wa_today / state.sent_today
            : 0,
          failed_rate: state.sent_today > 0
            ? state.failed_today / state.sent_today
            : 0,
          utilization: state.daily_limit > 0
            ? state.sent_today / state.daily_limit
            : 0,
        });

        const hourlyLimit = rc.computeHourlyLimit(dailyLimit);
        const inOperatingHours = sm.isWithinOperatingHours(new Date());

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          registered: true,
          state: state.state,
          daily_limit: dailyLimit,
          hourly_limit: hourlyLimit,
          sent_today: state.sent_today,
          failed_today: state.failed_today,
          replied_today: state.replied_today,
          no_wa_today: state.no_wa_today,
          spam_score: state.spam_score,
          reply_rate_7d: Math.round(replyRate * 100) / 100,
          quality_rating: state.quality_rating,
          warmup_day: state.warmup_day,
          in_operating_hours: inOperatingHours,
          can_send: inOperatingHours &&
            state.state === "sending" &&
            state.sent_today < dailyLimit,
        });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast-orchestrator/signal
    // Receive a signal from the extension and compute state transition.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast-orchestrator/signal",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = signalSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido"),
          );
        }

        const { wa_number, type, score, reply_rate } = parsed.data;
        const phoneRow = await repo.getPhoneState(campaignId, wa_number);
        if (!phoneRow) {
          return reply.code(404).send(
            errorPayload(requestId, "NOT_FOUND", "Número no registrado"),
          );
        }

        // Build current PhoneState from DB row
        const current: import("./types").PhoneState = {
          wa_number: phoneRow.wa_number,
          campaign_id: campaignId,
          state: phoneRow.state,
          sent_today: phoneRow.sent_today,
          failed_today: phoneRow.failed_today,
          replied_today: phoneRow.replied_today,
          no_wa_today: phoneRow.no_wa_today,
          daily_limit: phoneRow.daily_limit,
          hourly_limit: rc.computeHourlyLimit(phoneRow.daily_limit),
          current_block: null,
          block_sent: 0,
          last_sent_at: null,
          warmup_start_at: null,
          state_entered_at: new Date(phoneRow.state_changed_at),
          cooldown_until: null,
          spam_score: phoneRow.spam_score,
          reply_rate_7d: phoneRow.reply_rate_7d,
          quality_rating: phoneRow.quality_rating,
          warmup_day: phoneRow.warmup_day,
        };

        const signal = {
          type,
          score,
          reply_rate,
          timestamp: new Date(),
        } as import("./types").Signal;

        const next = sm.computeNextState(current, signal);

        // Persist only changed fields
        const updates: Record<string, unknown> = {};
        if (next.state !== current.state) {
          updates.state = next.state;
          updates.state_changed_at = next.state_entered_at;
        }
        if (next.sent_today !== current.sent_today) updates.sent_today = next.sent_today;
        if (next.failed_today !== current.failed_today) updates.failed_today = next.failed_today;
        if (next.replied_today !== current.replied_today) updates.replied_today = next.replied_today;
        if (next.spam_score !== current.spam_score) updates.spam_score = next.spam_score;
        if (next.quality_rating !== current.quality_rating) updates.quality_rating = next.quality_rating;

        if (Object.keys(updates).length > 0) {
          await repo.updatePhoneState(campaignId, wa_number, updates);
        }

        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          previous_state: current.state,
          new_state: next.state,
          daily_limit: next.daily_limit,
          sent_today: next.sent_today,
          can_send: next.state === "sending" && next.sent_today < next.daily_limit,
        });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast-orchestrator/counter
    // Increment daily counters from extension batch reports.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast-orchestrator/counter",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = counterIncrementSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido"),
          );
        }

        await repo.incrementCounters(campaignId, parsed.data.wa_number, {
          sent: parsed.data.sent,
          failed: parsed.data.failed,
          no_wa: parsed.data.no_wa,
          replied: parsed.data.replied,
        });

        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast-orchestrator/heartbeat
    // Operator heartbeat — extension calls every 60s.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast-orchestrator/heartbeat",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;
        const userId = req.userId!;

        const parsed = heartbeatSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido"),
          );
        }

        await repo.upsertOperatorHeartbeat(
          campaignId,
          userId,
          parsed.data.wa_number ?? null,
          parsed.data.role ?? "responder",
          parsed.data.active_conversations ?? 0,
        );

        // Also mark stale operators offline
        await repo.markStaleOperatorsOffline(campaignId);

        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast-orchestrator/reply
    // Extension reports a blast contact replied.
    // Correlates with blast_log and updates voter_profiles.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast-orchestrator/reply",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = replyReceivedSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido"),
          );
        }

        const { wa_number, contact_phone } = parsed.data;

        // 1. Mark blast_log entry as replied
        await repo.markBlastLogReplied(campaignId, wa_number, contact_phone);

        // 2. Increment reply counter on phone
        await repo.incrementCounters(campaignId, wa_number, { replied: 1 });

        // 3. Update voter profile
        const canonical = contact_phone.replace(/\D/g, "").slice(-9);
        if (canonical.length === 9) {
          await repo.markVoterBlastReplied(campaignId, canonical);
        }

        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast-orchestrator/operators
    // List all operators and their status.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast-orchestrator/operators",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        const operators = await repo.getOperators(campaignId);
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          operators,
        });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast-orchestrator/assignments
    // Get assignments for the authenticated operator.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast-orchestrator/assignments",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;
        const userId = req.userId!;

        const assignments = await repo.getOperatorAssignments(campaignId, userId);
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          assignments,
        });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // POST /api/blast-orchestrator/assignments/resolve
    // Mark an assignment as resolved.
    // ──────────────────────────────────────────────────────────────────
    app.post(
      "/api/blast-orchestrator/assignments/resolve",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const requestId = String(request.id);

        const parsed = resolveAssignmentSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido"),
          );
        }

        await repo.resolveAssignment(parsed.data.assignment_id);
        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // GET /api/blast-orchestrator/dashboard
    // Complete v2 dashboard: phones + operators + templates + trends.
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast-orchestrator/dashboard",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        try {
          const [phones, operators, templates, trend] = await Promise.all([
            repo.getAllPhoneStates(campaignId),
            repo.getOperators(campaignId),
            repo.getTemplates(campaignId),
            repo.getDailyTrend(campaignId, null, 7),
          ]);

          // Aggregate totals
          let sentToday = 0, repliedToday = 0;
          for (const p of phones) {
            sentToday += p.sent_today ?? 0;
            repliedToday += p.replied_today ?? 0;
          }

          return reply.code(200).send({
            ok: true,
            request_id: requestId,
            phones: phones.map((p: Record<string, unknown>) => ({
              wa_number: p.wa_number,
              label: p.label,
              state: p.state,
              sent_today: p.sent_today,
              daily_limit: p.daily_limit,
              reply_rate: p.sent_today
                ? Math.round(((p.replied_today as number) / (p.sent_today as number)) * 100) / 100
                : 0,
              quality: p.quality_rating,
              warmup_day: p.warmup_day,
            })),
            totals: {
              sent_today: sentToday,
              replied_today: repliedToday,
              reply_rate: sentToday > 0
                ? Math.round((repliedToday / sentToday) * 100) / 100
                : 0,
            },
            operators,
            templates: templates.map((t) => ({
              template_id: t.template_id,
              variant: t.variant,
              sent: t.sent_count,
              replied: t.reply_count,
              reply_rate: t.reply_rate,
              is_active: t.is_active,
            })),
            daily_trend: trend,
          });
        } catch (err) {
          app.log.error({ err }, "[blast-orchestrator] dashboard failed");
          return reply.code(500).send(
            errorPayload(requestId, "UPSTREAM_ERROR", "Error al obtener dashboard"),
          );
        }
      },
    );

    // ──────────────────────────────────────────────────────────────────
    // TEMPLATES CRUD
    // ──────────────────────────────────────────────────────────────────
    app.get(
      "/api/blast-orchestrator/templates",
      {
        preHandler: [app.authenticate, authorize({ requireCampaign: true })],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        const templates = await repo.getTemplates(campaignId);
        return reply.code(200).send({
          ok: true,
          request_id: requestId,
          templates,
        });
      },
    );

    app.post(
      "/api/blast-orchestrator/templates",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["candidato"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const req = request as AuthenticatedRequest;
        const requestId = String(request.id);
        const campaignId = req.activeCampaignId!;

        const parsed = createTemplateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido"),
          );
        }

        const id = await repo.createTemplate(
          campaignId,
          parsed.data.template_id,
          parsed.data.variant,
          parsed.data.body,
          parsed.data.weight,
        );

        return reply.code(201).send({
          ok: true,
          request_id: requestId,
          id,
        });
      },
    );

    app.put(
      "/api/blast-orchestrator/templates",
      {
        preHandler: [
          app.authenticate,
          authorize({ roles: ["candidato"], requireCampaign: true }),
        ],
      },
      async (request, reply) => {
        const requestId = String(request.id);

        const parsed = updateTemplateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send(
            errorPayload(requestId, "VALIDATION_ERROR",
              parsed.error.issues[0]?.message ?? "Payload inválido"),
          );
        }

        const { id, ...updates } = parsed.data;
        await repo.updateTemplate(id, updates);

        return reply.code(200).send({ ok: true, request_id: requestId });
      },
    );
  };
}
