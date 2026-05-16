import { z } from "zod";

// El wizard SetupFlow envía datos crudos: fullName combinado, partido como
// texto, cargo como código, geo como strings. nexus-control reenvía esto
// (más sus IDs internos de tenant/candidato) a este endpoint.

export const provisionedSchema = z.object({
  // ── Idempotency ─────────────────────────────────────────────────
  // UNIQUE en candidatos.postulacion → retry safe.
  nexus_tenant_id: z.string().trim().min(1).max(100),
  nexus_candidato_id: z.string().trim().min(1).max(100).optional(),

  // ── Identidad del candidato (PII) ──────────────────────────────
  // El wizard manda fullName combinado. Lo guardamos completo en nombres
  // y dejamos apellidos null (el candidato lo separa post-login).
  full_name: z.string().trim().min(2).max(400),
  // pais_codigo iso2; default PE si no viene
  pais_codigo: z.string().trim().length(2).toUpperCase().default("PE"),
  documento_tipo: z.enum(["DNI", "CE", "PASAPORTE"]).default("DNI"),
  documento_numero: z.string().trim().max(50).optional(),
  fecha_nacimiento: z.string().date().optional(),
  sexo: z.enum(["M", "F", "X"]).optional(),
  // E.164 con o sin '+'. Normalizado a sin-'+' para alinear con
  // campaigns.config.whatsapp_number convention (9-15 dígitos).
  telefono_e164: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/, "telefono_e164 debe ser 8-15 dígitos con o sin '+'")
    .optional(),
  // Required: el endpoint crea un users row + user_campaigns y necesita email
  // como natural key. nexus aprovisiona un mailbox Mailu por tenant antes de
  // invocar este endpoint, así que siempre hay email.
  email: z.string().email().max(200),
  // Foto del candidato (data URL base64 o http URL). Cap a 750KB. Renderiza
  // en el deck de Fase 2 — ver wizardInputSchema más abajo.
  foto_url: z.string().max(750_000).optional(),

  // ── Postulación (códigos resueltos a IDs server-side) ──────────
  rol_campana_codigo: z.enum(["candidato", "estratega"]).default("candidato"),
  cargo_codigo: z.string().trim().min(1).max(100),
  organizacion_politica_codigo: z.string().trim().max(100).optional(),
  // Geo: integers ya resueltos por quien llama (nexus). Sin FK aún (geografia_politica
  // viene en otro PR). El endpoint sí valida que cuadren con cargo.ambito_geografico.
  id_departamento: z.number().int().positive().optional(),
  id_provincia: z.number().int().positive().optional(),
  id_distrito: z.number().int().positive().optional(),

  // ── Campaign (denormalized + config) ───────────────────────────
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug debe ser lowercase alphanumeric con guiones"),
  partido_text: z.string().trim().max(200).optional(), // legacy campaigns.partido
  numero: z.number().int().positive().optional(), // ballot number, opcional
  slogan: z.string().trim().max(140).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "primary_color debe ser hex #rrggbb")
    .optional(),

  // ── Datos del provisioning de nexus (van a campaigns.config) ───
  domain: z.string().trim().max(200).optional(),
  site_url: z.string().url().max(500).optional(),
  mailbox_email: z.string().email().max(200).optional(),
  billing_email: z.string().email().max(200).optional(),

  // ── Estrategia de campaña del wizard (auto-seed del consultor_form) ──
  // Nexus puede enviar la estrategia elegida por el candidato en el wizard
  // para pre-poblar formula_electoral en el deck Fase 2.
  campaignStrategy: z.enum(["RACIONAL", "EMOTIVA", "INSTINTIVA", "TRES_FRENTES"]).optional(),
});

export type ProvisionedInput = z.infer<typeof provisionedSchema>;

// ── Wizard público ─────────────────────────────────────────────────────
// Body que envía el wizard /onboarding del frontend principal (apps/web).
// No requiere service-token ni nexus_tenant_id: el endpoint genera ambos
// internamente. Sin DNS, hosting, mailbox — solo crea la cuenta del
// candidato + campaign mínima para que entre al dashboard.

