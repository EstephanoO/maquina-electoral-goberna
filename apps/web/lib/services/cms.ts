/**
 * GOBERNA — CMS Service
 * API calls for the CMS operator workflow.
 */

import { api } from "./api";

// ── Types ───────────────────────────────────────────────────────────

export type CmsStatus = "nuevo" | "claimed" | "hablado" | "respondieron" | "archivado";

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
  is_locked: boolean;
  claimed_by_email?: string;
  submitted_by_email?: string;
};

export type CmsStats = {
  total: number;
  nuevos: number;
  hablados: number;
  hablados_mios: number;
  respondieron: number;
  archivados: number;
  claimed: number;
};

/** Tab filter values the frontend sends to the backend */
export type CmsTabFilter = "nuevo" | "hablado" | "respondieron" | "archivado" | "todos";

// ── Metrics types ───────────────────────────────────────────────────

export type CmsMetricsCampaign = {
  campaign_id: string;
  campaign_name: string;
  total: number;
  nuevos: number;
  claimed: number;
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
  claimed_now: number;
};

export type CmsMetricsGlobalTotals = {
  total: number;
  nuevos: number;
  claimed: number;
  hablados: number;
  respondieron: number;
  archivados: number;
  contact_rate: number;
  response_rate: number;
};

export type CmsMetrics = {
  campaigns: CmsMetricsCampaign[];
  operators: CmsMetricsOperator[];
  global_totals: CmsMetricsGlobalTotals;
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

export async function claimContact(
  campaignId: string,
  contactId: string,
): Promise<{ ok: boolean; contact?: CmsContact; error?: string }> {
  const res = await api.put<CmsContactResponse>(
    `/api/cms/contacts/${contactId}/claim`,
    {},
    { campaignId },
  );
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, contact: res.data?.contact };
}

export async function releaseContact(
  campaignId: string,
  contactId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api.put(`/api/cms/contacts/${contactId}/release`, {}, { campaignId });
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true };
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

export async function getCmsMetrics(): Promise<{
  ok: boolean;
  metrics?: CmsMetrics;
  error?: string;
}> {
  const res = await api.get<CmsMetricsResponse>("/api/cms/metrics");
  if (!res.ok) return { ok: false, error: res.error?.message };
  return { ok: true, metrics: res.data?.metrics };
}
