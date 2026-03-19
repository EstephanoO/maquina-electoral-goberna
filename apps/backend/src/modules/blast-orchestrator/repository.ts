// blast-orchestrator/repository.ts
// Data layer for the orchestration engine.
// Uses pg.Pool directly (same pattern as blast/repository.ts).

import { pool } from "../../db";
import type {
  PhoneStateName,
  ConversationAssignment,
  BlastTemplate,
  DailyMetric,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════
// PHONE STATE
// ═══════════════════════════════════════════════════════════════════════

/** Read orchestration state for a phone. Returns null if not registered. */
export async function getPhoneState(
  campaignId: string,
  waNumber: string,
) {
  const r = await pool.query(
    `SELECT wa_number, state, daily_limit, sent_today, failed_today,
            replied_today, no_wa_today, spam_score, reply_rate_7d,
            quality_rating, state_changed_at, counters_reset_at,
            warmup_day, created_at
     FROM blast_number_config
     WHERE campaign_id = $1 AND wa_number = $2 AND active = true`,
    [campaignId, waNumber],
  );
  return r.rows[0] ?? null;
}

/** Update phone state + counters after a state transition. */
export async function updatePhoneState(
  campaignId: string,
  waNumber: string,
  updates: {
    state?: PhoneStateName;
    sent_today?: number;
    failed_today?: number;
    replied_today?: number;
    no_wa_today?: number;
    spam_score?: number;
    reply_rate_7d?: number;
    quality_rating?: string;
    daily_limit?: number;
    state_changed_at?: Date;
  },
) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 3; // $1=campaign_id, $2=wa_number

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      sets.push(`${key} = $${idx}`);
      vals.push(value);
      idx++;
    }
  }

  if (sets.length === 0) return;

  await pool.query(
    `UPDATE blast_number_config
     SET ${sets.join(", ")}
     WHERE campaign_id = $1 AND wa_number = $2`,
    [campaignId, waNumber, ...vals],
  );
}

/** Reset daily counters for all phones in a campaign. Called at 00:00 UTC-5. */
export async function resetDailyCounters(campaignId: string) {
  await pool.query(
    `UPDATE blast_number_config
     SET sent_today = 0, failed_today = 0, replied_today = 0,
         no_wa_today = 0, counters_reset_at = CURRENT_DATE
     WHERE campaign_id = $1 AND active = true
       AND counters_reset_at < CURRENT_DATE`,
    [campaignId],
  );
}

/** Increment specific counters atomically. */
export async function incrementCounters(
  campaignId: string,
  waNumber: string,
  increments: { sent?: number; failed?: number; no_wa?: number; replied?: number },
) {
  const parts: string[] = [];
  const vals: unknown[] = [campaignId, waNumber];
  let idx = 3;

  if (increments.sent) {
    parts.push(`sent_today = sent_today + $${idx}`);
    vals.push(increments.sent);
    idx++;
  }
  if (increments.failed) {
    parts.push(`failed_today = failed_today + $${idx}`);
    vals.push(increments.failed);
    idx++;
  }
  if (increments.no_wa) {
    parts.push(`no_wa_today = no_wa_today + $${idx}`);
    vals.push(increments.no_wa);
    idx++;
  }
  if (increments.replied) {
    parts.push(`replied_today = replied_today + $${idx}`);
    vals.push(increments.replied);
    idx++;
  }

  if (parts.length === 0) return;

  await pool.query(
    `UPDATE blast_number_config
     SET ${parts.join(", ")}
     WHERE campaign_id = $1 AND wa_number = $2`,
    [campaignId, waNumber, ...vals],
  );
}

/** Get all active phones for a campaign (for dashboard / cron). */
export async function getAllPhoneStates(campaignId: string) {
  const r = await pool.query(
    `SELECT wa_number, label, state, daily_limit, sent_today, failed_today,
            replied_today, no_wa_today, spam_score, reply_rate_7d,
            quality_rating, warmup_day, state_changed_at, created_at
     FROM blast_number_config
     WHERE campaign_id = $1 AND active = true
     ORDER BY segment_idx`,
    [campaignId],
  );
  return r.rows;
}

// ═══════════════════════════════════════════════════════════════════════
// 7-DAY REPLY RATE
// ═══════════════════════════════════════════════════════════════════════

