/**
 * Mocks de CandidatoContext + Fase2DeckMeta para screenshots Playwright.
 * Solo se usan en /dev-preview/fase2/[mode] — ruta gateada por NODE_ENV.
 */
import type {
  CandidatoContext,
  ConsultorFormFase2,
  Fase2DeckMeta,
} from "@/lib/onboarding-api";

// Polígono mínimo de Arequipa simplificado (para que JurisdictionMap rinda algo)
const AREQUIPA_GEOJSON = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-72.5, -16.0],
      [-71.0, -16.0],
      [-70.5, -17.5],
      [-72.0, -17.5],
      [-72.5, -16.0],
    ],
  ],
};

const SHARED_USER = {
  id: "preview-user",
  full_name: "Estephano Orbeg Sánchez",
  email: "estephano@goberna.local",
  phone: "+51987654321",
  has_password: true,
  foto_url: null,
};

const SHARED_CAMPAIGN = {
  id: "preview-campaign",
  slug: "preview",
  name: "Estephano Orbeg — Senador Regional Arequipa",
};

const SHARED_CARGO = {
  codigo: "senador_regional",
  nombre: "Senador Regional",
  ambito: "departamento" as const,
  nivel_codigo: "regional",
  nivel_nombre: "Regional",
};

const SHARED_JURISDICCION = {
  pais: { id: 1, nombre: "Perú", iso2: "PE" },
  departamento: { id: 4, nombre: "Arequipa" },
  provincia: null,
  distrito: null,
};

const SHARED_ORG_POLITICA = {
  codigo: "partido_nacionalista_peruano",
  nombre: "Partido Nacionalista Peruano",
  siglas: "PNP",
};

