/**
 * GOBERNA — CMS Service
 * API calls for the CMS operator workflow.
 */

import { api } from "./api";

// ── Types ───────────────────────────────────────────────────────────

export type CmsContact = {
  id: string;
  campaign_id: string;
  data: Record<string, unknown>;
  client_id: string;
  created_at: string;
  cms_status: "nuevo" | "claimed" | "hablado";
  cms_claimed_by: string | null;
  cms_claimed_at: string | null;
  cms_operator_notes: {
    local_votacion?: string;
    domicilio?: string;
    comentarios?: string;
  };
  nombre: string;
  telefono: string;
  is_locked: boolean;
  claimed_by_email?: string;
};

export type CmsStats = {
  total: number;
  nuevos: number;
  hablados_mios: number;
  claimed: number;
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

// ── API calls ───────────────────────────────────────────────────────

export async function listCmsContacts(
  campaignId: string,
  status: "nuevo" | "hablado" = "nuevo",
  limit = 100,
  offset = 0,
): Promise<{ ok: boolean; contacts: CmsContact[]; total: number; error?: string }> {
  const res = await api.get<CmsContactsResponse>(
    `/api/cms/contacts?status=${status}&limit=${limit}&offset=${offset}`,
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
