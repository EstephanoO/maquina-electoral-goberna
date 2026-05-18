/**
 * provision-jorge-valdez.ts
 *
 * Crea el candidato Jorge Rafael Valdez Oyola (Alcalde Distrital · Santiago de Surco)
 * y pobla su deck Fase 2 con todos los datos del Excel entregado por el consultor.
 *
 * Idempotente: seguro de correr múltiples veces.
 *   – El candidato usa nexus_tenant_id como llave de idempotencia.
 *   – El deck usa ensureFase2Deck (no-op si ya existe).
 *   – El consultor_form se reescribe en cada corrida (merge level-1).
 *
 * Uso:
 *   cd /srv/app && bun run apps/backend/scripts/provision-jorge-valdez.ts
 */

import "dotenv/config";
import { pool, isOnboardingEnabled } from "../src/db";
import {
  provisionFromOnboarding,
  findByNexusTenantId,
} from "../src/modules/onboarding/repository";
import {
  ensureFase2Deck,
  mergeConsultorForm,
} from "../src/modules/decks/repository";
import {
  getDistrito,
  getUltimoPadron,
  getPresupuesto,
  getRankingPimDistrito,
} from "../src/modules/onboarding-fase1/geo/repository";

// ─── Constantes de identidad ──────────────────────────────────────────────────

const NEXUS_TENANT_ID = "goberna-jorge-valdez-surco-2026";
const FULL_NAME       = "Jorge Rafael Valdez Oyola";
const EMAIL           = "jorge.valdez@goberna.pe";
const SLUG            = "jorge-valdez";
const DNI             = "09542627";

// Geo (UBIGEO INEI como entero)
const ID_DEPARTAMENTO = 15;      // Lima
const ID_PROVINCIA    = 1501;    // Lima (provincia)
const ID_DISTRITO     = 150140;  // Santiago de Surco

// ─── consultor_form — datos del Excel ────────────────────────────────────────
// Estructura completa extraída del archivo Candidato-Form-JorgeValdez-merged.xlsx
// Campos ausentes en Excel = null (el deck los ignora automáticamente)