// ── FULL mock — todos los campos llenos para mostrar las 14 slides ──
const FULL_CONSULTOR_FORM: ConsultorFormFase2 = {
  ficha_basica: { dni: "40123456", edad: 52, profesion: "Psicólogo social" },
  rol_usuario: { filler_role: "consultor" },
  analisis_electoral: {
    comentario_consultor:
      "El candidato necesita una estrategia de tecnopolítica agresiva. La segunda vuelta se definirá en segmentos urbanos altamente digitalizados.",
    ranking_partido_zona: 3,
  },
  votos_para_ganar: {
    votos_ganador_anterior: 187_432,
    padron_actual: 1_125_678,
    votos_meta: 360_000,
    fuente: "ONPE — Elecciones 2021",
  },
  partidos: {
    observaciones: "Voto fragmentado entre 5 partidos principales.",
    top_partidos: [
      { codigo: "fuerza_popular", nombre: "Fuerza Popular", porcentaje: 18.84 },
      { codigo: "partido_nacionalista_peruano", nombre: "Partido Nacionalista", porcentaje: 18.67 },
      { codigo: "renovacion_popular", nombre: "Renovación Popular", porcentaje: 11.92 },
    ],
  },
  historial: {
    entries: [
      { anio: 2021, cargo: "Congresista", jurisdiccion: "Arequipa", partido: "PNP", resultado: "Electo", votos: 187_432, porcentaje: 14.82 },
      { anio: 2016, cargo: "Regidor", jurisdiccion: "Arequipa", partido: "Independiente", resultado: "Segundo", votos: 42_188, porcentaje: 8.16 },
    ],
  },
  formula_electoral: {
    presupuesto_total: 480_000,
    peso_aire: 50,
    peso_tierra: 30,
    peso_mar: 20,
    justificacion:
      "Se prioriza la visibilidad para instalar al candidato en el imaginario colectivo, complementando con mensajería estratégica que reduzca el miedo y genere confianza en votantes indecisos.",
  },
  recorrido_estrategico: {
    hitos: [
      { key: "p1", titulo: "Reunificar el voto castillista", descripcion: "“No podemos dividirnos otra vez” · “Este voto ya eligió un camino” · “Ahora toca terminar lo que empezamos”" },
      { key: "p2", titulo: "Ampliar hacia voto anti-Keiko moderado", descripcion: "Estabilidad · Bajar miedo · Conectar con clase media urbana" },
      { key: "p3", titulo: "Reducir rechazo", descripcion: "Keiko gana si logra instalar miedo. Roberto gana si logra parecer una opción segura. Más cercanía, menos confrontación ideológica dura." },
    ],
  },
  presencia_digital: {
    web_oficial: "flag",
    google_results: "flag",
    redes_verificadas: "flag",
    info_clave: "review",
    notas: "Ausencia total de web oficial y posicionamiento SEO. Ataques en buscadores no podrán ser defendidos.",
  },
  redes_sociales: {
    candidato: {
      facebook: "https://facebook.com/estephano.orbeg",
      instagram: "https://instagram.com/estephano.orbeg",
      tiktok: "https://tiktok.com/@estephano.orbeg",
      youtube: undefined,
      web_oficial: undefined,
      whatsapp: undefined,
    },
    adversarios: [],
  },
  debilidades: {
    fuentes: [
      { key: "denuncias", estado: "ok", hallazgos: ["Sin denuncias activas en JNE"] },
      { key: "google", estado: "flag", hallazgos: ["Nota Infobae: 'temor por vínculos con sectores radicales'", "Wikipedia con sesgo negativo"] },
      { key: "reputacion_redes", estado: "review", hallazgos: ["Comentarios polarizados en posts recientes"] },
      { key: "jne_observaciones", estado: "ok" },
    ],
    lista_libre: [
      { titulo: "Sin canal de WhatsApp activo", descripcion: "Pierde ventana de cierre de voto en última semana.", severidad: "alta" },
      { titulo: "Sin inversión en Meta Ads", descripcion: "Adversarios invierten 70× más en pauta digital.", severidad: "alta" },
      { titulo: "Sin verificación en Facebook/Instagram", severidad: "media" },
    ],
  },
  quien_es: {
    texto_libre:
      "El punto de partida es evaluar cómo está siendo percibido el candidato. Ante la pregunta '¿quién es?', muchos electores recurren a redes sociales y entornos digitales, donde hoy se construye su imagen pública.\n\nSi bien existe un voto duro que se mantendrá, no es suficiente para ganar. La estrategia debe enfocarse en identificar y captar a los sectores donde su mensaje aún no ha calado.",
    trayectoria: "20 años de trabajo territorial en el sur andino.",
    valores: ["Justicia social", "Descentralización", "Educación pública"],
  },
  perfil_candidato: {
    n1_identidad: {
      nombre_completo: "Estephano Orbeg Sánchez",
      bio_corta: "Psicólogo social y congresista por Arequipa.",
      estado_civil: "Casado",
      hijos: 2,
      religion: "Católica",
    },
    n2_trayectoria: {
      ocupacion_actual: "Congresista",
      profesion: "Psicólogo social",
      logros_principales: [
        "Promulgación de la Ley de Salud Mental Regional",
        "Iniciativa de presupuesto descentralizado 2024",
        "Coordinador de bancada PNP en comisión de Educación",
      ],
      formacion: [
        { nivel: "Magíster", institucion: "PUCP", titulo: "Políticas Públicas", anio: 2012 },
        { nivel: "Licenciatura", institucion: "UNSA", titulo: "Psicología Social", anio: 2002 },
      ],
    },
    n3_riesgo: {
      nivel_riesgo_global: "alto",
      google_negativo: ["Nota Infobae"],
      notas: "Riesgo mediático alto por asociación con sectores radicales.",
    },
  },
  territorio_ecd: {
    c2_segmentos: [
      {
        id: "base",
        nombre: "Base",
        valores: ["Lealtad territorial", "Identidad andina"],
        problema_principal: "Voto ya identificado con Castillo y PNP, fuerte en zonas rurales y sur andino",
      },
      {
        id: "periferia",
        nombre: "Periferia (fragmentados)",
        valores: ["Voto disperso", "Baja diferencia"],
        problema_principal: "Votantes de otros candidatos, territorios con baja diferencia o voto disperso",
      },
      {
        id: "indecisos",
        nombre: "Indecisos urbanos",
        valores: ["Más informados", "Más críticos"],
        problema_principal: "Sectores urbanos, más informados pero con dudas o rechazo",
      },
    ],
    nucleo_goberna: {
      segmentos_prioritarios: [
        { segmento_id: "base", mensaje_central: "Consolidar y movilizar" },
        { segmento_id: "periferia", mensaje_central: "Persuadir y captar nuevos votos" },
        { segmento_id: "indecisos", mensaje_central: "Reducir miedo y generar confianza" },
      ],
    },
  },
  fase1_rapida: {
    modo: "completa",
    estrategia: {
      tipo_campana: "EMOTIVA",
      eje_emocional: "ESPERANZA",
      frente_principal: "AIRE",
      frentes_secundarios: ["TIERRA"],
    },
    diagnostico_inicial: {
      fortalezas: [
        "20 años de trabajo territorial reconocido",
        "Voto duro consolidado en sur andino",
        "Relación cercana con organizaciones de base",
      ],
      debilidades: [
        "Ausencia total de presencia digital",
        "Sin equipo de comunicación profesional",
        "Mensaje sin segmentación urbana",
      ],
      oportunidades: [
        "Voto anti-Keiko fragmentado disponible",
        "Departamentos de poca brecha persuadibles",
        "Espacio urbano juvenil sin disputar",
      ],
      amenazas: [
        "Ataque en buscadores no defendible",
        "Inversión publicitaria del adversario 70× superior",
        "Miedo instalado por medios tradicionales",
      ],
    },
    propuestas: [
      { orden: 1, titulo: "Salud Mental Universal", descripcion_corta: "Cobertura pública de salud mental en todas las regiones.", sector: "Salud" },
      { orden: 2, titulo: "Descentralización Fiscal", descripcion_corta: "60% del presupuesto general a las regiones.", sector: "Economía" },
      { orden: 3, titulo: "Educación de Calidad", descripcion_corta: "Salarios docentes equiparados al promedio regional.", sector: "Educación" },
      { orden: 4, titulo: "Conectividad Rural", descripcion_corta: "Internet de alta velocidad en todos los distritos.", sector: "Infraestructura" },
    ],
  },
};

