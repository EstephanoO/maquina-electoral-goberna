import { api } from "@/lib/api-client";

export type CandidatoContext = {
  user: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    has_password: boolean;
    foto_url: string | null;
  };
  campaign: {
    id: string;
    slug: string;
    name: string;
  };
  cargo: {
    codigo: string;
    nombre: string;
    ambito: "pais" | "departamento" | "provincia" | "distrito";
    nivel_codigo: string;
    nivel_nombre: string;
  };
  jurisdiccion: {
    pais: { id: number; nombre: string; iso2: string };
    departamento: { id: number; nombre: string } | null;
    provincia: { id: number; nombre: string } | null;
    distrito: { id: number; nombre: string } | null;
  };
  organizacion_politica: {
    codigo: string;
    nombre: string;
    siglas: string | null;
  } | null;
};

export const onboardingApi = {
  async getMe(): Promise<CandidatoContext | null> {
    const res = await api.get<{ ok: true } & CandidatoContext>("/api/onboarding/me");
    if (!res.ok || !res.data) return null;
    return {
      user: res.data.user,
      campaign: res.data.campaign,
      cargo: res.data.cargo,
      jurisdiccion: res.data.jurisdiccion,
      organizacion_politica: res.data.organizacion_politica,
    };
  },

  async setInitialPassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
    const res = await api.post<{ ok: true }>("/api/auth/set-initial-password", {
      new_password: newPassword,
    });
    if (!res.ok) {
      return { ok: false, error: res.error?.message ?? "Error al guardar contraseña" };
    }
    return { ok: true };
  },
};
