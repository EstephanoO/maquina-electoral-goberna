/**
 * GOBERNA — Forms Service
 * API operations for form submissions.
 */

import { api } from "./api";

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
 */
export async function getRecentForms(campaignId: string, limit = 20) {
  return api.get<FormsRecentResponse>(`/api/forms/recent?limit=${limit}`, {
    headers: { "x-campaign-id": campaignId },
  });
}
