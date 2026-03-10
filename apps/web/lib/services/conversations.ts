/**
 * GOBERNA — Conversations Service
 * Fetches conversation data for the agent quality monitor dashboard.
 */

// ── Types ─────────────────────────────────────────────────────────────

export type ConversationMessage = {
  d: "in" | "out";
  t: string;
  ts: number;
  op?: string;
};

export type Conversation = {
  id: string;
  campaign_id: string;
  own_number: string;
  jid: string;
  phone: string | null;
  contact_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  messages: ConversationMessage[];
  message_count: number;
  inbound_count: number;
  vote_class: string | null;
  status: string | null;
  category: string | null;
  confidence: number | null;
  reason: string | null;
  classified_at: string | null;
  classified_by: string;
  validation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationStats = {
  total: number;
  with_inbound: number;
  classified: number;
  pending: number;
  by_vote_class: Record<string, number>;
  by_owner: Array<{
    owner_id: string;
    owner_name: string;
    count: number;
    classified: number;
  }>;
};

// ── Helpers ───────────────────────────────────────────────────────────

async function convFetch<T>(
  path: string,
  campaignId: string,
  options: RequestInit = {},
): Promise<T & { ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-campaign-id": campaignId,
        ...(options.headers || {}),
      },
    });
    return await res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { ok: false, error: message } as T & { ok: boolean; error: string };
  }
}

// ── API Functions ─────────────────────────────────────────────────────

export async function getConversationStats(
  campaignId: string,
): Promise<{ ok: boolean; stats?: ConversationStats; error?: string }> {
  return convFetch("/conversations/stats", campaignId);
}

export async function getConversations(
  campaignId: string,
  params?: {
    classified_by?: string;
    owner_id?: string;
    has_inbound?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ ok: boolean; items?: Conversation[]; total?: number; error?: string }> {
  const query = new URLSearchParams();
  if (params?.classified_by) query.set("classified_by", params.classified_by);
  if (params?.owner_id) query.set("owner_id", params.owner_id);
  if (params?.has_inbound) query.set("has_inbound", "true");
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const qs = query.toString();
  return convFetch(`/conversations${qs ? `?${qs}` : ""}`, campaignId);
}

export async function getConversation(
  campaignId: string,
  id: string,
): Promise<{ ok: boolean; conversation?: Conversation; error?: string }> {
  return convFetch(`/conversations/${id}`, campaignId);
}
