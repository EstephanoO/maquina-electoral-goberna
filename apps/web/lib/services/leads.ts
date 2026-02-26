/**
 * GOBERNA — Leads Service
 * Admin-only service to list TestFlight leads from /descargar.
 */
import { api } from "./api";

export type Lead = {
  id: string;
  nombre: string;
  correo: string;
  plataforma: string;
  created_at: string;
};

type LeadsResponse = { ok: boolean; leads: Lead[]; total: number };

export async function listLeads(limit = 50, offset = 0) {
  return api.get<LeadsResponse>(`/api/leads?limit=${limit}&offset=${offset}`);
}
