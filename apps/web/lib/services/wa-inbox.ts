/**
 * WhatsApp Inbox client — view paralela al CMS clásico.
 *
 * El CMS sobre form_submissions ya cubre el flow de leads de campo.
 * Este service consume las nuevas rutas /api/cms/conversations* que
 * sirven datos de la pipa wa-events (bot Baileys → wa_messages relacional).
 */

import { api } from "./api";

// ── Types ────────────────────────────────────────────────────────────

export type WaVoterProfile = {
  id: string;
  canonical_name: string;
  pipeline_status: string;
  tags: string[];
  ai_classification: {
    model?: string;
    category?: string;
    vote_class?: string;
    confidence?: number;
    reason?: string;
    classified_at?: string;
  };
  vote_class: string;
  category: string;
  engagement_score: number;
};

export type WaConversationSummary = {
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
  voter_profile: WaVoterProfile | null;
  last_message: {
    ts_ms: number;
    text: string;
    message_type: string;
    direction: "in" | "out";
  } | null;
};

export type WaMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "reaction"
  | "system";

export type WaMessage = {
  id: string;
  external_id: string | null;
  direction: "in" | "out";
  message_type: WaMessageType;
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
  ts_ms: number;
};

export type WaConversationFilters = {
  engagement?: string;
  tag?: string;
  country?: string;
  is_group?: boolean | null;
  search?: string;
  limit?: number;
  offset?: number;
};

// ── API calls ────────────────────────────────────────────────────────

export async function listWaConversations(filters: WaConversationFilters = {}) {
  const params = new URLSearchParams();
  if (filters.engagement) params.set("engagement", filters.engagement);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.country) params.set("country", filters.country);
  if (filters.is_group != null) params.set("is_group", String(filters.is_group));
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  params.set("limit", String(filters.limit ?? 50));
  params.set("offset", String(filters.offset ?? 0));
  return api.get<{ conversations: WaConversationSummary[] }>(
    `/api/cms/conversations?${params.toString()}`,
  );
}

export async function getWaConversationMessages(
  conversationId: string,
  options: { limit?: number; before_ts?: number } = {},
) {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 100));
  if (options.before_ts) params.set("before_ts", String(options.before_ts));
  return api.get<{
    conversation: WaConversationSummary;
    messages: WaMessage[];
    has_more: boolean;
  }>(`/api/cms/conversations/${conversationId}/messages?${params.toString()}`);
}

export async function markWaConversationRead(conversationId: string) {
  return api.post<{ updated: number }>(
    `/api/cms/conversations/${conversationId}/read`,
    {},
  );
}
