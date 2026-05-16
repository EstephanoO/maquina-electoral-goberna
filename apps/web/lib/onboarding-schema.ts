// apps/web/lib/onboarding-schema.ts
// Tipos del sistema unificado ECD + 5N + PentaD

// ─── TERRENO ECD ─────────────────────────────────────────────────────────────

export interface E1Demografia {
  poblacion_total?: number;
  distribucion_urbano_rural?: string;
  grupos_etarios?: string;
  etnias_presentes?: string[];
  extension_km2?: number;
  notas?: string;
}
export interface E2CapitalEconomico {
  pbi_per_capita?: number;
  nivel_pobreza_pct?: number;
  principales_sectores?: string[];
  empleo_formal_pct?: number;
  notas?: string;
}
export interface E3CapitalCulturalSocial {
  organizaciones_clave?: string[];
  lideres_territoriales?: Array<{
    nombre: string;
    influencia: "alta" | "media" | "baja";
    afinidad: "favorable" | "neutro" | "adverso";
  }>;
  identidades_dominantes?: string[];
  fiestas_costumbres?: string[];
  lenguas?: string[];
  notas?: string;
}
export interface E4CampoPolitico {
  figuras_publicas?: Array<{
    nombre: string;
    cargo?: string;
    tendencia?: string;
    influencia?: "alta" | "media" | "baja";
  }>;
  partidos_fuertes?: Array<{
    nombre: string;
    pct_aprox?: number;
    trend?: "subiendo" | "estable" | "bajando";
  }>;
  voto_historico_tendencia?: string;
  nivel_polarizacion?: "bajo" | "medio" | "alto";
  notas?: string;
}
export interface E5Cleavages {
  fracturas_vigentes?: Array<{
    nombre: string;
    descripcion?: string;
    intensidad?: "alta" | "media" | "baja";
  }>;
  notas?: string;
}
export interface C1Identidades {
  descripcion?: string;
  partido_dominante?: string;
  porcentaje_identificados?: number;
  percepciones_clave?: string[];
  notas?: string;
}
export interface C2Segmento {
  id: string;
  nombre: string;
  pct_aprox?: number;
  valores?: string[];
  aspiraciones?: string[];
  temores?: string[];
  problema_principal?: string;
  medio_info_preferido?: string;
}
export interface C3MemoriaPolitica {
  hitos_electorales?: Array<{ anio: number; hecho: string; impacto?: string }>;
  partidos_desprestigiados?: string[];
  figuras_positivas?: string[];
  figuras_negativas?: string[];
  notas?: string;
}
export interface C4Issue {
  issue: string;
  pct_menciona?: number;
  prioridad?: number;
}
export interface C5Medios {
  periodistas_clave?: Array<{
    nombre: string;
    medio?: string;
    tendencia?: "favorable" | "neutro" | "adverso";
  }>;
  medios_relevantes?: Array<{ nombre: string; tipo?: string; alcance?: string }>;
  encuestas_disponibles?: Array<{
    fuente: string;
    fecha?: string;
    link?: string;
    notas?: string;
  }>;
  notas?: string;
}
export interface D1UniversoElectoral {
  padron_total?: number;
  padron_habilitado?: number;
  votos_validos_estimados?: number;
  voto_blanco_nulo_pct?: number;
  abstencion_historica_pct?: number;
  votos_necesarios?: number;
  fuente?: string;
}
export interface D2HistorialElectoral {
  elecciones?: Array<{
    anio: number;
    ganador: string;
    partido?: string;
    pct_ganador?: number;
    segundo?: string;
    pct_segundo?: number;
    nuestro_candidato?: string;
    nuestros_votos?: number;
    notas?: string;
  }>;
}
export interface D3OfertaPolitica {
  candidatos?: Array<{
    nombre: string;
    partido?: string;
    nivel_amenaza?: "bajo" | "medio" | "alto";
    fortalezas?: string[];
    debilidades?: string[];
    notas?: string;
  }>;
}
export interface D4LogicaCalculo {
  tipo_decision_predominante?: "habitual" | "racional" | "emotiva" | "presion_social";
  factores_clave?: string[];
  barreras_voto_candidato?: string[];
  catalizadores?: string[];
  notas?: string;
}
export interface D5MatrizDecision {
  matriz?: Array<{
    segmento_id: string;
    candidato_preferido?: string;
    razon_preferencia?: string;
    voto_util?: boolean;
    prob_cambio?: "alta" | "media" | "baja";
    mensaje_clave?: string;
    canal_efectivo?: string;
    portavoz_sugerido?: string;
  }>;
}
export interface SintesisGoberna {
  exC?: string;
  cxD?: string;
  exD?: string;
  triple?: string;
  segmentos_prioritarios?: string[];
  mensaje_diferenciado?: Record<string, string>;
  estrategia_territorial?: string;
  alianzas?: string[];
  riesgos?: string[];
  indicadores?: string[];
  lineas_gestion_post?: string[];
}
export interface TerrenoECD {
  e1_demografia?: E1Demografia;
  e2_capital_economico?: E2CapitalEconomico;
  e3_capital_cultural_social?: E3CapitalCulturalSocial;
  e4_campo_politico?: E4CampoPolitico;
  e5_cleavages?: E5Cleavages;
  c1_identidades?: C1Identidades;
  c2_psicografia?: C2Segmento[];
  c3_memoria_politica?: C3MemoriaPolitica;
  c4_issues?: C4Issue[];
  c5_medios?: C5Medios;
  d1_universo?: D1UniversoElectoral;
  d2_historial?: D2HistorialElectoral;
  d3_oferta?: D3OfertaPolitica;
  d4_logica?: D4LogicaCalculo;
  d5_matriz?: D5MatrizDecision;
  sintesis?: SintesisGoberna;
}

