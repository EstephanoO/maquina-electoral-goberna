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
  /** Polígono de la jurisdicción — solo lo rellena el snapshot (carta, fase-2
   *  by-candidato). Null en `/api/onboarding/me`. */
  geojson?: unknown | null;
  bbox?: [number, number, number, number] | null;
  centroid?: [number, number] | null;
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
  text_overrides?: Record<string, string>;

  /** Perfil 5N del candidato (N1-N5 + Entorno + Coherencia) */
  perfil_candidato?: PerfilCandidato | null;

  /** Territorio ECD (Estructura × Conciencia × Decisión = Núcleo Goberna) */
  territorio_ecd?: TerritoryEcd | null;

  /** Datos de Fase 1 Rápida — llenados por el consultor en /onboarding/[slug]/fase-1 */
  fase1_rapida?: Fase1Rapida | null;
};

export type Fase1Rapida = {
  modo?: "rapida" | "completa";
  candidato?: {
    nombre_completo?: string;
    apodo?: string;
    fecha_nacimiento?: string;
    sexo?: "M" | "F";
    documento_tipo?: "DNI" | "CE" | "PASAPORTE";
    documento_numero?: string;
    ocupacion_actual?: string;
    bio_corta?: string;
    foto_url?: string;
    tipo?: "candidato-propio" | "rival" | "aliado";
  };
  postulacion?: {
    cargo_codigo?: string;
    nombre_organizacion?: string;
    nombre_territorio?: string;
    nivel_territorio?: "distrital" | "provincial" | "regional" | "nacional";
    fecha_eleccion?: string;
  };
  estrategia?: {
    tipo_campana?: "RACIONAL" | "EMOTIVA" | "INSTINTIVA" | "MIXTA";
    combinacion_mixta?: Array<"RACIONAL" | "EMOTIVA" | "INSTINTIVA">;
    eje_emocional?: "PLAN_DE_GOBIERNO" | "EQUIPO_DE_CAMPAÑA" | "SIMPATIA" | "ESPERANZA" | "ODIO" | "MIEDO";
    frente_principal?: "TIERRA" | "MAR" | "AIRE";
    frentes_secundarios?: Array<"TIERRA" | "MAR" | "AIRE">;
  };
  diagnostico_inicial?: {
    fortalezas?: string[];
    debilidades?: string[];
    oportunidades?: string[];
    amenazas?: string[];
    principales_competidores?: Array<{
      nombre: string;
      partido?: string;
      nivel_amenaza?: "bajo" | "medio" | "alto";
      notas?: string;
    }>;
  };
  propuestas?: Array<{
    orden: number;
    titulo: string;
    descripcion_corta: string;
    icono?: string;
    sector?: string;
  }>;
  branding?: {
    slogan?: string;
    color_primario?: string;
    color_secundario?: string;
    logo_url?: string;
  };
  contexto_territorio?: {
    poblacion_aproximada?: number;
    principales_problemas?: string[];
    zonas_fuertes?: string[];
    zonas_debiles?: string[];
    notas_adicionales?: string;
  };
  secciones_completas?: string[];
  publicado?: boolean;
  publicado_at?: string;
};

export type PerfilCandidato = {
  n1_identidad?: {
    nombre_completo?: string; apodo?: string; fecha_nacimiento?: string;
    lugar_nacimiento?: string; sexo?: "M" | "F"; documento_tipo?: "DNI" | "CE" | "PASAPORTE";
    documento_numero?: string; bio_corta?: string; foto_url?: string;
    estado_civil?: string; hijos?: number; religion?: string;
  };
  n2_trayectoria?: {
    ocupacion_actual?: string; profesion?: string;
    historial_laboral?: Array<{ orden: number; cargo: string; organizacion: string; anio_inicio?: number; anio_fin?: number | "actual"; descripcion?: string; }>;
    logros_principales?: string[];
    formacion?: Array<{ nivel: string; institucion: string; titulo?: string; anio?: number; }>;
  };
  n3_riesgo?: {
    denuncias_penales?: Array<{ descripcion: string; estado: "activa" | "archivada" | "sentencia"; fuente?: string; }>;
    google_negativo?: string[]; jne_observaciones?: string[];
    nivel_riesgo_global?: "bajo" | "medio" | "alto" | "critico"; notas?: string;
  };
  n4_patrimonio?: {
    declaracion_jurada_url?: string; bienes_principales?: string[]; deudas?: string[];
    consistencia?: "consistente" | "inconsistente" | "sin_datos"; notas?: string;
  };
  n5_salud?: {
    estado_general?: "optimo" | "bueno" | "regular" | "preocupante";
    limitaciones?: string[]; energia_campana?: "alta" | "media" | "baja"; notas?: string;
  };
  entorno?: {
    familia_en_campana?: boolean;
    principales_asesores?: Array<{ nombre: string; rol: string; confianza: "alta" | "media" | "baja"; }>;
    financiadores_clave?: string[]; adversarios_internos?: string[]; notas?: string;
  };
  coherencia?: {
    mensaje_vida_candidatura?: string; contradicciones?: string[];
    score?: number; notas?: string;
  };
};