/** Compute 7-day reply rate from blast_log for a specific phone. */
export async function computeReplyRate7d(
  campaignId: string,
  waNumber: string,
): Promise<number> {
  const r = await pool.query<{ sent: string; replied: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'sent') AS sent,
       COUNT(*) FILTER (WHERE reply_received = true) AS replied
     FROM blast_log
     WHERE campaign_id = $1
       AND wa_number = $2
       AND sent_at >= NOW() - INTERVAL '7 days'`,
    [campaignId, waNumber],
  );
  const sent = parseInt(r.rows[0]?.sent ?? "0", 10);
  const replied = parseInt(r.rows[0]?.replied ?? "0", 10);
  return sent > 0 ? replied / sent : 0;
}

// ═══════════════════════════════════════════════════════════════════════
// OPERATOR STATUS
// ═══════════════════════════════════════════════════════════════════════

/** Upsert operator heartbeat. */
export async function upsertOperatorHeartbeat(
  campaignId: string,
  userId: string,
  waNumber: string | null,
  role: string,
  activeConversations: number,
) {
  await pool.query(
    `INSERT INTO blast_operator_status
       (campaign_id, user_id, wa_number, role, is_online, last_heartbeat, active_conversations)
     VALUES ($1, $2, $3, $4, true, NOW(), $5)
     ON CONFLICT (campaign_id, user_id)
     DO UPDATE SET
       wa_number = COALESCE(EXCLUDED.wa_number, blast_operator_status.wa_number),
       role = EXCLUDED.role,
       is_online = true,
       last_heartbeat = NOW(),
       active_conversations = EXCLUDED.active_conversations`,
    [campaignId, userId, waNumber, role, activeConversations],
  );
}

/** Mark operators offline if no heartbeat in 2 minutes. */
export async function markStaleOperatorsOffline(campaignId: string): Promise<number> {
  const r = await pool.query(
    `UPDATE blast_operator_status
     SET is_online = false
     WHERE campaign_id = $1
       AND is_online = true
       AND last_heartbeat < NOW() - INTERVAL '2 minutes'`,
    [campaignId],
  );
  return r.rowCount ?? 0;
}

/** Get all operators for a campaign. */
export async function getOperators(campaignId: string) {
  const r = await pool.query(
    `SELECT s.user_id, u.name, s.wa_number, s.role, s.is_online,
            s.last_heartbeat, s.active_conversations, s.max_concurrent,
            s.avg_response_ms
     FROM blast_operator_status s
     JOIN users u ON u.id = s.user_id
     WHERE s.campaign_id = $1
     ORDER BY s.is_online DESC, s.active_conversations ASC`,
    [campaignId],
  );
  return r.rows;
}

// ═══════════════════════════════════════════════════════════════════════
// OPERATOR ASSIGNMENTS (conversation routing)
// ═══════════════════════════════════════════════════════════════════════

/** Create a new assignment for an incoming reply. */
export async function createAssignment(
  campaignId: string,
  jid: string,
  waNumber: string,
  conversationId: string | null,
  assignedTo: string,
): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO blast_operator_assignments
       (campaign_id, jid, wa_number, conversation_id, assigned_to, status,
        assigned_at, locked_until)
     VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW() + INTERVAL '15 minutes')
     RETURNING id`,
    [campaignId, jid, waNumber, conversationId, assignedTo],
  );
  return r.rows[0]!.id;
}

/** Get assignments for an operator. */
export async function getOperatorAssignments(
  campaignId: string,
  userId: string,
): Promise<ConversationAssignment[]> {
  const r = await pool.query(
    `SELECT id, conversation_id, jid, wa_number, assigned_to, status,
            assigned_at, locked_until, resolved_at, reply_count
     FROM blast_operator_assignments
     WHERE campaign_id = $1 AND assigned_to = $2 AND status != 'resolved'
     ORDER BY assigned_at DESC`,
    [campaignId, userId],
  );
  return r.rows;
}

/** Release expired locks. Returns count of released assignments. */
export async function releaseExpiredLocks(campaignId: string): Promise<number> {
  const r = await pool.query(
    `UPDATE blast_operator_assignments
     SET status = 'pending', assigned_to = NULL
     WHERE campaign_id = $1
       AND status = 'active'
       AND locked_until < NOW()
     RETURNING conversation_id`,
    [campaignId],
  );
  return r.rowCount ?? 0;
}

/** Mark an assignment as resolved. */
export async function resolveAssignment(assignmentId: string) {
  await pool.query(
    `UPDATE blast_operator_assignments
     SET status = 'resolved', resolved_at = NOW()
     WHERE id = $1`,
    [assignmentId],
  );
}

/** Get pending (unassigned) conversations. */
export async function getPendingAssignments(campaignId: string) {
  const r = await pool.query(
    `SELECT id, conversation_id, jid, wa_number, created_at
     FROM blast_operator_assignments
     WHERE campaign_id = $1 AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 50`,
    [campaignId],
  );
  return r.rows;
}

// ═══════════════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════════════

/** List templates for a campaign. */
export async function getTemplates(campaignId: string): Promise<BlastTemplate[]> {
  const r = await pool.query(
    `SELECT id, campaign_id, template_id, variant, body, is_active,
            weight, sent_count, reply_count, reply_rate
     FROM blast_templates
     WHERE campaign_id = $1
     ORDER BY template_id, variant`,
    [campaignId],
  );
  return r.rows;
}

