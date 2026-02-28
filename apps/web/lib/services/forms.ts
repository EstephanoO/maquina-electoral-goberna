/**
 * GOBERNA — Forms Service
 * API operations for form submissions.
 */

import { api, apiRequest } from "./api";

// ── Types ──────────────────────────────────────────────────────────

export interface FormRecord {
  id: string;
  client_id: string;
  nombre: string;
  telefono: string;
  fecha: string;
  x: number;
  y: number;
  zona: string;
  encuestador: string;
  encuestador_id: string;
  agent_id?: string;
  candidato_preferido: string;
  comentarios: string | null;
  campaign_id: string | null;
  created_at: string;
  distrito: string | null;
  departamento: string | null;
  provincia: string | null;
}

// ── API Responses ──────────────────────────────────────────────────

type FormsListResponse = {
  forms: FormRecord[];
  total: number;
  limit: number;
  offset: number;
};

type FormsRecentResponse = {
  forms: FormRecord[];
};

// ── Service Functions ──────────────────────────────────────────────

/**
 * List forms for a campaign with pagination.
 */
export async function listForms(
  campaignId: string,
  options?: { limit?: number; offset?: number },
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const query = params.toString() ? `?${params.toString()}` : "";
  
  return api.get<FormsListResponse>(`/api/forms${query}`, {
    headers: { "x-campaign-id": campaignId },
  });
}

/**
 * Get recent forms for a campaign (for dashboard).
 * @param from - Optional ISO date string (inclusive lower bound)
 * @param to   - Optional ISO date string (exclusive upper bound)
 */
export async function getRecentForms(
  campaignId: string,
  limit = 20,
  from?: string,
  to?: string,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return api.get<FormsRecentResponse>(`/api/forms/recent?${params.toString()}`, {
    headers: { "x-campaign-id": campaignId },
  });
}

/**
 * Update editable fields of a form (admin/consultor only).
 */
export async function updateForm(
  formId: string,
  campaignId: string,
  updates: { nombre?: string; telefono?: string; zona?: string; comentarios?: string | null },
) {
  return api.put<{ updated: boolean; source: string }>(`/api/forms/${formId}`, updates, {
    headers: { "x-campaign-id": campaignId },
  });
}

/**
 * Delete a single form by ID (admin only).
 */
export async function deleteForm(formId: string, campaignId: string) {
  return api.delete<{ deleted: boolean; source: string }>(`/api/forms/${formId}`, {
    headers: { "x-campaign-id": campaignId },
  });
}

/**
 * Delete multiple forms by IDs (admin only).
 */
export async function deleteFormsBatch(ids: string[], campaignId: string) {
  return apiRequest<{ deleted: number; total: number }>("/api/forms/batch", {
    method: "DELETE",
    headers: { "x-campaign-id": campaignId, "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}
