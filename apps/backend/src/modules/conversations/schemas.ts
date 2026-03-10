import { z } from "zod";

// ── Ingest a message into a conversation ─────────────────────────────
export const upsertMessageSchema = z.object({
  jid: z.string().min(5, "jid requerido"),
  own_number: z.string().min(8, "own_number requerido"),
  direction: z.enum(["in", "out"]),
  text: z.string().max(5000).default(""),
  contact_name: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  timestamp: z.number().optional(),
});

export type UpsertMessageInput = z.infer<typeof upsertMessageSchema>;

// ── Classify a conversation ──────────────────────────────────────────
export const classifyConversationSchema = z.object({
  conversation_id: z.number().int().positive(),
  vote_class: z.enum(["duro", "blando", "flotante", ""]).default(""),
  status: z.enum(["respondido", "invalido", ""]).default(""),
  category: z.string().max(100).default(""),
  confidence: z.number().min(0).max(1).default(0),
  reason: z.string().max(500).default(""),
  source: z.enum(["auto", "manual"]).default("auto"),
});

export type ClassifyConversationInput = z.infer<typeof classifyConversationSchema>;

// ── Request AI classification for a conversation ─────────────────────
export const requestClassifySchema = z.object({
  conversation_id: z.number().int().positive(),
});

// ── List/query conversations ─────────────────────────────────────────
export const listConversationsSchema = z.object({
  classified_by: z.enum(["pending", "auto", "manual", "all"]).default("all"),
  owner_id: z.string().uuid().optional(),
  has_inbound: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