const FULL_DECK: Fase2DeckMeta = {
  id: "preview-deck-full",
  status: "draft",
  consultor_form: FULL_CONSULTOR_FORM,
  updated_at: "2026-05-14T12:00:00Z",
  submitted_for_review_at: null,
  published_at: null,
  rejection_reason: null,
};

export const MOCK_FULL = {
  slug: "preview-full",
  ctx: {
    user: SHARED_USER,
    campaign: SHARED_CAMPAIGN,
    cargo: SHARED_CARGO,
    jurisdiccion: SHARED_JURISDICCION,
    organizacion_politica: SHARED_ORG_POLITICA,
    consultor_form: FULL_CONSULTOR_FORM,
    geojson: AREQUIPA_GEOJSON,
    bbox: [-72.5, -17.5, -70.5, -16.0] as [number, number, number, number],
    centroid: [-71.5, -16.75] as [number, number],
  } satisfies CandidatoContext,
  deck: FULL_DECK,
};

// ── MIN mock — estado real HOY: fase 1 rápida completada, sin form extendido ──
// Replica lo que tiene un candidato recién creado: solo fase1_rapida poblado.
// El deck adaptativo skipea slides que requieren extended form (territorio_ecd,
// debilidades, presencia_digital, etc).
const FASE1_ONLY_FORM: ConsultorFormFase2 = {
  fase1_rapida: FULL_CONSULTOR_FORM.fase1_rapida,
};

const MIN_DECK: Fase2DeckMeta = {
  id: "preview-deck-min",
  status: "draft",
  consultor_form: FASE1_ONLY_FORM,
  updated_at: "2026-05-14T12:00:00Z",
  submitted_for_review_at: null,
  published_at: null,
  rejection_reason: null,
};

export const MOCK_MIN = {
  slug: "preview-min",
  ctx: {
    user: { ...SHARED_USER, foto_url: null, phone: null },
    campaign: { ...SHARED_CAMPAIGN, slug: "preview-min" },
    cargo: SHARED_CARGO,
    jurisdiccion: SHARED_JURISDICCION,
    organizacion_politica: SHARED_ORG_POLITICA,
    consultor_form: FASE1_ONLY_FORM,
    geojson: AREQUIPA_GEOJSON,
    bbox: [-72.5, -17.5, -70.5, -16.0] as [number, number, number, number],
    centroid: [-71.5, -16.75] as [number, number],
  } satisfies CandidatoContext,
  deck: MIN_DECK,
};