export const wizardInputSchema = z.object({
  // Identidad
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  country: z.string().trim().length(2).toUpperCase().default("PE"),
  documento_numero: z.string().trim().max(50).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/, "phone debe ser 8-15 dígitos con o sin '+'")
    .optional(),

  // Rol + cargo
  rol_campana_codigo: z.enum(["candidato", "estratega"]).default("candidato"),
  cargo_codigo: z.string().trim().min(1).max(100),
  organizacion_politica_codigo: z.string().trim().max(100).optional(),

  // Jurisdicción (cascada — opcional según ámbito del cargo)
  id_departamento: z.number().int().positive().optional(),
  id_provincia: z.number().int().positive().optional(),
  id_distrito: z.number().int().positive().optional(),

  // Contraseña que el candidato elige al final del wizard. Opcional —
  // si no viene, la cuenta queda solo con OTP/magic-link.
  password: z.string().min(8).max(200).optional(),

  // Foto del candidato — data URL (base64) o URL externa. Cap a 750KB para
  // que el payload del wizard no se vuelva pesado. Se guarda en
  // candidatos.candidato.foto_url y la consume el deck de Fase 2.
  foto_url: z.string().max(750_000).optional(),
});

export type WizardInput = z.infer<typeof wizardInputSchema>;

// ── Nuevos schemas sistema ECD + 5N + PentaD ────────────────────────────────

const semaforoZ = z.enum(["verde", "amarillo", "rojo"]);
const indicadorZ = z.object({ puntaje: z.number().min(1).max(10).optional(), notas: z.string().optional() });

