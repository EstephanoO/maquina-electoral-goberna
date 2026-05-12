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
  /** Form editable del consultor (Fase 2). Si null, slides usan placeholders. */
  consultor_form?: ConsultorFormFase2 | null;
};

/** Mismo shape que apps/backend/src/modules/decks/fase2-form.ts */
export type ConsultorFormFase2 = {
  ficha_basica?: { dni?: string; edad?: number; profesion?: string };
  rol_usuario?: { filler_role?: "consultor" | "cartografo" | "candidato" | "admin" };
  analisis_electoral?: { comentario_consultor?: string; ranking_partido_zona?: number };
  votos_para_ganar?: {
    votos_ganador_anterior?: number;
    padron_actual?: number;
    votos_meta?: number;
    fuente?: string;
  };
  partidos?: {
    observaciones?: string;
    top_partidos?: Array<{
      codigo: string;
      nombre: string;
      porcentaje?: number;
      comentario?: string;
    }>;
  };
  historial?: {
    entries?: Array<{
      anio: number;
      cargo: string;
      jurisdiccion?: string;
      partido?: string;
      resultado?: string;
      votos?: number;
      porcentaje?: number;
    }>;
    nunca_postulo?: boolean;
    observaciones?: string;
  };
  formula_electoral?: {
    presupuesto_total?: number;
    peso_aire?: number;
    peso_mar?: number;
    peso_tierra?: number;
    justificacion?: string;
  };
  recorrido_estrategico?: {
    hitos?: Array<{ key: string; titulo: string; fecha?: string; descripcion?: string }>;
  };
  presencia_digital?: {
    web_oficial?: "ok" | "review" | "flag";
    google_results?: "ok" | "review" | "flag";
    redes_verificadas?: "ok" | "review" | "flag";
    info_clave?: "ok" | "review" | "flag";
    notas?: string;
  };
  redes_sociales?: {
    candidato?: SocialHandles;
    adversarios?: Array<{
      nombre: string;
      partido?: string;
      redes?: SocialHandles;
      notas?: string;
    }>;
  };
  debilidades?: {
    fuentes?: Array<{
      key: "denuncias" | "google" | "reputacion_redes" | "jne_observaciones";
      estado: "ok" | "review" | "flag";
      hallazgos?: string[];
      fuente_url?: string;
    }>;
    lista_libre?: Array<{
      titulo: string;
      descripcion?: string;
      severidad: "baja" | "media" | "alta";
    }>;
  };
  quien_es?: {
    texto_libre?: string;
    trayectoria?: string;
    valores?: string[];
  };
  /**
   * Overrides de cualquier texto hardcoded del template. Cada key es
   * único por slide.field (ej: "cover.title", "capacidad.pilar_0.titulo").
   * Si la key no existe, el slide muestra el default original.
   */
  text_overrides?: Record<string, string>;
};

export type SocialHandles = {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  youtube?: string;
  web_oficial?: string;
};

export type Fase2DeckMeta = {
  id: string;
  status: "draft" | "pending_review" | "published" | "rejected";
  consultor_form: ConsultorFormFase2 | null;
  updated_at: string;
  submitted_for_review_at: string | null;
  published_at: string | null;
  rejection_reason: string | null;
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
      // El backend rellena con published_form (snapshot inmutable) o null
      // si todavía no se publicó el deck Fase 2 del candidato.
      consultor_form: res.data.consultor_form ?? null,
    };
  },

  /** Fase 2 de un candidato específico (consultor o admin). */
  async getFase2BySlug(
    slug: string,
  ): Promise<{ ctx: CandidatoContext; deck: Fase2DeckMeta } | null> {
    const res = await api.get<{
      ok: true;
      snapshot: CandidatoContext;
      deck: Fase2DeckMeta;
    }>(`/api/consultor/fase2/by-candidato/${encodeURIComponent(slug)}`);
    if (!res.ok || !res.data) return null;
    const { snapshot, deck } = res.data;
    return {
      ctx: { ...snapshot, consultor_form: deck.consultor_form },
      deck,
    };
  },

  async patchFase2Form(
    slug: string,
    patch: Partial<ConsultorFormFase2>,
  ): Promise<Fase2DeckMeta | null> {
    const res = await api.patch<{ ok: true; deck: Fase2DeckMeta }>(
      `/api/consultor/fase2/by-candidato/${encodeURIComponent(slug)}/form`,
      patch,
    );
    return res.ok && res.data ? res.data.deck : null;
  },

  async submitFase2ForReview(
    slug: string,
  ): Promise<{ deck: Fase2DeckMeta; review_url: string } | null> {
    const res = await api.post<{
      ok: true;
      deck: Fase2DeckMeta;
      review_url: string;
    }>(`/api/consultor/fase2/by-candidato/${encodeURIComponent(slug)}/submit`, {});
    return res.ok && res.data ? { deck: res.data.deck, review_url: res.data.review_url } : null;
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
