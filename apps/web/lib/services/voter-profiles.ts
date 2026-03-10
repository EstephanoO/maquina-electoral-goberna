/**
 * GOBERNA — Voter Profiles Service
 * Unified voter profile CRUD for the dashboard.
 */

// ── Types ─────────────────────────────────────────────────────────────

export type VoterProfile = {
  id: string;
  campaign_id: string;
  canonical_phone: string;
  canonical_name: string;
  name_variants: string[];
  jids: string[];
  departamento: string;
  provincia: string;
  distrito: string;
  zona: string;
  domicilio: string;
  local_votacion: string;
  last_lat: number | null;
  last_lng: number | null;
  vote_class: string;
  vote_class_source: string;
  confidence: number | null;
  category: string;
  signal_score: number;
  signal_flags: Record<string, boolean>;
  pipeline_status: string;
  first_captured_at: string;
  last_contacted_at: string | null;
  last_responded_at: string | null;
  wa_sent_count: number;
  wa_received_count: number;
  source_submission_ids: string[];
  source_conversation_ids: string[];
  source_validation_id: string | null;
  captured_by: string[];
  contacted_by: string[];
  tags: string[];
  notes: string;
  operator_notes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type VoterProfileStats = {
  total: number;
  by_status: Record<string, number>;
  by_vote_class: Record<string, number>;
  with_responses: number;
  with_wa_contact: number;
};

export const PIPELINE_STATUSES = ["nuevo", "contactado", "respondido", "comprometido", "invalido"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

// ── Helpers ───────────────────────────────────────────────────────────

async function vpFetch<T>(
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

export async function getVoterProfiles(
  campaignId: string,
  params?: {
    pipeline_status?: string;
    vote_class?: string;
    search?: string;
    has_wa?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ ok: boolean; items?: VoterProfile[]; total?: number; error?: string }> {
  const query = new URLSearchParams();
  if (params?.pipeline_status) query.set("pipeline_status", params.pipeline_status);
  if (params?.vote_class) query.set("vote_class", params.vote_class);
  if (params?.search) query.set("search", params.search);
  if (params?.has_wa) query.set("has_wa", "true");
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return vpFetch(`/voter-profiles${qs ? `?${qs}` : ""}`, campaignId);
}

export async function getVoterProfileStats(
  campaignId: string,
): Promise<{ ok: boolean; stats?: VoterProfileStats; error?: string }> {
  return vpFetch("/voter-profiles/stats", campaignId);
}

export async function getVoterProfile(
  campaignId: string,
  id: string,
): Promise<{ ok: boolean; profile?: VoterProfile; error?: string }> {
  return vpFetch(`/voter-profiles/${id}`, campaignId);
}

export async function updateVoterProfile(
  campaignId: string,
  id: string,
  data: Partial<{
    canonical_name: string;
    zona: string;
    distrito: string;
    departamento: string;
    provincia: string;
    domicilio: string;
    local_votacion: string;
    vote_class: string;
    pipeline_status: string;
    category: string;
    signal_score: number;
    tags: string[];
    notes: string;
  }>,
): Promise<{ ok: boolean; profile?: VoterProfile; error?: string }> {
  return vpFetch(`/voter-profiles/${id}`, campaignId, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function updateVoterPipelineStatus(
  campaignId: string,
  id: string,
  status: PipelineStatus,
): Promise<{ ok: boolean; profile?: VoterProfile; error?: string }> {
  return vpFetch(`/voter-profiles/${id}/status`, campaignId, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}