export const TerrenoECDSchema = z.object({
  e1_demografia: z.object({
    poblacion_total: z.number().optional(), distribucion_urbano_rural: z.string().optional(),
    grupos_etarios: z.string().optional(), etnias_presentes: z.array(z.string()).optional(),
    extension_km2: z.number().optional(), notas: z.string().optional(),
  }).optional(),
  e2_capital_economico: z.object({
    pbi_per_capita: z.number().optional(), nivel_pobreza_pct: z.number().optional(),
    principales_sectores: z.array(z.string()).optional(), empleo_formal_pct: z.number().optional(),
    notas: z.string().optional(),
  }).optional(),
  e3_capital_cultural_social: z.object({
    organizaciones_clave: z.array(z.string()).optional(),
    lideres_territoriales: z.array(z.object({
      nombre: z.string(), influencia: z.enum(["alta","media","baja"]),
      afinidad: z.enum(["favorable","neutro","adverso"]),
    })).optional(),
    identidades_dominantes: z.array(z.string()).optional(),
    fiestas_costumbres: z.array(z.string()).optional(),
    lenguas: z.array(z.string()).optional(), notas: z.string().optional(),
  }).optional(),
  e4_campo_politico: z.object({
    figuras_publicas: z.array(z.object({
      nombre: z.string(), cargo: z.string().optional(), tendencia: z.string().optional(),
      influencia: z.enum(["alta","media","baja"]).optional(),
    })).optional(),
    partidos_fuertes: z.array(z.object({
      nombre: z.string(), pct_aprox: z.number().optional(),
      trend: z.enum(["subiendo","estable","bajando"]).optional(),
    })).optional(),
    voto_historico_tendencia: z.string().optional(),
    nivel_polarizacion: z.enum(["bajo","medio","alto"]).optional(), notas: z.string().optional(),
  }).optional(),
  e5_cleavages: z.object({
    fracturas_vigentes: z.array(z.object({
      nombre: z.string(), descripcion: z.string().optional(),
      intensidad: z.enum(["alta","media","baja"]).optional(),
    })).optional(), notas: z.string().optional(),
  }).optional(),
  c1_identidades: z.object({
    descripcion: z.string().optional(), partido_dominante: z.string().optional(),
    porcentaje_identificados: z.number().optional(),
    percepciones_clave: z.array(z.string()).optional(), notas: z.string().optional(),
  }).optional(),
  c2_psicografia: z.array(z.object({
    id: z.string(), nombre: z.string(), pct_aprox: z.number().optional(),
    valores: z.array(z.string()).optional(), aspiraciones: z.array(z.string()).optional(),
    temores: z.array(z.string()).optional(), problema_principal: z.string().optional(),
    medio_info_preferido: z.string().optional(),
  })).optional(),
  c3_memoria_politica: z.object({
    hitos_electorales: z.array(z.object({
      anio: z.number(), hecho: z.string(), impacto: z.string().optional(),
    })).optional(),
    partidos_desprestigiados: z.array(z.string()).optional(),
    figuras_positivas: z.array(z.string()).optional(),
    figuras_negativas: z.array(z.string()).optional(), notas: z.string().optional(),
  }).optional(),
  c4_issues: z.array(z.object({
    issue: z.string(), pct_menciona: z.number().optional(), prioridad: z.number().optional(),
  })).optional(),
  c5_medios: z.object({
    periodistas_clave: z.array(z.object({
      nombre: z.string(), medio: z.string().optional(),
      tendencia: z.enum(["favorable","neutro","adverso"]).optional(),
    })).optional(),
    medios_relevantes: z.array(z.object({
      nombre: z.string(), tipo: z.string().optional(), alcance: z.string().optional(),
    })).optional(),
    encuestas_disponibles: z.array(z.object({
      fuente: z.string(), fecha: z.string().optional(),
      link: z.string().optional(), notas: z.string().optional(),
    })).optional(), notas: z.string().optional(),
  }).optional(),
  d1_universo: z.object({
    padron_total: z.number().optional(), padron_habilitado: z.number().optional(),
    votos_validos_estimados: z.number().optional(), voto_blanco_nulo_pct: z.number().optional(),
    abstencion_historica_pct: z.number().optional(), votos_necesarios: z.number().optional(),
    fuente: z.string().optional(),
  }).optional(),
  d2_historial: z.object({
    elecciones: z.array(z.object({
      anio: z.number(), ganador: z.string(), partido: z.string().optional(),
      pct_ganador: z.number().optional(), segundo: z.string().optional(),
      pct_segundo: z.number().optional(), nuestro_candidato: z.string().optional(),
      nuestros_votos: z.number().optional(), notas: z.string().optional(),
    })).optional(),
  }).optional(),
  d3_oferta: z.object({
    candidatos: z.array(z.object({
      nombre: z.string(), partido: z.string().optional(),
      nivel_amenaza: z.enum(["bajo","medio","alto"]).optional(),
      fortalezas: z.array(z.string()).optional(), debilidades: z.array(z.string()).optional(),
      notas: z.string().optional(),
    })).optional(),
  }).optional(),
  d4_logica: z.object({
    tipo_decision_predominante: z.enum(["habitual","racional","emotiva","presion_social"]).optional(),
    factores_clave: z.array(z.string()).optional(),
    barreras_voto_candidato: z.array(z.string()).optional(),
    catalizadores: z.array(z.string()).optional(), notas: z.string().optional(),
  }).optional(),
  d5_matriz: z.object({
    matriz: z.array(z.object({
      segmento_id: z.string(), candidato_preferido: z.string().optional(),
      razon_preferencia: z.string().optional(), voto_util: z.boolean().optional(),
      prob_cambio: z.enum(["alta","media","baja"]).optional(),
      mensaje_clave: z.string().optional(), canal_efectivo: z.string().optional(),
      portavoz_sugerido: z.string().optional(),
    })).optional(),
  }).optional(),
  sintesis: z.object({
    exC: z.string().optional(), cxD: z.string().optional(),
    exD: z.string().optional(), triple: z.string().optional(),
    segmentos_prioritarios: z.array(z.string()).optional(),
    mensaje_diferenciado: z.record(z.string(), z.string()).optional(),
    estrategia_territorial: z.string().optional(),
    alianzas: z.array(z.string()).optional(), riesgos: z.array(z.string()).optional(),
    indicadores: z.array(z.string()).optional(),
    lineas_gestion_post: z.array(z.string()).optional(),
  }).optional(),
}).nullable().optional();

