/**
 * GOBERNA — Validacion Service
 * API operations for phone number validation pipeline.
 */

import { api } from "./api";

/* ─── Types ─── */

export type ValidationStatus = "pendiente" | "contactado" | "respondido" | "invalido";

export interface ValidationItem {
  id: string;
  form_id: string;
  campaign_id: string;
  nombre: string;
  telefono: string;
  encuestador: string;
  zona: string;
  departamento: string | null;
  created_at: string;
  status: ValidationStatus;
  notes: string | null;
  tags: string[];
  score: number;
  vote_class: string; // "duro" | "blando" | "tibio" | ""
  claimed_by: string | null;
  claimed_by_name: string | null;
  updated_at: string;
}

export type ValidationStats = {
  pendiente: number;
  contactado: number;
  respondido: number;  // total respondido en backend (incluye todas las subclases de voto)
  invalido: number;    // backend usa "invalido" — mapea a columna visual "imposible"
};

/* ─── API ─── */

export interface PaginatedValidations {
  items: ValidationItem[];
  total: number;
  page: number;
  limit: number;
}

export async function listValidations(
  campaignId: string,
  status?: ValidationStatus,
  page = 1,
  limit = 100,
) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return api.get<PaginatedValidations>(`/api/validacion?${params}`, {
    headers: { "x-campaign-id": campaignId },
  });
}

export async function getValidationStats(campaignId: string) {
  return api.get<{ stats: ValidationStats }>("/api/validacion/stats", {
    headers: { "x-campaign-id": campaignId },
  });
}

export async function updateValidationStatus(
  id: string,
  campaignId: string,
  status: ValidationStatus,
  vote_class?: string,
) {
  return api.put<{ item: ValidationItem }>(`/api/validacion/${id}/status`, { status, vote_class }, {
    headers: { "x-campaign-id": campaignId },
  });
}

export async function claimValidation(id: string, campaignId: string) {
  return api.put<{ item: ValidationItem }>(`/api/validacion/${id}/claim`, {}, {
    headers: { "x-campaign-id": campaignId },
  });
}
