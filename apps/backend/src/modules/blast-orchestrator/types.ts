// blast-orchestrator/types.ts
// Shared types for the orchestration engine.
// See: docs/BLAST-V2-ARCHITECTURE.md §2.1

// ── Phone state machine ─────────────────────────────────────────────
export type PhoneStateName =
  | "dormant"       // Outside operating hours (20:01-07:59 or Sunday)
  | "warming"       // First 30 min of day, slow sending
  | "sending"       // Normal send rate
  | "checkpoint"    // Paused at 50 msgs, waiting for replies
  | "cooling"       // Micro-break 30-90s between batches
  | "throttled"     // Forced slowdown due to risk (spam score >45)
  | "paused";       // Manual pause or ban risk critical

export interface PhoneState {
  wa_number: string;
  campaign_id: string;
  state: PhoneStateName;

  // Counters (reset daily at 00:00 UTC-5)
  sent_today: number;
  failed_today: number;
  replied_today: number;
  no_wa_today: number;

  // Rate control
  daily_limit: number;
  hourly_limit: number;
  current_block: string | null;
  block_sent: number;

  // Timing
  last_sent_at: Date | null;
  warmup_start_at: Date | null;
  state_entered_at: Date;
  cooldown_until: Date | null;

  // Health
  spam_score: number;
  reply_rate_7d: number;
  quality_rating: "green" | "yellow" | "red";
  warmup_day: number;
}

// ── Signals that trigger state transitions ──────────────────────────
export type SignalType =
  | "schedule_tick"       // Periodic check (cron or poll)
  | "message_sent"        // A message was sent successfully
  | "message_failed"      // A message failed to send
  | "reply_received"      // A blast contact replied
  | "block_complete"      // 50 msgs in current block
  | "checkpoint_cleared"  // Reply rate OK, proceed
  | "spam_score_update"   // Spam detector reported new score
  | "manual_pause"        // Operator paused
  | "manual_resume"       // Operator resumed
  | "ban_detected";       // Phone appears banned

export interface Signal {
  type: SignalType;
  score?: number;       // For spam_score_update
  reply_rate?: number;  // For checkpoint_cleared
  timestamp: Date;
}

// ── Phone health data for daily limit calculation ───────────────────
export interface PhoneHealthData {
  warmup_day: number;
  reply_rate_7d: number;
  blocks_without_incident: number;
  reports_received: number;
  quality_rating: "green" | "yellow" | "red";
  consecutive_healthy_days: number;
  no_wa_rate: number;
  failed_rate: number;
  utilization: number;  // sent_today / daily_limit
}

// ── Scale gates — ALL must be true to increase daily_limit ──────────
export interface ScaleGates {
  reply_rate_7d_above: number;       // >25%
  spam_score_below: number;          // <30
  consecutive_days_healthy: number;  // 3+
  no_wa_rate_below: number;          // <15%
  failed_rate_below: number;         // <5%
  daily_limit_utilization: number;   // >85%
}

// ── Operator types ──────────────────────────────────────────────────
export type OperatorRole = "sender" | "responder" | "coordinator";

export interface OperatorStatus {
  user_id: string;
  campaign_id: string;
  wa_number: string | null;
  role: OperatorRole;
  is_online: boolean;
  last_heartbeat: Date;
  active_conversations: number;
  max_concurrent: number;
  avg_response_ms: number | null;
  previous_contacts: Set<string>;
  assigned_wa_numbers: string[];
}

export interface ConversationAssignment {
  id: string;
  conversation_id: string | null;
  jid: string;
  wa_number: string;
  assigned_to: string | null;
  status: "pending" | "active" | "resolved";
  assigned_at: Date;
  locked_until: Date;
  resolved_at: Date | null;
  reply_count: number;
}

// ── Template A/B ────────────────────────────────────────────────────
export interface BlastTemplate {
  id: string;
  campaign_id: string;
  template_id: string;
  variant: string;
  body: string;
  is_active: boolean;
  weight: number;
  sent_count: number;
  reply_count: number;
  reply_rate: number;
}

// ── Daily metrics ───────────────────────────────────────────────────
export interface DailyMetric {
  campaign_id: string;
  wa_number: string;
  metric_date: string;
  sent: number;
  delivered: number;
  replied: number;
  failed: number;
  no_wa: number;
  avg_reply_time_s: number | null;
  spam_score_max: number;
  quality_rating: string;
}

// ── Rollback triggers ───────────────────────────────────────────────
export interface RollbackTrigger {
  condition: string;
  threshold: number;
  window_hours: number;
  action: "reduce_30" | "reduce_50" | "pause_phone";
}

// ── Dashboard v2 response ───────────────────────────────────────────
export interface BlastDashboardV2 {
  phones: Array<{
    wa_number: string;
    label: string | null;
    state: PhoneStateName;
    sent_today: number;
    daily_limit: number;
    reply_rate: number;
    quality: "green" | "yellow" | "red";
    warmup_day: number;
    can_scale: boolean;
    next_milestone: number;
  }>;

  totals: {
    sent_today: number;
    replied_today: number;
    reply_rate: number;
    conversion_rate: number;
    avg_reply_time: string;
  };

  operators: Array<{
    user_id: string;
    name: string;
    is_online: boolean;
    active_conversations: number;
    avg_response_time_s: number;
    resolved_today: number;
  }>;

  templates: Array<{
    template_id: string;
    variant: string;
    sent: number;
    replied: number;
    reply_rate: number;
    is_winner: boolean;
  }>;

  alerts: Array<{
    level: "info" | "warning" | "critical";
    phone: string | null;
    message: string;
    action: string;
    created_at: Date;
  }>;

  daily_trend: Array<{
    date: string;
    sent: number;
    replied: number;
    failed: number;
    reply_rate: number;
  }>;
}