/** Create a template variant. */
export async function createTemplate(
  campaignId: string,
  templateId: string,
  variant: string,
  body: string,
  weight: number,
): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO blast_templates (campaign_id, template_id, variant, body, weight)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (campaign_id, template_id, variant)
     DO UPDATE SET body = EXCLUDED.body, weight = EXCLUDED.weight, is_active = true
     RETURNING id`,
    [campaignId, templateId, variant, body, weight],
  );
  return r.rows[0]!.id;
}

/** Update template fields. */
export async function updateTemplate(
  id: string,
  updates: { body?: string; weight?: number; is_active?: boolean },
) {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  let idx = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      sets.push(`${key} = $${idx}`);
      vals.push(value);
      idx++;
    }
  }

  if (sets.length === 0) return;

  await pool.query(
    `UPDATE blast_templates SET ${sets.join(", ")} WHERE id = $1`,
    vals,
  );
}

/** Increment template counters. */
export async function incrementTemplateSent(
  campaignId: string,
  templateId: string,
  variant: string,
) {
  await pool.query(
    `UPDATE blast_templates
     SET sent_count = sent_count + 1,
         reply_rate = CASE WHEN sent_count + 1 > 0
                      THEN reply_count::real / (sent_count + 1)
                      ELSE 0 END
     WHERE campaign_id = $1 AND template_id = $2 AND variant = $3`,
    [campaignId, templateId, variant],
  );
}

export async function incrementTemplateReply(
  campaignId: string,
  templateId: string,
  variant: string,
) {
  await pool.query(
    `UPDATE blast_templates
     SET reply_count = reply_count + 1,
         reply_rate = CASE WHEN sent_count > 0
                      THEN (reply_count + 1)::real / sent_count
                      ELSE 0 END
     WHERE campaign_id = $1 AND template_id = $2 AND variant = $3`,
    [campaignId, templateId, variant],
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DAILY METRICS
// ═══════════════════════════════════════════════════════════════════════

/** Upsert daily metrics for a phone (called by aggregation cron). */
export async function upsertDailyMetric(
  campaignId: string,
  waNumber: string,
  metrics: Omit<DailyMetric, "campaign_id" | "wa_number" | "metric_date">,
) {
  await pool.query(
    `INSERT INTO blast_daily_metrics
       (campaign_id, wa_number, metric_date, sent, delivered, replied,
        failed, no_wa, avg_reply_time_s, spam_score_max, quality_rating)
     VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (campaign_id, wa_number, metric_date)
     DO UPDATE SET
       sent = EXCLUDED.sent,
       delivered = EXCLUDED.delivered,
       replied = EXCLUDED.replied,
       failed = EXCLUDED.failed,
       no_wa = EXCLUDED.no_wa,
       avg_reply_time_s = EXCLUDED.avg_reply_time_s,
       spam_score_max = EXCLUDED.spam_score_max,
       quality_rating = EXCLUDED.quality_rating`,
    [
      campaignId, waNumber,
      metrics.sent, metrics.delivered, metrics.replied,
      metrics.failed, metrics.no_wa, metrics.avg_reply_time_s,
      metrics.spam_score_max, metrics.quality_rating,
    ],
  );
}

/** Get 7-day trend for a phone. */
export async function getDailyTrend(
  campaignId: string,
  waNumber: string | null,
  days: number = 7,
): Promise<DailyMetric[]> {
  const whereNumber = waNumber
    ? "AND wa_number = $3"
    : "";
  const params: unknown[] = [campaignId, days];
  if (waNumber) params.push(waNumber);

  const r = await pool.query(
    `SELECT campaign_id, wa_number, metric_date::text,
            sent, delivered, replied, failed, no_wa,
            avg_reply_time_s, spam_score_max, quality_rating
     FROM blast_daily_metrics
     WHERE campaign_id = $1
       AND metric_date >= CURRENT_DATE - ($2 || ' days')::interval
       ${whereNumber}
     ORDER BY metric_date DESC`,
    params,
  );
  return r.rows;
}

// ═══════════════════════════════════════════════════════════════════════
// REPLY CORRELATION
// ═══════════════════════════════════════════════════════════════════════

/** Mark a blast_log entry as replied (by contact phone match). */
export async function markBlastLogReplied(
  campaignId: string,
  waNumber: string,
  contactPhone: string,
) {
  await pool.query(
    `UPDATE blast_log
     SET reply_received = true,
         reply_at = NOW(),
         reply_latency_s = EXTRACT(EPOCH FROM (NOW() - sent_at))::int
     WHERE campaign_id = $1
       AND wa_number = $2
       AND contact_phone LIKE '%' || $3
       AND reply_received = false
       AND status = 'sent'
     ORDER BY sent_at DESC
     LIMIT 1`,
    [campaignId, waNumber, contactPhone],
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VOTER PROFILE ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/** Update engagement fields on voter_profiles when blast contact is made. */
export async function markVoterBlastContacted(
  campaignId: string,
  canonicalPhone: string,
) {
  await pool.query(
    `UPDATE voter_profiles
     SET blast_contacted = true,
         blast_contact_count = blast_contact_count + 1,
         last_blast_at = NOW(),
         updated_at = NOW()
     WHERE campaign_id = $1 AND canonical_phone = $2`,
    [campaignId, canonicalPhone],
  );
}

/** Update engagement fields when blast contact replies. */
export async function markVoterBlastReplied(
  campaignId: string,
  canonicalPhone: string,
) {
  await pool.query(
    `UPDATE voter_profiles
     SET blast_replied = true,
         updated_at = NOW()
     WHERE campaign_id = $1 AND canonical_phone = $2`,
    [campaignId, canonicalPhone],
  );
}
