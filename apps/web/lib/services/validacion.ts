/**
 * GOBERNA — Validacion Service
 * API operations for phone number validation pipeline.
 */

import { api } from "./api";

/* ─── Types ─── */

export type ValidationStatus = "pendiente" | "contactado" | "validado" | "invalido";

export interface ValidationItem {
  id: string;
  form_id: string;
  campaign_id: string;
  nombre: string;
  telefono: string;
  encuestador: string;
  zona: string;
  created_at: string;
  status: ValidationStatus;
  notes: string | null;
  claimed_by: string | null;
  claimed_by_name: string | null;
  updated_at: string;
}

export type ValidationStats = Record<ValidationStatus, number>;

/* ─── API ─── */

export async function listValidations(campaignId: string, status?: ValidationStatus) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString() ? `?${params}` : "";
  return api.get<{ items: ValidationItem[] }>(`/api/validacion${qs}`, {
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
  notes?: string,
) {
  return api.put<{ item: ValidationItem }>(`/api/validacion/${id}/status`, { status, notes }, {
    headers: { "x-campaign-id": campaignId },
  });
}

export async function claimValidation(id: string, campaignId: string) {
  return api.put<{ item: ValidationItem }>(`/api/validacion/${id}/claim`, {}, {
    headers: { "x-campaign-id": campaignId },
  });
}