// ─── PERFIL CANDIDATO 5N ─────────────────────────────────────────────────────

export type Semaforo = "verde" | "amarillo" | "rojo";

export interface N1Identidad {
  nombres_completos?: string;
  fecha_nacimiento?: string;
  edad?: number;
  profesion_declarada?: string;
  foto_actual_url?: string;
  fotos_historicas_urls?: string[];
  dni?: string;
  lugar_nacimiento?: string;
  pais_nacimiento?: string;
  nacionalidad?: string;
  naturalizaciones?: string;
  semaforo?: Semaforo;
  notas_semaforo?: string;
}
export interface N2Trayectoria {
  estado_civil?: string;
  hijos?: number;
  residencia_actual?: string;
  estudios?: Array<{
    tipo: "colegio" | "pregrado" | "posgrado" | "certificacion" | "otro";
    institucion: string;
    titulo?: string;
    anio?: number;
    verificado?: boolean;
    fuente_verificacion?: string;
  }>;
  historial_laboral?: Array<{
    cargo: string;
    empleador: string;
    desde?: string;
    hasta?: string;
    verificado?: boolean;
  }>;
  trayectoria_politica?: Array<{
    cargo: string;
    organizacion: string;
    desde?: string;
    hasta?: string;
    resultado?: string;
  }>;
  posiciones_publicas?: Array<{
    fecha?: string;
    descripcion: string;
    fuente?: string;
  }>;
  semaforo?: Semaforo;
  notas_semaforo?: string;
}
export interface N3RiesgoLegal {
  antecedentes_penales?: { estado: "limpio" | "proceso" | "condena"; descripcion?: string };
  antecedentes_policiales?: { estado: "limpio" | "proceso" | "condena"; descripcion?: string };
  antecedentes_fiscales?: { estado: "limpio" | "proceso" | "condena"; descripcion?: string };
  deudas?: Array<{ tipo: string; descripcion?: string; estado?: string }>;
  violencia_familiar?: { estado: "limpio" | "proceso" | "condena"; descripcion?: string };
  escandalos_mediaticos?: Array<{ descripcion: string; fecha?: string; vigente?: boolean }>;
  huella_digital?: { descripcion?: string; riesgo?: "bajo" | "medio" | "alto" };
  vulnerabilidades?: string;
  semaforo?: Semaforo;
  notas_semaforo?: string;
}
export interface N4Patrimonio {
  ingresos_declarados?: number;
  empresas?: Array<{ nombre: string; rol?: string; ruc?: string }>;
  inmuebles?: Array<{ descripcion: string; valor_aprox?: number }>;
  vehiculos?: Array<{ descripcion: string }>;
  record_migratorio?: { paises_visitados?: string[]; residencias_exterior?: string };
  origen_fondos?: { descripcion?: string; coherente?: boolean };
  offshore?: { existencia: boolean; descripcion?: string };
  conflictos_interes?: string;
  semaforo?: Semaforo;
  notas_semaforo?: string;
}
export interface N5Salud {
  antecedentes_medicos?: string;
  salud_mental?: string;
  capacidad_cognitiva?: string;
  adicciones?: string;
  discapacidades?: string;
  resistencia_fisica?: string;
  habitos?: string;
  semaforo?: Semaforo;
  notas_semaforo?: string;
}
export interface PerfilCandidato5N {
  n1_identidad?: N1Identidad;
  n2_trayectoria?: N2Trayectoria;
  n3_riesgo?: N3RiesgoLegal;
  n4_patrimonio?: N4Patrimonio;
  n5_salud?: N5Salud;
  resumen_ejecutivo?: {
    hallazgos_criticos?: string[];
    semaforo_global?: Semaforo;
  };
}