const CONSULTOR_FORM = {

  ficha_basica: {
    dni:       DNI,
    edad:      54,
    profesion: "Abogado - Sociólogo",
  },

  analisis_electoral: {
    comentario_consultor:
      "Santiago de Surco: distrito urbano 100%, conservador de derecha, padrón 353.867. " +
      "Somos Perú históricamente dominante pero en declive. " +
      "Tres competidores con amenaza alta/media (Juan Palma Aurazo, Roberto Gómez Baca —alcalde saliente—, Oswaldo Moreno Rivera). " +
      "Candidato sin partido vigente a mayo 2026 — requiere nueva afiliación antes del 16/06/2026. " +
      "Riesgo reputacional AMARILLO: investigación lavado activos 2014 archivada, 7 afiliaciones en 26 años, ex-militante A.N.T.A.U.R.O.",
    ranking_partido_zona: null,
  },

  votos_para_ganar: {
    padron_actual:           353_867,
    votos_validos_estimados:  50_000,
    votos_meta:              177_000,
    fuente: "Estimado consultor — datos ONPE/JNE · Santiago de Surco 2026",
  },

  partidos: {
    observaciones:
      "Mercado conservador de derecha. Somos Perú en declive sin datos de % actualizados. " +
      "Sin encuestas disponibles a mayo 2026.",
    top_partidos: [
      { codigo: "somos_peru",         nombre: "Somos Perú",              porcentaje: null, comentario: "Históricamente dominante, en declive" },
      { codigo: "renovacion_popular", nombre: "Renovación Popular",      porcentaje: null, comentario: "Candidato militó 2006-2010" },
      { codigo: "alianza_progreso",   nombre: "Alianza para el Progreso", porcentaje: null, comentario: "Última afiliación vigente del candidato 2022-24" },
    ],
  },

  historial: {
    entries: [
      { anio: 2003, cargo: "Regidor Provincial Lima",   jurisdiccion: "Lima",              partido: "Unidad Nacional",  resultado: "Electo",                              votos: null, porcentaje: null },
      { anio: 2011, cargo: "Regidor Distrital Surco",   jurisdiccion: "Santiago de Surco", partido: "Surco Eres Tú",    resultado: "Electo — renunció 2012",              votos: null, porcentaje: null },
      { anio: 2019, cargo: "Regidor Provincial Lima",   jurisdiccion: "Lima",              partido: "Somos Perú",       resultado: "Electo — Gestión Muñoz Wells 2019-22", votos: null, porcentaje: null },
    ],
    nunca_postulo: false,
    observaciones:
      "7 afiliaciones partidarias en 26 años (2000-2026). Sin partido activo mayo 2026. " +
      "Fecha límite JNE para inscripción: 16/06/2026.",
  },

  formula_electoral: {
    presupuesto_total: null,
    peso_aire:  null,
    peso_tierra: null,
    peso_mar:   null,
    justificacion: null,
  },

  presencia_digital: {
    web_oficial:       "flag",
    google_results:    "review",
    redes_verificadas: "flag",
    info_clave:        "review",
    notas:
      "FB: 5.800 seg | IG: 1.014 seg | TikTok: 800 seg | X: 769 seg. " +
      "Engagement FB 0.4%. Sin inversión en pauta (S/ 0). Sin equipo digital. " +
      "PentaD total 3.0/10 — posición DÉBIL.",
  },

  redes_sociales: {
    candidato: {
      facebook:   null,
      instagram:  null,
      tiktok:     null,
      twitter:    null,
      youtube:    null,
      web_oficial: null,
      whatsapp:   null,
    },
    adversarios: [
      { nombre: "Juan Palma Aurazo",     partido: null, redes: null, notas: "Nivel amenaza: ALTO" },
      { nombre: "Roberto Gómez Baca",    partido: null, redes: null, notas: "Alcalde saliente — nivel amenaza: ALTO" },
      { nombre: "Oswaldo Moreno Rivera", partido: null, redes: null, notas: "Nivel amenaza: MEDIO" },
    ],
  },

  debilidades: {
    fuentes: [
      {
        key:    "denuncias",
        estado: "review",
        hallazgos: [
          "Investigación por lavado de activos — 30a Fiscalía Lima 2014. ARCHIVADA sin condena.",
        ],
      },
      {
        key:    "google",
        estado: "flag",
        hallazgos: [
          "Escándalo lavado activos 2014 (NO vigente) — indexado en medios",
          "Acusación falsificación de firmas Cambio Radical 2005 (NO vigente)",
          "Propietario de encuesta pro-Fujimori 2005 — reportado Perú21",
          "Ex-militante A.N.T.A.U.R.O. (Antauro Humala) 2024-25 — partido cancelado",
        ],
      },
      {
        key:    "reputacion_redes",
        estado: "review",
        hallazgos: [
          "Reputación neutral-positiva, baja visibilidad. PentaD E4: 4.5/10",
        ],
      },
      {
        key:    "jne_observaciones",
        estado: "flag",
        hallazgos: [
          "Candidatura NO inscrita en JNE a mayo 2026",
          "Sin partido vigente — límite JNE: 16/06/2026",
          "UIGV (Abogado) sancionada SUNEDU 2020 — verificar título individualmente",
        ],
      },
    ],
    lista_libre: [
      { titulo: "Sin partido político vigente",          descripcion: "A.N.T.A.U.R.O. cancelado 18/03/2025. Debe afiliar antes del 16/06/2026 o no puede inscribir candidatura.",            severidad: "alta"  },
      { titulo: "7 afiliaciones en 26 años",              descripcion: "Imagen de saltimbanqui político — adversarios lo atacarán como oportunista sin convicción ideológica.",               severidad: "alta"  },
      { titulo: "Ex-militante A.N.T.A.U.R.O.",           descripcion: "Ideología etnocacerista, incompatible con base electoral conservadora/clasemedia de Surco.",                          severidad: "alta"  },
      { titulo: "Investigación lavado activos 2014",      descripcion: "Archivada sin condena. Puede resucitarse como ataque mediático en campaña junto a alcalde Gómez Baca (co-investigado).", severidad: "media" },
      { titulo: "Título UIGV bajo riesgo SUNEDU",         descripcion: "UIGV sancionada 2020 por títulos irregulares. Aunque habilitado en CAL, el título puede ser atacado.",               severidad: "media" },
      { titulo: "Presencia digital DÉBIL — 3.0/10",       descripcion: "Sin equipo digital, sin pauta publicitaria, 5.800 seguidores FB con engagement 0.4%. Competidores probablemente mejor posicionados.", severidad: "alta"  },
    ],
  },

  quien_es: {
    texto_libre:
      "Jorge Rafael Valdez Oyola, abogado y sociólogo de 54 años, nacido en Casma (Áncash) " +
      "y residente en Santiago de Surco. Tres mandatos como regidor: " +
      "Provincial Lima 2003-2006, Distrital Surco 2011-2012, Provincial Lima 2019-2022 (gestión Muñoz Wells). " +
      "Activista ecologista y ciclista habitual.",
    trayectoria:
      "Regidor Provincial Lima ×2 (2003-06 y 2019-22). Regidor Distrital Surco 2011-12. " +
      "Abogado independiente desde 2010. CAL verificado. Sociólogo UNMSM.",
    valores: ["Gestión transparente", "Movilidad sostenible", "Medio ambiente", "Legalidad"],
  },

  // ─── PERFIL 5N COMPLETO ────────────────────────────────────────────────────

  perfil: {
    n1_identidad: {
      nombres_completos:    FULL_NAME,
      fecha_nacimiento:     "1971-07-14",
      edad:                 54,
      profesion_declarada:  "Abogado - Sociólogo",
      dni:                  DNI,
      lugar_nacimiento:     "Casma, Áncash",
      pais_nacimiento:      "Perú",
      nacionalidad:         "Peruana",
      naturalizaciones:     null,
      foto_actual_url:      null,
      fotos_historicas_urls: null,
      semaforo:             "verde",
      notas_semaforo:
        "Identidad verificada: CAL habilitado (LatamVerify), Wikipedia, redes sociales consistentes. " +
        "DNI pendiente verificación JNE cuando se inscriba.",
    },

    n2_trayectoria: {
      estado_civil:      null,
      hijos:             null,
      residencia_actual: "Santiago de Surco, Lima",
      estudios: [
        {
          tipo:                "pregrado",
          institucion:         "Universidad Inca Garcilaso de la Vega (UIGV)",
          titulo:              "Abogado",
          anio:                null,
          verificado:          true,
          fuente_verificacion: "Colegio de Abogados de Lima (CAL) — habilitado",
        },
        {
          tipo:                "pregrado",
          institucion:         "Universidad Nacional Mayor de San Marcos (UNMSM)",
          titulo:              "Sociólogo",
          anio:                null,
          verificado:          true,
          fuente_verificacion: "Wikipedia + posts FB/X con #unmsm",
        },
        {
          tipo:                "posgrado",
          institucion:         "Institución pendiente verificar",
          titulo:              "Máster en Gerencia Pública",
          anio:                null,
          verificado:          false,
          fuente_verificacion: "Bio propia (IG/FB/X) — no verificado en SUNEDU",
        },
      ],
      historial_laboral: [
        { cargo: "Abogado independiente",        empleador: "Independiente",                                         desde: "2010", hasta: "actual",                    verificado: true },
        { cargo: "Regidor Provincial Lima",       empleador: "Municipalidad Metropolitana de Lima",                  desde: "2003", hasta: "2006",                      verificado: true },
        { cargo: "Regidor Distrital Surco",       empleador: "Municipalidad de Santiago de Surco",                  desde: "2011", hasta: "2012 (renunció)",             verificado: true },
        { cargo: "Regidor Provincial Lima",       empleador: "Municipalidad Metropolitana de Lima — Gestión Muñoz Wells", desde: "2019", hasta: "2022",               verificado: true },
      ],
      trayectoria_politica: [
        { cargo: "Militante",    organizacion: "Avancemos",                 desde: "2000", hasta: "2002", resultado: null },
        { cargo: "Militante",    organizacion: "Unidad Nacional",           desde: "2002", hasta: "2004", resultado: null },
        { cargo: "Militante",    organizacion: "Cambio Radical",            desde: "2004", hasta: "2012", resultado: null },
        { cargo: "Militante",    organizacion: "Renovación Popular",        desde: "2006", hasta: "2010", resultado: null },
        { cargo: "Candidato",    organizacion: "Surco Eres Tú",            desde: "2010", hasta: "2010", resultado: "Electo Regidor Distrital Surco" },
        { cargo: "Militante",    organizacion: "Somos Perú",                desde: "2014", hasta: "2021", resultado: "Electo Regidor Provincial Lima 2019" },
        { cargo: "Candidato",    organizacion: "Frente Esperanza 2021",    desde: "2022", hasta: "2022", resultado: null },
        { cargo: "Militante",    organizacion: "Alianza para el Progreso",  desde: "2022", hasta: "2024", resultado: null },
        { cargo: "Ex-militante", organizacion: "A.N.T.A.U.R.O.",          desde: "2024", hasta: "2025", resultado: "PARTIDO CANCELADO 18/03/2025" },
      ],
      posiciones_publicas: null,
      semaforo:       "amarillo",
      notas_semaforo:
        "Sin partido activo a mayo 2026. 7 afiliaciones en 26 años. " +
        "UIGV sancionada SUNEDU 2020 — riesgo sobre título Abogado. " +
        "Máster Gerencia Pública pendiente verificar.",
    },

    n3_riesgo: {
      antecedentes_penales: {
        estado:      "proceso",
        descripcion: "Investigación por lavado de activos — 30a Fiscalía Lima 2014. " +
                     "ARCHIVADA 2 veces (según declaraciones). Sin condena. No vigente.",
      },
      antecedentes_policiales: { estado: "limpio", descripcion: null },
      antecedentes_fiscales:   { estado: "limpio", descripcion: "Investigación 2014 archivada. Sin proceso activo." },
      violencia_familiar:      { estado: "limpio", descripcion: null },
      deudas: null,
      escandalos_mediaticos: [
        { descripcion: "Investigación por lavado de activos — 30a Fiscalía Lima junto a alcalde Gómez Baca y secretario Montoya", fecha: "2014-10", vigente: false },
        { descripcion: "Acusación mediática: falsificación de firmas para inscripción Cambio Radical ante JNE (La Ventana Indiscreta)", fecha: "2005", vigente: false },
        { descripcion: "Propietario de encuesta que favorecía a Alberto Fujimori — reportado Perú21 noviembre 2005", fecha: "2005-11", vigente: false },
      ],
      huella_digital: {
        descripcion: "Presencia activa FB/IG/X/TikTok desde 2009. Noticias negativas 2005/2014 indexadas. Reputación neutral-positiva, baja visibilidad.",
        riesgo:      "medio",
      },
      vulnerabilidades:
        "1. Afiliación previa A.N.T.A.U.R.O. (etnocacerismo) — carga reputacional en Surco conservador. " +
        "2. UIGV sancionada SUNEDU 2020 — título atacable en debates. " +
        "3. 7 partidos en 26 años — imagen de oportunista sin ancla ideológica. " +
        "4. Candidatura no inscrita JNE a mayo 2026.",
      semaforo:       "amarillo",
      notas_semaforo:
        "Antecedentes archivados sin condena. Sin impedimento legal vigente para postular. " +
        "Múltiples flancos reputacionales que adversarios pueden reutilizar.",
    },

    n4_patrimonio: {
      ingresos_declarados: null,
      empresas:            null,
      inmuebles:           null,
      vehiculos:           null,
      record_migratorio:   { paises_visitados: null, residencias_exterior: null },
      origen_fondos: {
        descripcion: "Abogado independiente desde 2010. Tres mandatos como regidor remunerado.",
        coherente:   true,
      },
      offshore: {
        existencia:  false,
        descripcion: "Sin estructuras offshore identificadas.",
      },
      conflictos_interes: null,
      semaforo:       "verde",
      notas_semaforo: "Sin empresas identificadas en SUNAT (pendiente verificación directa). Sin offshore. Patrimonio coherente con perfil.",
    },

    n5_salud: {
      antecedentes_medicos: null,
      salud_mental:         null,
      capacidad_cognitiva:  null,
      adicciones:           null,
      discapacidades:       null,
      resistencia_fisica:   "alta",
      habitos:              "Ciclista habitual (auto-identificado 'ciclópata'). Activismo animalista y ecologista. Perfil físicamente activo.",
      semaforo:             "verde",
      notas_semaforo:       "Resistencia física alta. Sin condiciones de salud conocidas.",
    },

    resumen_ejecutivo: {
      semaforo_global: "amarillo",
      hallazgos_criticos: [
        "Sin partido político vigente a mayo 2026 — debe afiliar antes del 16/06/2026 (JNE)",
        "7 afiliaciones partidarias en 26 años — imagen de político sin ancla ideológica",
        "Investigación lavado de activos 2014 — archivada, resucitable como ataque en campaña",
        "Título UIGV bajo riesgo: SUNEDU sancionó a la institución 2020 — verificar DNI 09542627 en SUNEDU",
        "Candidatura AÚN NO inscrita en JNE a mayo 2026",
        "Ex-militante A.N.T.A.U.R.O. (Antauro Humala) — carga ideológica incompatible con base conservadora de Surco",
      ],
    },
  },

  // ─── TERRENO ECD ──────────────────────────────────────────────────────────

  // Nota: los slides activos leen `territorio_ecd` (schema legacy). Se pobla
  // en paralelo con `terreno` para que funcione con la capa que corresponda.

  territorio_ecd: {
    e1_capital_economico: {
      pbi_per_capita:       null,
      nivel_pobreza_pct:    0,
      principales_sectores: ["Comercio", "Centro empresarial"],
      notas: "Rango per cápita por sobre S/863.71 (umbral pobreza INEI). Surco entre los distritos de mayor poder adquisitivo de Lima.",
    },
    e2_capital_social: {
      organizaciones_clave:  null,
      lideres_territoriales: [
        { nombre: "Carlos Bruce", influencia: "alta", afinidad: "adverso" },
      ],
      notas: null,
    },
    e3_capital_cultural: {
      identidades_dominantes: ["Mestizos/blancos", "Clase media-alta"],
      fiestas_costumbres:     null,
      lenguas:                ["Castellano"],
      notas: "100% urbano. Lengua única castellano. Sin grupos indígenas significativos.",
    },
    e4_campo_politico: {
      partidos_fuertes: [
        { nombre: "Somos Perú", pct_aprox: null, trend: "bajando" },
      ],
      voto_historico_tendencia: "Conservador de derecha",
      nivel_polarizacion:       null,
      notas: "Sin datos de % de partidos por encuesta. Somos Perú en declive.",
    },
    e5_infraestructura: {
      conectividad:        "buena",
      zonas_geograficas:   null,
      dificultades_acceso: null,
      notas: "Distrito urbano 100%, 44.72 km². Conectividad óptima.",
    },
    c1_identificacion: {
      porcentaje_identificados: null,
      partido_dominante:        "Somos Perú",
      notas: "Identificación política conservadora de derecha. Sin % actualizados.",
    },
    c2_segmentos: null,
    c3_issues: { top_issues: null, notas: "Issues C4 no completados en el formulario de intake." },
    c4_evaluacion: { aprobacion_candidato: null, nota_gestion_anterior: null, comentarios: null },
    c5_intencion_voto: {
      candidato_puntero:       "Roberto Gómez Baca",
      pct_nuestro_candidato:   null,
      pct_indecisos:           null,
      fecha_medicion:          null,
      fuente:                  "Sin encuestas disponibles a mayo 2026",
    },
    d3_oferta: {
      candidatos: [
        { nombre: "Juan Palma Aurazo",     partido: null, nivel_amenaza: "alto",  fortalezas: null, debilidades: null, notas: "Nivel amenaza: ALTO" },
        { nombre: "Roberto Gómez Baca",    partido: null, nivel_amenaza: "alto",  fortalezas: null, debilidades: null, notas: "Alcalde saliente — nivel amenaza: ALTO" },
        { nombre: "Oswaldo Moreno Rivera", partido: null, nivel_amenaza: "medio", fortalezas: null, debilidades: null, notas: "Nivel amenaza: MEDIO" },
      ],
    },
    d5_matrix: null,
    nucleo_goberna: {
      propuesta_central:    null,
      diferenciador_clave:  null,
      segmentos_prioritarios: null,
      notas: "Propuesta central pendiente definir por equipo de campaña.",
    },
  },

  // ─── PRESENCIA DIGITAL PENTA-D ────────────────────────────────────────────

  presencia: {
    periodo_observacion: "Mayo 2026",
    candidato_propio: {
      nombre: FULL_NAME,
      e1_presencia: {
        facebook:         { puntaje: 5, notas: "5.800 seguidores. Plataforma más activa." },
        instagram:        { puntaje: 4, notas: "1.014 seguidores, 456 posts." },
        tiktok:           { puntaje: 3, notas: "800 seguidores. Videos básicos." },
        twitter:          { puntaje: 3, notas: "769 seguidores, cuenta desde 2009, 20.4K tweets históricos." },
        youtube:          { puntaje: 1, notas: "Sin canal verificado." },
        whatsapp:         { puntaje: 4, notas: "Número público 998307279. Contacto directo disponible." },
        web:              { puntaje: 1, notas: "jorgevaldez.com no funcional (dominio caído)." },
        linkedin:         { puntaje: null, notas: "Requiere login, no verificado." },
        imagen_coherente: { puntaje: 7, notas: "Bio idéntica en FB/IG/X/TikTok. Consistencia total." },
        puntaje_eje:      3.5,
      },
      e2_desempenio: {
        crecimiento_seguidores: { puntaje: 2, notas: "Sin datos históricos. Audiencia aparentemente estancada." },
        engagement_rate:        { puntaje: 2, notas: "FB: 0.4% (22 reac/5.800). TikTok: 501 vistas avg." },
        frecuencia_publicacion: { puntaje: 4, notas: "Publica con regularidad. 456 posts IG, TikTok activo." },
        diversidad_formatos:    { puntaje: 4, notas: "Fotos + reels + videos. Sin podcasts ni lives." },
        calidad_audiovisual:    { puntaje: 2, notas: "Producción básica/amateur. Sin producción profesional." },
        alcance_estimado:       { puntaje: 2, notas: "~8.400 seguidores totales. Insuficiente para alcaldía." },
        viralidad:              { puntaje: 1, notas: "Sin virales. Máximo TikTok: 1.507 vistas." },
        puntaje_eje:            2.4,
      },
      e3_inversion: {
        anuncios_meta:          { puntaje: 1, notas: "0 anuncios activos. Verificado en Meta Ads Library." },
        gasto_estimado_meta:    { puntaje: 1, notas: "S/ 0 — Sin pauta activa." },
        anuncios_tiktok:        { puntaje: 1, notas: "Sin evidencia de pauta." },
        anuncios_google:        { puntaje: 1, notas: "Sin evidencia de pauta." },
        calidad_creativa:       { puntaje: null, notas: "N/A — sin pauta activa." },
        microinfluencers:       { puntaje: 1, notas: "Sin colaboraciones identificadas." },
        podcasts_entrevistas:   { puntaje: 1, notas: "Sin entrevistas recientes encontradas." },
        puntaje_eje:            1.0,
      },
      e4_reputacion: {
        sentimiento_comentarios: { puntaje: 5, notas: "Neutral-positivo. Sin haters masivos." },
        share_of_voice:          { puntaje: 2, notas: "Muy bajo vs candidatos con más recursos." },
        menciones_espontaneas:   { puntaje: 2, notas: "Baja visibilidad orgánica." },
        hate_trolling:           { puntaje: 7, notas: "Bajo hate (favorable por audiencia pequeña)." },
        crisis_manejo:           { puntaje: 5, notas: "Sin crisis digitales recientes observadas." },
        presencia_medios:        { puntaje: 4, notas: "Wikipedia + notas 2005/2014. Verificable, no prominente." },
        reputacion_busqueda:     { puntaje: 5, notas: "Google: perfil coherente. Noticias negativas antiguas indexadas." },
        fake_news:               { puntaje: 6, notas: "Sin campaña de desinformación activa identificada." },
        puntaje_eje:             4.5,
      },
      e5_operativa: {
        equipo_digital:         { puntaje: 1, notas: "Sin evidencia de equipo. Gestión aparentemente personal." },
        tiempo_respuesta:       { puntaje: 3, notas: "No medido. Estimado por frecuencia de publicación." },
        consistencia_historica: { puntaje: 4, notas: "X desde 2009. 456 posts IG. Presencia sostenida." },
        produccion_audiovisual: { puntaje: 2, notas: "Videos TikTok y reels básicos. Sin producción profesional." },
        uso_whatsapp_business:  { puntaje: 3, notas: "Número público. No verificado si es WA Business." },
        sistematizacion_bd:     { puntaje: 1, notas: "Sin evidencia de herramientas de gestión." },
        respuesta_crisis:       { puntaje: 2, notas: "Sin protocolo digital identificado." },
        puntaje_eje:            2.3,
      },
      puntaje_penta_d: 3.0,
    },
    competidor_1: {
      nombre:          "Juan Palma Aurazo",
      puntaje_penta_d: null,
    },
    competidor_2: {
      nombre:          "Roberto Gómez Baca",
      puntaje_penta_d: null,
    },
    brecha: "estrategica",
  },

  // ─── FASE 1 RÁPIDA ────────────────────────────────────────────────────────

  fase1_rapida: {
    modo: "completa",
    candidato: {
      nombre_completo:   FULL_NAME,
      fecha_nacimiento:  "1971-07-14",
      sexo:              "M",
      documento_tipo:    "DNI",
      documento_numero:  DNI,
      ocupacion_actual:  "Abogado independiente",
      bio_corta:
        "Abogado (CAL) y Sociólogo (UNMSM). Ex-Regidor Provincial Lima ×2 y " +
        "ex-Regidor Distrital Surco. Activista ecologista. Postula Alcalde de Santiago de Surco 2026.",
      foto_url: null,
      tipo:     "candidato-propio",
    },
    postulacion: {
      cargo_codigo:        "alcalde_distrital",
      nombre_organizacion: null,
      nombre_territorio:   "Santiago de Surco",
      nivel_territorio:    "distrital",
      fecha_eleccion:      "2026-10-04",
    },
    estrategia: {
      tipo_campana:        null,
      frente_principal:    null,
      frentes_secundarios: null,
    },
    diagnostico_inicial: {
      fortalezas: [
        "Tres mandatos como regidor — experiencia institucional verificable",
        "Doble formación: Derecho (CAL) + Sociología (UNMSM)",
        "Residente distrital — conoce el territorio",
        "Resistencia física alta (ciclista habitual) — aguanta campaña intensa",
        "Perfil autónomo no corporativo (abogado independiente)",
        "Activismo ecologista y animalista — diferenciador en distrito urbano",
      ],
      debilidades: [
        "Sin partido vigente — debe afiliar antes del 16/06/2026",
        "7 afiliaciones en 26 años — imagen de político oportunista",
        "Presencia digital DÉBIL (PentaD 3.0/10): sin equipo, sin pauta, bajo engagement",
        "Título UIGV bajo riesgo SUNEDU",
        "Investigación lavado activos 2014 archivada — resucitable en campaña",
        "Candidatura no inscrita JNE a mayo 2026",
      ],
      oportunidades: [
        "Somos Perú en declive — mercado conservador sin candidato natural",
        "Alcalde saliente (Roberto Gómez Baca) con potencial desgaste — fue co-investigado en el mismo caso 2014",
        "Ecosistema urbano y educado — receptivo a propuestas racionales de gestión",
        "Perfil ecologista/ciclista — resonancia con sectores jóvenes y de clase media-alta",
        "Experiencia como regidor provincial — credenciales metropolitanas fuertes",
      ],
      amenazas: [
        "Tres competidores con amenaza ALTA/MEDIA sin datos de intención de voto",
        "Ex-militancia A.N.T.A.U.R.O. — ataque directo en campaña",
        "Carlos Bruce como actor adverso de alta influencia territorial",
        "Sin estructura de partido de respaldo (logística, financiamiento)",
        "Ventana de inscripción JNE muy próxima (16/06/2026)",
      ],
      principales_competidores: [
        { nombre: "Juan Palma Aurazo",     partido: null, nivel_amenaza: "alto",  notas: "Perfil no detallado en intake" },
        { nombre: "Roberto Gómez Baca",    partido: null, nivel_amenaza: "alto",  notas: "Alcalde saliente — ventaja incumbente. Co-investigado caso 2014 con Valdez" },
        { nombre: "Oswaldo Moreno Rivera", partido: null, nivel_amenaza: "medio", notas: null },
      ],
    },
    propuestas: null,
    branding: {
      slogan:           null,
      color_primario:   "#1e3a8a",
      color_secundario: "#fbbf24",
      logo_url:         null,
    },
    contexto_territorio: {
      poblacion_aproximada:  426_758,
      principales_problemas: null,
      zonas_fuertes:         null,
      zonas_debiles:         null,
      notas_adicionales:
        "100% urbano. Área 44.72 km². Etnias: mestizos/blancos. Lengua: castellano. " +
        "Padrón 353.867. Votos válidos est. 50.000. Meta 177.000 votos para ganar.",
    },
  },
} as const;