export type C2Segmento = {
  id: string; nombre: string; pct_aprox?: number;
  valores?: string[]; aspiraciones?: string[]; temores?: string[];
  problema_principal?: string; medio_info_preferido?: string;
};

export type D5MatrixRow = {
  segmento_id: string; candidato_preferido?: string; razon_preferencia?: string;
  voto_util?: boolean; prob_cambio?: "alta" | "media" | "baja";
  mensaje_clave?: string; canal_efectivo?: string; portavoz_sugerido?: string;
};

export type TerritoryEcd = {
  e1_capital_economico?: { pbi_per_capita?: number; nivel_pobreza_pct?: number; principales_sectores?: string[]; notas?: string; };
  e2_capital_social?: {
    organizaciones_clave?: string[];
    lideres_territoriales?: Array<{ nombre: string; influencia: "alta" | "media" | "baja"; afinidad: "favorable" | "neutro" | "adverso"; }>;
    notas?: string;
  };
  e3_capital_cultural?: { identidades_dominantes?: string[]; fiestas_costumbres?: string[]; lenguas?: string[]; notas?: string; };
  e4_campo_politico?: {
    partidos_fuertes?: Array<{ nombre: string; pct_aprox?: number; trend?: "subiendo" | "estable" | "bajando"; }>;
    voto_historico_tendencia?: string; nivel_polarizacion?: "bajo" | "medio" | "alto"; notas?: string;
  };
  e5_infraestructura?: { conectividad?: "buena" | "regular" | "mala"; zonas_geograficas?: string[]; dificultades_acceso?: string[]; notas?: string; };
  c1_identificacion?: { porcentaje_identificados?: number; partido_dominante?: string; notas?: string; };
  c2_segmentos?: C2Segmento[];
  c3_issues?: { top_issues?: Array<{ issue: string; pct_menciona?: number; prioridad?: number; }>; notas?: string; };
  c4_evaluacion?: { aprobacion_candidato?: number; nota_gestion_anterior?: number; comentarios?: string; };
  c5_intencion_voto?: { candidato_puntero?: string; pct_nuestro_candidato?: number; pct_indecisos?: number; fecha_medicion?: string; fuente?: string; };
  c6_voto_util?: { escenario?: string; riesgo_voto_util?: "bajo" | "medio" | "alto"; notas?: string; };
  d1_costo_voto?: { distancia_urnas?: "baja" | "media" | "alta"; obligatoriedad_percibida?: "alta" | "media" | "baja"; notas?: string; };
  d2_beneficios?: { promesas_mas_valoradas?: string[]; credibilidad_promesas?: "alta" | "media" | "baja"; notas?: string; };
  d3_riesgo?: { miedo_al_cambio?: "alto" | "medio" | "bajo"; incertidumbre_candidato?: "alta" | "media" | "baja"; notas?: string; };
  d4_influencia?: { influencers_clave?: Array<{ nombre: string; tipo: string; alcance?: string; }>; grupos_presion?: string[]; notas?: string; };
  d5_matrix?: D5MatrixRow[];
  nucleo_goberna?: {
    segmentos_prioritarios?: Array<{ segmento_id: string; mensaje_central?: string; canal_principal?: string; portavoz?: string; accion_inmediata?: string; }>;
    propuesta_central?: string; diferenciador_clave?: string; notas?: string;
  };
};

export type SocialHandles = {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  youtube?: string;
  web_oficial?: string;
  whatsapp?: string;
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