export const PerfilCandidato5NSchema = z.object({
  n1_identidad: z.object({
    nombres_completos: z.string().optional(), fecha_nacimiento: z.string().optional(),
    edad: z.number().optional(), profesion_declarada: z.string().optional(),
    foto_actual_url: z.string().optional(), fotos_historicas_urls: z.array(z.string()).optional(),
    dni: z.string().optional(), lugar_nacimiento: z.string().optional(),
    pais_nacimiento: z.string().optional(), nacionalidad: z.string().optional(),
    naturalizaciones: z.string().optional(),
    semaforo: semaforoZ.optional(), notas_semaforo: z.string().optional(),
  }).optional(),
  n2_trayectoria: z.object({
    estado_civil: z.string().optional(), hijos: z.number().optional(),
    residencia_actual: z.string().optional(),
    estudios: z.array(z.object({
      tipo: z.enum(["colegio","pregrado","posgrado","certificacion","otro"]),
      institucion: z.string(), titulo: z.string().optional(),
      anio: z.number().optional(), verificado: z.boolean().optional(),
      fuente_verificacion: z.string().optional(),
    })).optional(),
    historial_laboral: z.array(z.object({
      cargo: z.string(), empleador: z.string(),
      desde: z.string().optional(), hasta: z.string().optional(),
      verificado: z.boolean().optional(),
    })).optional(),
    trayectoria_politica: z.array(z.object({
      cargo: z.string(), organizacion: z.string(),
      desde: z.string().optional(), hasta: z.string().optional(),
      resultado: z.string().optional(),
    })).optional(),
    posiciones_publicas: z.array(z.object({
      fecha: z.string().optional(), descripcion: z.string(), fuente: z.string().optional(),
    })).optional(),
    semaforo: semaforoZ.optional(), notas_semaforo: z.string().optional(),
  }).optional(),
  n3_riesgo: z.object({
    antecedentes_penales: z.object({ estado: z.enum(["limpio","proceso","condena"]), descripcion: z.string().optional() }).optional(),
    antecedentes_policiales: z.object({ estado: z.enum(["limpio","proceso","condena"]), descripcion: z.string().optional() }).optional(),
    antecedentes_fiscales: z.object({ estado: z.enum(["limpio","proceso","condena"]), descripcion: z.string().optional() }).optional(),
    deudas: z.array(z.object({ tipo: z.string(), descripcion: z.string().optional(), estado: z.string().optional() })).optional(),
    violencia_familiar: z.object({ estado: z.enum(["limpio","proceso","condena"]), descripcion: z.string().optional() }).optional(),
    escandalos_mediaticos: z.array(z.object({ descripcion: z.string(), fecha: z.string().optional(), vigente: z.boolean().optional() })).optional(),
    huella_digital: z.object({ descripcion: z.string().optional(), riesgo: z.enum(["bajo","medio","alto"]).optional() }).optional(),
    vulnerabilidades: z.string().optional(),
    semaforo: semaforoZ.optional(), notas_semaforo: z.string().optional(),
  }).optional(),
  n4_patrimonio: z.object({
    ingresos_declarados: z.number().optional(),
    empresas: z.array(z.object({ nombre: z.string(), rol: z.string().optional(), ruc: z.string().optional() })).optional(),
    inmuebles: z.array(z.object({ descripcion: z.string(), valor_aprox: z.number().optional() })).optional(),
    vehiculos: z.array(z.object({ descripcion: z.string() })).optional(),
    record_migratorio: z.object({ paises_visitados: z.array(z.string()).optional(), residencias_exterior: z.string().optional() }).optional(),
    origen_fondos: z.object({ descripcion: z.string().optional(), coherente: z.boolean().optional() }).optional(),
    offshore: z.object({ existencia: z.boolean(), descripcion: z.string().optional() }).optional(),
    conflictos_interes: z.string().optional(),
    semaforo: semaforoZ.optional(), notas_semaforo: z.string().optional(),
  }).optional(),
  n5_salud: z.object({
    antecedentes_medicos: z.string().optional(), salud_mental: z.string().optional(),
    capacidad_cognitiva: z.string().optional(), adicciones: z.string().optional(),
    discapacidades: z.string().optional(), resistencia_fisica: z.string().optional(),
    habitos: z.string().optional(),
    semaforo: semaforoZ.optional(), notas_semaforo: z.string().optional(),
  }).optional(),
  resumen_ejecutivo: z.object({
    hallazgos_criticos: z.array(z.string()).optional(),
    semaforo_global: semaforoZ.optional(),
  }).optional(),
}).nullable().optional();

