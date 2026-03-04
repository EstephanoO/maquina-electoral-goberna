/**
 * GOBERNA — CMS Service
 * API calls for the CMS operator workflow.
 */

import { api } from "./api";

// ── Types ───────────────────────────────────────────────────────────

export type CmsStatus = "nuevo" | "hablado" | "respondieron" | "archivado";

export type CmsVoteTier = "contacto_basura" | "voto_blando" | "voto_duro";

export type CmsSignalFlags = {
  responde?: boolean;
  hace_pregunta?: boolean;
  pide_informacion?: boolean;
  comparte_ubicacion?: boolean;
  deja_en_visto?: boolean;
  bloquea?: boolean;
};

export type CmsOperatorNotes = {
  local_votacion?: string;
  domicilio?: string;
  comentarios?: string;
  signal_flags?: CmsSignalFlags;
  signal_score?: number;
  vote_tier?: CmsVoteTier;
};

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
  cms_operator_notes: CmsOperatorNotes;
  cms_tags: string[];
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

export type CmsSseTagsUpdated = {
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
  notes: CmsOperatorNotes,
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

// ── Tags ────────────────────────────────────────────────────────────

type CmsTagsResponse = {
  ok: boolean;
  tags: string[];
};

export async function getCmsTags(
  campaignId: string,
): Promise<{ ok: boolean; tags: string[]; error?: string }> {
  const res = await api.get<CmsTagsResponse>("/api/cms/tags", { campaignId });
  if (!res.ok) return { ok: false, tags: [], error: res.error?.message };
  return { ok: true, tags: res.data?.tags ?? [] };
}

export async function setContactTags(
  campaignId: string,
  contactId: string,
  tags: string[],
): Promise<{ ok: boolean; contact?: CmsContact; error?: string }> {
  const res = await api.put<CmsContactResponse>(
    `/api/cms/contacts/${contactId}/tags`,
    { tags },
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, contact: res.data?.contact };
}

// ── Device (WA hardware) Metrics ────────────────────────────────────

/** Per-WhatsApp-device metrics with active operator attribution */
export type CmsDeviceMetrics = {
  wa_number: string;
  /** Human-readable label derived by backend position, e.g. "Celular 1" */
  label: string;
  hablados: number;
  respondieron: number;
  archivados: number;
  active_operator_id: string | null;
  active_operator_email: string | null;
  /** ISO string or null */
  active_since: string | null;
  total_operators: number;
};

export type CmsDeviceMetricsGlobal = {
  hablados: number;
  respondieron: number;
  archivados: number;
  active_devices: number;
};

type CmsDeviceMetricsResponse = {
  ok: boolean;
  devices: CmsDeviceMetrics[];
  global: CmsDeviceMetricsGlobal;
};

export async function getDeviceMetrics(campaignId: string): Promise<{
  ok: boolean;
  devices?: CmsDeviceMetrics[];
  global?: CmsDeviceMetricsGlobal;
  error?: string;
}> {
  const res = await api.get<CmsDeviceMetricsResponse>(
    "/api/cms/metrics/devices",
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, devices: res.data?.devices ?? [], global: res.data?.global };
}

// ── Source (contact origin) Metrics ─────────────────────────────────

/** Pipeline breakdown by contact acquisition channel */
export type CmsSourceMetrics = {
  source: "territorio" | "meta" | "manual";
  total: number;
  nuevos: number;
  hablados: number;
  respondieron: number;
  archivados: number;
  contact_rate: number;
  response_rate: number;
};

export type CmsSourceMetricsGlobal = {
  total: number;
  nuevos: number;
  hablados: number;
  respondieron: number;
  archivados: number;
  contact_rate: number;
  response_rate: number;
};

type CmsSourceMetricsResponse = {
  ok: boolean;
  sources: CmsSourceMetrics[];
  global: CmsSourceMetricsGlobal;
};

export async function getSourceMetrics(campaignId: string): Promise<{
  ok: boolean;
  sources?: CmsSourceMetrics[];
  global?: CmsSourceMetricsGlobal;
  error?: string;
}> {
  const res = await api.get<CmsSourceMetricsResponse>(
    "/api/cms/metrics/by-source",
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, sources: res.data?.sources ?? [], global: res.data?.global };
}

// ── Extension (per-WA-phone) Metrics ───────────────────────────────

/** Per-WhatsApp-phone metrics tracked by the Chrome extension */
export type CmsWaPhoneMetrics = {
  wa_number: string;
  hablados: number;
  respondieron: number;
  archivados: number;
  total_interactions: number;
};

export type CmsExtensionMetricsGlobal = {
  hablados: number;
  respondieron: number;
  archivados: number;
  total_interactions: number;
  total: number;
  nuevos: number;
};

type CmsExtensionMetricsResponse = {
  ok: boolean;
  global: CmsExtensionMetricsGlobal;
  phones: CmsWaPhoneMetrics[];
};

export async function getCmsExtensionMetrics(campaignId: string): Promise<{
  ok: boolean;
  global?: CmsExtensionMetricsGlobal;
  phones?: CmsWaPhoneMetrics[];
  error?: string;
}> {
  const res = await api.get<CmsExtensionMetricsResponse>(
    "/api/cms/metrics/extension",
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, global: res.data?.global, phones: res.data?.phones ?? [] };
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
