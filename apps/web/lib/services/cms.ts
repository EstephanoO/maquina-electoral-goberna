/**
 * GOBERNA — CMS Service
 * API calls for the CMS operator workflow.
 */

import { api } from "./api";

// ── Types ───────────────────────────────────────────────────────────

export type CmsStatus = "nuevo" | "hablado" | "respondieron" | "archivado";

export type CmsContact = {
  id: string;
  campaign_id: string;
  data: Record<string, unknown>;
  client_id: string;
  created_at: string;
  cms_status: CmsStatus;
  cms_claimed_by: string | null;
  cms_claimed_at: string | null;
  cms_hablado_at: string | null;
  cms_respondieron_at: string | null;
  cms_operator_notes: {
    local_votacion?: string;
    domicilio?: string;
    comentarios?: string;
  };
  nombre: string;
  telefono: string;
  encuestador: string;
  zona: string;
  distrito: string;
  candidato_preferido: string;
  claimed_by_email?: string;
  submitted_by_email?: string;
};

export type CmsStats = {
  total: number;
  nuevos: number;
  hablados: number;
  respondieron: number;
  archivados: number;
};

/** Tab filter values the frontend sends to the backend */
export type CmsTabFilter = "nuevo" | "hablado" | "respondieron" | "archivado" | "todos";

// ── Metrics types ───────────────────────────────────────────────────

export type CmsMetricsCampaign = {
  campaign_id: string;
  campaign_name: string;
  total: number;
  nuevos: number;
  hablados: number;
  respondieron: number;
  archivados: number;
  contact_rate: number;
  response_rate: number;
};

export type CmsMetricsOperator = {
  user_id: string;
  email: string;
  full_name: string;
  campaign_id: string;
  campaign_name: string;
  hablados: number;
  respondieron: number;
  archivados: number;
};

export type CmsMetricsGlobalTotals = {
  total: number;
  nuevos: number;
  hablados: number;
  respondieron: number;
  archivados: number;
  contact_rate: number;
  response_rate: number;
};

export type CmsTimeMetrics = {
  avg_claim_to_hablado_mins: number | null;
  avg_hablado_to_respondieron_mins: number | null;
  median_claim_to_hablado_mins: number | null;
  median_hablado_to_respondieron_mins: number | null;
  total_with_hablado: number;
  total_with_respondieron: number;
};

export type CmsMetrics = {
  campaigns: CmsMetricsCampaign[];
  operators: CmsMetricsOperator[];
  global_totals: CmsMetricsGlobalTotals;
  time_metrics: CmsTimeMetrics;
};

type CmsContactsResponse = {
  ok: boolean;
  contacts: CmsContact[];
  total: number;
};

type CmsStatsResponse = {
  ok: boolean;
  stats: CmsStats;
};

type CmsContactResponse = {
  ok: boolean;
  contact: CmsContact;
};

type CmsMetricsResponse = {
  ok: boolean;
  metrics: CmsMetrics;
};

// ── SSE event types ────────────────────────────────────────────────

export type CmsSseContactUpdated = {
  contact: CmsContact;
  previous_status: string;
  operator_id: string;
  operator_email: string;
  stats?: CmsStats;
};

export type CmsSseNotesUpdated = {
  contact: CmsContact;
  operator_id: string;
  operator_email: string;
};

// ── WhatsApp message types ──────────────────────────────────────────

export type CmsTwilioDirection = "outbound" | "inbound";

export type CmsTwilioStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "undelivered"
  | "received";

export type CmsTwilioMessage = {
  id: string;
  contact_id: string;
  campaign_id: string;
  direction: CmsTwilioDirection;
  body: string;
  twilio_sid: string | null;
  status: CmsTwilioStatus;
  sent_by: string | null;
  created_at: string;
};

type CmsTwilioMessagesResponse = {
  ok: boolean;
  request_id: string;
  messages: CmsTwilioMessage[];
};

type CmsTwilioSendResponse = {
  ok: boolean;
  request_id: string;
  message_id: string;
  twilio_sid: string | null;
  status: CmsTwilioStatus;
};

// ── API calls ───────────────────────────────────────────────────────

export async function listCmsContacts(
  campaignId: string,
  status: CmsTabFilter = "nuevo",
  limit = 100,
  offset = 0,
  search = "",
): Promise<{ ok: boolean; contacts: CmsContact[]; total: number; error?: string }> {
  const params = new URLSearchParams({
    status,
    limit: String(limit),
    offset: String(offset),
  });
  if (search.trim()) params.set("search", search.trim());

  const res = await api.get<CmsContactsResponse>(
    `/api/cms/contacts?${params.toString()}`,
    { campaignId },
  );
  if (!res.ok) return { ok: false, contacts: [], total: 0, error: res.error?.message };
  return { ok: true, contacts: res.data?.contacts ?? [], total: res.data?.total ?? 0 };
}

