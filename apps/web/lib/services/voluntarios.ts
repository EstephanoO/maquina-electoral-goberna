/**
 * GOBERNA — Voluntarios Service
 * Public endpoint to register volunteer brigadistas.
 */
import { api } from "./api";

// ── Types ──────────────────────────────────────────────────────────

export type RangoEdad = "18-25" | "26-35" | "36-45";

export type CreateVoluntarioInput = {
  nombre_completo: string;
  telefono: string;
  departamento: string;
  provincia: string;
  distrito: string;
  rango_edad: RangoEdad;
  candidato_slug?: string;
};

export type Voluntario = CreateVoluntarioInput & {
  id: string;
  candidato_id: string | null;
  created_at: string;
};

type CreateVoluntarioResponse = { ok: boolean; voluntario: Voluntario };
type ListVoluntariosResponse = { voluntarios: Voluntario[]; total: number };

// ── Service Functions ──────────────────────────────────────────────

/**
 * Register a new volunteer (public, no auth required).
 */
export async function createVoluntario(input: CreateVoluntarioInput) {
  return api.post<CreateVoluntarioResponse>("/api/voluntarios", input);
}

/**
 * List volunteers — admin / jefe_campana only.
 */
export async function listVoluntarios(limit = 50, offset = 0, candidato_slug?: string) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    ...(candidato_slug ? { candidato_slug } : {}),
  });
  return api.get<ListVoluntariosResponse>(`/api/voluntarios?${params}`);
}
