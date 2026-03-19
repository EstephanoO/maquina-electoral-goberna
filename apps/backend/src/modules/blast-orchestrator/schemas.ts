// blast-orchestrator/schemas.ts
// Zod validation for all external input to the orchestrator module.

import { z } from "zod";

// ── Phone state machine ─────────────────────────────────────────────

export const phoneStateNames = [
  "dormant", "warming", "sending", "checkpoint",
  "cooling", "throttled", "paused",
] as const;

export const signalTypes = [
  "schedule_tick", "message_sent", "message_failed", "reply_received",
  "block_complete", "checkpoint_cleared", "spam_score_update",
  "manual_pause", "manual_resume", "ban_detected",
] as const;

// POST /api/blast-orchestrator/signal
export const signalSchema = z.object({
  wa_number: z.string().min(10).max(20),
  type: z.enum(signalTypes),
  score: z.number().int().min(0).max(100).optional(),
  reply_rate: z.number().min(0).max(1).optional(),
});

// POST /api/blast-orchestrator/heartbeat
export const heartbeatSchema = z.object({
  wa_number: z.string().max(20).optional(),
  role: z.enum(["sender", "responder", "coordinator"]).optional(),
  active_conversations: z.number().int().min(0).max(50).optional(),
});

// POST /api/blast-orchestrator/counter
// Increment daily counters from the extension after each send batch.
export const counterIncrementSchema = z.object({
  wa_number: z.string().min(10).max(20),
  sent: z.number().int().min(0).max(50).default(0),
  failed: z.number().int().min(0).max(50).default(0),
  no_wa: z.number().int().min(0).max(50).default(0),
  replied: z.number().int().min(0).max(50).default(0),
});

// POST /api/blast-orchestrator/reply
// Extension reports that a blast contact replied.
export const replyReceivedSchema = z.object({
  wa_number: z.string().min(10).max(20),
  contact_phone: z.string().min(8).max(20),
  jid: z.string().max(80).optional(),
});

// ── Operator assignments ────────────────────────────────────────────

// POST /api/blast-orchestrator/assignments/resolve
export const resolveAssignmentSchema = z.object({
  assignment_id: z.string().uuid(),
});

// ── Templates ───────────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  template_id: z.string().min(1).max(100),
  variant: z.string().min(1).max(10).default("A"),
  body: z.string().min(1).max(2000),
  weight: z.number().min(0.1).max(10).default(1.0),
});

export const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(2000).optional(),
  weight: z.number().min(0.1).max(10).optional(),
  is_active: z.boolean().optional(),
});