export async function markHablado(
  campaignId: string,
  contactId: string,
): Promise<{ ok: boolean; contact?: CmsContact; error?: string }> {
  const res = await api.put<CmsContactResponse>(
    `/api/cms/contacts/${contactId}/hablado`,
    {},
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, contact: res.data?.contact };
}

export async function markRespondieron(
  campaignId: string,
  contactId: string,
): Promise<{ ok: boolean; contact?: CmsContact; error?: string }> {
  const res = await api.put<CmsContactResponse>(
    `/api/cms/contacts/${contactId}/respondieron`,
    {},
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, contact: res.data?.contact };
}

export async function archiveContact(
  campaignId: string,
  contactId: string,
): Promise<{ ok: boolean; contact?: CmsContact; error?: string }> {
  const res = await api.put<CmsContactResponse>(
    `/api/cms/contacts/${contactId}/archive`,
    {},
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, contact: res.data?.contact };
}

export async function updateContactNotes(
  campaignId: string,
  contactId: string,
  notes: { local_votacion?: string; domicilio?: string; comentarios?: string },
): Promise<{ ok: boolean; contact?: CmsContact; error?: string }> {
  const res = await api.put<CmsContactResponse>(
    `/api/cms/contacts/${contactId}/notes`,
    notes,
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, contact: res.data?.contact };
}

export async function getCmsStats(
  campaignId: string,
): Promise<{ ok: boolean; stats?: CmsStats; error?: string }> {
  const res = await api.get<CmsStatsResponse>("/api/cms/stats", { campaignId });
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, stats: res.data?.stats };
}

export async function revertContact(
  campaignId: string,
  contactId: string,
): Promise<{ ok: boolean; contact?: CmsContact; error?: string }> {
  const res = await api.put<CmsContactResponse>(
    `/api/cms/contacts/${contactId}/revert`,
    {},
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, contact: res.data?.contact };
}

export async function getCmsMetrics(campaignId?: string): Promise<{
  ok: boolean;
  metrics?: CmsMetrics;
  error?: string;
}> {
  const res = await api.get<CmsMetricsResponse>(
    "/api/cms/metrics",
    campaignId ? { campaignId } : undefined,
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, metrics: res.data?.metrics };
}

// ── Twilio WhatsApp messages ────────────────────────────────────────

export async function getContactWhatsAppMessages(
  campaignId: string,
  contactId: string,
): Promise<{ ok: boolean; messages: CmsTwilioMessage[]; error?: string }> {
  const res = await api.get<CmsTwilioMessagesResponse>(
    `/api/twilio/whatsapp/messages/${contactId}`,
    { campaignId },
  );
  if (!res.ok) return { ok: false, messages: [], error: res.error?.message };
  return { ok: true, messages: res.data?.messages ?? [] };
}

export async function sendContactWhatsAppMessage(
  campaignId: string,
  contactId: string,
  body: string,
): Promise<{ ok: boolean; messageId?: string; status?: CmsTwilioStatus; error?: string }> {
  const res = await api.post<CmsTwilioSendResponse>(
    "/api/twilio/whatsapp/send",
    {
      contact_id: contactId,
      campaign_id: campaignId,
      body,
    },
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return {
    ok: true,
    messageId: res.data?.message_id,
    status: res.data?.status,
  };
}

// ── Brigadista Metrics ──────────────────────────────────────────────

export type CmsBrigadistaMetricsResponse = {
  ok: boolean;
  brigadistas: import("@/lib/types").CmsBrigadistaMetrics[];
};

/**
 * @param from - Optional ISO date string (inclusive lower bound)
 * @param to   - Optional ISO date string (exclusive upper bound)
 */
export async function getBrigadistaMetrics(
  campaignId: string,
  from?: string,
  to?: string,
): Promise<{
  ok: boolean;
  brigadistas?: import("@/lib/types").CmsBrigadistaMetrics[];
  error?: string;
}> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const path = qs ? `/api/cms/metrics/brigadistas?${qs}` : "/api/cms/metrics/brigadistas";

  const res = await api.get<CmsBrigadistaMetricsResponse>(path, { campaignId });
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, brigadistas: res.data?.brigadistas ?? [] };
}

// ── Twilio config per campaign ───────────────────────────────────────

export type CampaignTwilioConfig = {
  configured: boolean;
  account_sid: string;
  auth_token_hint: string;
  whatsapp_from: string;
};

type TwilioConfigGetResponse = {
  ok: boolean;
  twilio: CampaignTwilioConfig;
};

export async function getCampaignTwilioConfig(
  campaignId: string,
): Promise<{ ok: boolean; twilio?: CampaignTwilioConfig; error?: string }> {
  const res = await api.get<TwilioConfigGetResponse>(
    `/api/campaigns/${campaignId}/integrations/twilio`,
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, twilio: res.data?.twilio };
}

export async function saveCampaignTwilioConfig(
  campaignId: string,
  data: {
    account_sid: string;
    auth_token?: string;
    whatsapp_from: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const res = await api.put(
    `/api/campaigns/${campaignId}/integrations/twilio`,
    data,
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true };
}