// ─── PRESENCIA DIGITAL PENTA-D ───────────────────────────────────────────────

export interface PentaDIndicador {
  puntaje?: number; // 1–10
  notas?: string;
}
export interface PentaDEje1Presencia {
  facebook?: PentaDIndicador;
  instagram?: PentaDIndicador;
  tiktok?: PentaDIndicador;
  twitter?: PentaDIndicador;
  youtube?: PentaDIndicador;
  whatsapp?: PentaDIndicador;
  web?: PentaDIndicador;
  linkedin?: PentaDIndicador & { aplica?: boolean };
  imagen_coherente?: PentaDIndicador;
  puntaje_eje?: number;
}
export interface PentaDEje2Desempenio {
  crecimiento_seguidores?: PentaDIndicador;
  engagement_rate?: PentaDIndicador;
  frecuencia_publicacion?: PentaDIndicador;
  diversidad_formatos?: PentaDIndicador;
  calidad_audiovisual?: PentaDIndicador;
  alcance_estimado?: PentaDIndicador;
  viralidad?: PentaDIndicador;
  puntaje_eje?: number;
}
export interface PentaDEje3Inversion {
  anuncios_meta?: PentaDIndicador;
  gasto_estimado_meta?: PentaDIndicador;
  anuncios_tiktok?: PentaDIndicador;
  anuncios_google?: PentaDIndicador;
  calidad_creativa?: PentaDIndicador;
  microinfluencers?: PentaDIndicador;
  podcasts_entrevistas?: PentaDIndicador;
  puntaje_eje?: number;
}
export interface PentaDEje4Reputacion {
  sentimiento_comentarios?: PentaDIndicador;
  share_of_voice?: PentaDIndicador;
  menciones_espontaneas?: PentaDIndicador;
  hate_trolling?: PentaDIndicador;
  crisis_manejo?: PentaDIndicador;
  presencia_medios?: PentaDIndicador;
  reputacion_busqueda?: PentaDIndicador;
  fake_news?: PentaDIndicador;
  puntaje_eje?: number;
}
export interface PentaDEje5Operativa {
  equipo_digital?: PentaDIndicador;
  tiempo_respuesta?: PentaDIndicador;
  consistencia_historica?: PentaDIndicador;
  produccion_audiovisual?: PentaDIndicador;
  uso_whatsapp_business?: PentaDIndicador;
  sistematizacion_bd?: PentaDIndicador;
  respuesta_crisis?: PentaDIndicador;
  puntaje_eje?: number;
}
export interface PentaDEvaluacion {
  nombre?: string;
  e1_presencia?: PentaDEje1Presencia;
  e2_desempenio?: PentaDEje2Desempenio;
  e3_inversion?: PentaDEje3Inversion;
  e4_reputacion?: PentaDEje4Reputacion;
  e5_operativa?: PentaDEje5Operativa;
  puntaje_penta_d?: number; // = e1*0.20 + e2*0.25 + e3*0.15 + e4*0.25 + e5*0.15
}
export type BrechaPentaD = "estrategica" | "tactica" | "paridad";
export interface PresenciaPentaD {
  periodo_observacion?: string;
  candidato_propio?: PentaDEvaluacion;
  competidor_1?: PentaDEvaluacion;
  competidor_2?: PentaDEvaluacion;
  brecha?: BrechaPentaD;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function calcPentaD(ev: PentaDEvaluacion): number {
  const e1 = ev.e1_presencia?.puntaje_eje ?? 0;
  const e2 = ev.e2_desempenio?.puntaje_eje ?? 0;
  const e3 = ev.e3_inversion?.puntaje_eje ?? 0;
  const e4 = ev.e4_reputacion?.puntaje_eje ?? 0;
  const e5 = ev.e5_operativa?.puntaje_eje ?? 0;
  return Math.round((e1 * 0.20 + e2 * 0.25 + e3 * 0.15 + e4 * 0.25 + e5 * 0.15) * 10) / 10;
}

export function calcBrecha(prop: number, comp1: number, comp2: number): BrechaPentaD {
  const maxComp = Math.max(comp1, comp2);
  const diff = Math.abs(prop - maxComp);
  if (diff >= 2) return "estrategica";
  if (diff >= 1) return "tactica";
  return "paridad";
}

export const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde:    "text-emerald-400",
  amarillo: "text-amber-400",
  rojo:     "text-red-500",
};
export const SEMAFORO_BG: Record<Semaforo, string> = {
  verde:    "bg-emerald-500/10 border-emerald-500/30",
  amarillo: "bg-amber-500/10 border-amber-500/30",
  rojo:     "bg-red-500/10 border-red-500/30",
};
export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde:    "Verde",
  amarillo: "Amarillo",
  rojo:     "Rojo",
};