export const PresenciaPentaDSchema = z.object({
  periodo_observacion: z.string().optional(),
  candidato_propio: z.object({
    nombre: z.string().optional(),
    e1_presencia: z.object({
      facebook: indicadorZ.optional(), instagram: indicadorZ.optional(),
      tiktok: indicadorZ.optional(), twitter: indicadorZ.optional(),
      youtube: indicadorZ.optional(), whatsapp: indicadorZ.optional(),
      web: indicadorZ.optional(),
      linkedin: indicadorZ.merge(z.object({ aplica: z.boolean().optional() })).optional(),
      imagen_coherente: indicadorZ.optional(), puntaje_eje: z.number().optional(),
    }).optional(),
    e2_desempenio: z.object({
      crecimiento_seguidores: indicadorZ.optional(), engagement_rate: indicadorZ.optional(),
      frecuencia_publicacion: indicadorZ.optional(), diversidad_formatos: indicadorZ.optional(),
      calidad_audiovisual: indicadorZ.optional(), alcance_estimado: indicadorZ.optional(),
      viralidad: indicadorZ.optional(), puntaje_eje: z.number().optional(),
    }).optional(),
    e3_inversion: z.object({
      anuncios_meta: indicadorZ.optional(), gasto_estimado_meta: indicadorZ.optional(),
      anuncios_tiktok: indicadorZ.optional(), anuncios_google: indicadorZ.optional(),
      calidad_creativa: indicadorZ.optional(), microinfluencers: indicadorZ.optional(),
      podcasts_entrevistas: indicadorZ.optional(), puntaje_eje: z.number().optional(),
    }).optional(),
    e4_reputacion: z.object({
      sentimiento_comentarios: indicadorZ.optional(), share_of_voice: indicadorZ.optional(),
      menciones_espontaneas: indicadorZ.optional(), hate_trolling: indicadorZ.optional(),
      crisis_manejo: indicadorZ.optional(), presencia_medios: indicadorZ.optional(),
      reputacion_busqueda: indicadorZ.optional(), fake_news: indicadorZ.optional(),
      puntaje_eje: z.number().optional(),
    }).optional(),
    e5_operativa: z.object({
      equipo_digital: indicadorZ.optional(), tiempo_respuesta: indicadorZ.optional(),
      consistencia_historica: indicadorZ.optional(), produccion_audiovisual: indicadorZ.optional(),
      uso_whatsapp_business: indicadorZ.optional(), sistematizacion_bd: indicadorZ.optional(),
      respuesta_crisis: indicadorZ.optional(), puntaje_eje: z.number().optional(),
    }).optional(),
    puntaje_penta_d: z.number().optional(),
  }).optional(),
  competidor_1: z.object({ nombre: z.string().optional(), puntaje_penta_d: z.number().optional() }).passthrough().optional(),
  competidor_2: z.object({ nombre: z.string().optional(), puntaje_penta_d: z.number().optional() }).passthrough().optional(),
  brecha: z.enum(["estrategica","tactica","paridad"]).optional(),
}).nullable().optional();