// ─── Enriquecimiento desde onboarding-fase1 DB ───────────────────────────────
// Lée padrón real (ONPE), PIM real (SIAF), área/GeoJSON real (PostGIS) para
// Santiago de Surco y devuelve un partial de consultor_form listo para merge.

async function fetchSurcoGeoEnrichment(): Promise<Record<string, unknown> | null> {
  if (!isOnboardingEnabled()) {
    console.log("  ⚠  ONBOARDING_DATABASE_URL no configurado — se usan datos del Excel.");
    return null;
  }

  console.log("  ▶  Consultando onboarding DB para datos reales de Santiago de Surco...");

  const [dist, padron, presupuesto, ranking] = await Promise.all([
    getDistrito(ID_DISTRITO, 0),
    getUltimoPadron(ID_DISTRITO),
    getPresupuesto(ID_DISTRITO, 2026),
    getRankingPimDistrito(ID_DISTRITO, 2026),
  ]);

  if (!dist) {
    console.log("  ⚠  Distrito 150140 no encontrado en onboarding DB. Continuando con Excel.");
    return null;
  }

  console.log(`  ✓  Geo real: ${dist.distrito} · pop ${dist.poblacion_total_2025?.toLocaleString("es-PE")} · area ${dist.area_km2} km²`);
  if (padron)     console.log(`  ✓  Padrón real: ${padron.poblacion_electoral?.toLocaleString("es-PE")} electores (${padron.eleccion_nombre})`);
  if (presupuesto) console.log(`  ✓  Presupuesto real: PIM S/ ${Number(presupuesto.pim ?? 0).toLocaleString("es-PE")}`);
  if (ranking)    console.log(`  ✓  Ranking PIM: #${ranking.posicion} de ${ranking.total}`);

  const pimNum = presupuesto?.pim ? Number(presupuesto.pim) : null;
  const padronNum = padron?.poblacion_electoral ?? null;

  return {
    // Actualiza padrón con dato real ONPE
    votos_para_ganar: {
      padron_actual:           padronNum ?? 353_867,
      votos_validos_estimados:  50_000,
      votos_meta:              177_000,
      fuente: padron
        ? `ONPE — ${padron.eleccion_nombre} · padrón electoral verificado`
        : "Estimado consultor — ONPE/JNE 2026",
    },

    // Enriquece territorio con datos reales
    fase1_rapida: {
      ...CONSULTOR_FORM.fase1_rapida,
      contexto_territorio: {
        poblacion_aproximada:  dist.poblacion_total_2025,
        principales_problemas: null,
        zonas_fuertes:         null,
        zonas_debiles:         null,
        notas_adicionales:
          `100% urbano. Área real: ${dist.area_km2} km² (PostGIS). ` +
          `Población 2025: ${dist.poblacion_total_2025?.toLocaleString("es-PE")}. ` +
          (padron ? `Padrón real: ${padron.poblacion_electoral?.toLocaleString("es-PE")} electores (${padron.eleccion_nombre}). ` : "") +
          (pimNum ? `PIM 2026: S/ ${pimNum.toLocaleString("es-PE")}. ` : "") +
          (ranking ? `Ranking PIM: #${ranking.posicion} de ${ranking.total} distritos.` : ""),
      },
    },

    // Enriquece el terreno ECD con datos reales
    territorio_ecd: {
      ...CONSULTOR_FORM.territorio_ecd,
      d1_universo: {
        padron_total:             padronNum ?? 353_867,
        padron_habilitado:        padronNum,
        votos_validos_estimados:   50_000,
        voto_blanco_nulo_pct:     null,
        abstencion_historica_pct: null,
        votos_necesarios:         177_000,
        fuente: padron
          ? `ONPE — ${padron.eleccion_nombre}`
          : "Estimado consultor — ONPE/JNE",
      },
      // Agrega presupuesto como dato adicional en e1_capital_economico
      e1_capital_economico: {
        pbi_per_capita:       null,
        nivel_pobreza_pct:    0,
        principales_sectores: ["Comercio", "Centro empresarial"],
        notas: [
          "Rango per cápita por sobre S/863.71 (umbral pobreza INEI).",
          pimNum ? `PIM Municipal 2026: S/ ${pimNum.toLocaleString("es-PE")}` : null,
          ranking ? `Ranking PIM: #${ranking.posicion} de ${ranking.total} distritos a nivel nacional` : null,
          presupuesto?.nombre_entidad ? `Entidad: ${presupuesto.nombre_entidad}` : null,
        ].filter(Boolean).join(". "),
      },
      e3_capital_cultural: {
        identidades_dominantes: ["Mestizos/blancos", "Clase media-alta"],
        fiestas_costumbres:     null,
        lenguas:                ["Castellano"],
        notas: `100% urbano. Área: ${dist.area_km2} km². Densidad: ${Math.round(dist.poblacion_total_2025 / dist.area_km2)} hab/km².`,
      },
    },

    // Análisis enriquecido con datos reales
    analisis_electoral: {
      ...CONSULTOR_FORM.analisis_electoral,
      comentario_consultor:
        `Santiago de Surco: distrito urbano 100%, ${dist.area_km2} km², ${dist.poblacion_total_2025?.toLocaleString("es-PE")} hab. ` +
        (padron ? `Padrón real: ${padron.poblacion_electoral?.toLocaleString("es-PE")} electores (${padron.eleccion_nombre}). ` : "") +
        (pimNum ? `PIM Municipal 2026: S/ ${pimNum.toLocaleString("es-PE")} ` : "") +
        (ranking ? `(#${ranking.posicion} de ${ranking.total} distritos). ` : ". ") +
        "Conservador de derecha. Somos Perú en declive. " +
        "Tres competidores con amenaza alta/media. Sin partido vigente mayo 2026.",
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  Provisioning: Jorge Valdez — Alcalde Distrital · Santiago de Surco  ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  // ── 1. Idempotencia: verificar si ya existe ──────────────────────────────
  const existing = await findByNexusTenantId(NEXUS_TENANT_ID);
  let campaignId: string;
  let candidatoId: number;
  let userId: string | null;

  if (existing) {
    console.log(`  ♻  Candidato ya existe (idempotente):`);
    console.log(`     campaign_id:   ${existing.campaign_id}`);
    console.log(`     candidato_id:  ${existing.candidato_id}`);
    console.log(`     user_id:       ${existing.user_id}`);
    console.log(`     slug:          ${existing.slug}`);
    campaignId  = existing.campaign_id;
    candidatoId = existing.candidato_id;
    userId      = existing.user_id;
  } else {
    // ── 2. Crear candidato + campaña + user ────────────────────────────────
    console.log("  ▶  Creando candidato...");
    const result = await provisionFromOnboarding({
      nexus_tenant_id:  NEXUS_TENANT_ID,
      full_name:        FULL_NAME,
      email:            EMAIL,
      slug:             SLUG,
      pais_codigo:      "PE",
      documento_tipo:   "DNI",
      documento_numero: DNI,
      fecha_nacimiento: "1971-07-14",
      sexo:             "M",
      cargo_codigo:     "alcalde_distrital",
      id_departamento:  ID_DEPARTAMENTO,
      id_provincia:     ID_PROVINCIA,
      id_distrito:      ID_DISTRITO,
      rol_campana_codigo: "candidato",
      organizacion_politica_codigo: undefined,   // Sin partido activo
      primary_color:    "#1e3a8a",
      slogan:           undefined,
      campaignStrategy: undefined,
    });
    console.log(`  ✓  Candidato creado:`);
    console.log(`     campaign_id:   ${result.campaign_id}`);
    console.log(`     candidato_id:  ${result.candidato_id}`);
    console.log(`     user_id:       ${result.user_id}`);
    console.log(`     slug:          ${result.slug}`);
    campaignId  = result.campaign_id;
    candidatoId = result.candidato_id;
    userId      = result.user_id;
  }

  // ── 3. Obtener o crear el deck Fase 2 ─────────────────────────────────────
  console.log("\n  ▶  Asegurando deck Fase 2...");

  // uploaded_by_user_id: usar el userId del candidato, o un admin si es null
  let uploadedBy = userId;
  if (!uploadedBy) {
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
    );
    uploadedBy = rows[0]?.id ?? null;
  }

  if (!uploadedBy) {
    console.error("  ✗  No se encontró ningún usuario admin. Ejecutar seed-dev.ts primero.");
    process.exit(1);
  }

  const deck = await ensureFase2Deck({
    candidato_id:         candidatoId,
    campaign_id:          campaignId,
    uploaded_by_user_id:  uploadedBy,
    candidato_full_name:  FULL_NAME,
  });

  console.log(`  ✓  Deck Fase 2:`);
  console.log(`     deck_id:  ${deck.id}`);
  console.log(`     status:   ${deck.status}`);

  // ── 4. Poblar consultor_form con datos del Excel ──────────────────────────
  console.log("\n  ▶  Poblando consultor_form con datos del Excel...");
  await mergeConsultorForm(deck.id, CONSULTOR_FORM as unknown as Record<string, unknown>);
  console.log("  ✓  Datos Excel cargados.");

  // ── 5. Enriquecer con datos reales del onboarding DB ──────────────────────
  const geoEnrichment = await fetchSurcoGeoEnrichment();
  if (geoEnrichment) {
    console.log("  ▶  Aplicando enriquecimiento desde onboarding DB...");
    await mergeConsultorForm(deck.id, geoEnrichment);
    console.log("  ✓  Datos reales (padrón/PIM/ranking/área) aplicados.");
  }

  // ── 6. Resumen ─────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  LISTO — Jorge Valdez provisionado                                   ║");
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log(`║  URL candidato:  /c/jorge-valdez`);
  console.log(`║  URL deck F2:    /onboarding/jorge-valdez/fase-2`);
  console.log(`║  campaign_id:    ${campaignId}`);
  console.log(`║  candidato_id:   ${candidatoId}`);
  console.log(`║  deck_id:        ${deck.id}`);
  console.log("╠══════════════════════════════════════════════════════════════════════╣");
  console.log("║  DATOS CARGADOS DEL EXCEL:                                           ║");
  console.log("║  ✓ Perfil 5N completo (N1-N5 + semáforos + hallazgos críticos)       ║");
  console.log("║  ✓ Terreno ECD (E1-E5, C1, E4 campo político, D1 universo, D3 comp.) ║");
  console.log("║  ✓ Presencia PentaD 3.0/10 con detalle por eje                       ║");
  console.log("║  ✓ Competidores (Palma, Gómez Baca, Moreno Rivera)                   ║");
  console.log("║  ✓ Debilidades + fuentes (6 riesgos en lista libre)                  ║");
  console.log("║  ✓ Historial laboral + afiliaciones (9 partidos)                     ║");
  console.log("║  ✓ Votos necesarios + padrón para GapBar                             ║");
  console.log("║  ✗ C4 issues — vacío en Excel (completar después)                    ║");
  console.log("║  ✗ C2 segmentos psicográficos — vacío en Excel                       ║");
  console.log("║  ✗ D5 matriz de decisión — vacía en Excel                            ║");
  console.log("║  ✗ C5 intención de voto % — sin encuestas disponibles                ║");
  console.log("║  ✗ Propuesta central — pendiente definir por equipo                  ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  await pool.end();
}

main().catch((err) => {
  console.error("\n  ✗ Provisioning falló:", err);
  process.exit(1);
});
