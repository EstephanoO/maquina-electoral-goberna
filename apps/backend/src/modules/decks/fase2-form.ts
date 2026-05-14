/**
 * Schema del consultor_form para el Fase 2 React deck.
 *
 * Cada slide define los campos editables vía MCP/UI. Los campos NO
 * editables (auto del onboarding: nombre, jurisdiccion, cargo, partido)
 * salen de candidato_snapshot directamente — no se duplican acá.
 *
 * El form es **opcional en todos los niveles**: si un campo no está,
 * el slide muestra placeholder `[A completar]` (estilo amber italic).
 *
 * Convive con el schema legacy de render.ts (intro/partido_eg/etc).
 * Ambos schemas se merge en la misma columna `decks.consultor_form`.
 */
import { z } from "zod";

// ── Sub-schemas reutilizables ───────────────────────────────────────

const redesSchema = z
  .object({
    facebook: z.string().url().optional(),
    instagram: z.string().url().optional(),
    tiktok: z.string().url().optional(),
    twitter: z.string().url().optional(),
    youtube: z.string().url().optional(),
    web_oficial: z.string().url().optional(),
  })
  .partial();

const adversarioSchema = z.object({
  nombre: z.string().min(1),
  partido: z.string().optional(),
  redes: redesSchema.optional(),
  notas: z.string().optional(),
});

const debilidadFuenteSchema = z.object({
  key: z.enum(["denuncias", "google", "reputacion_redes", "jne_observaciones"]),
  estado: z.enum(["ok", "review", "flag"]).default("review"),
  hallazgos: z.array(z.string()).optional(),
  fuente_url: z.string().url().optional(),
});

const hitoSchema = z.object({
  key: z.string(),
  titulo: z.string().min(1),
  fecha: z.string().optional(),
  descripcion: z.string().optional(),
});

// ── Schema principal ─────────────────────────────────────────────────

export const consultorFormFase2Schema = z
  .object({
    // ── Lámina 1 · Ficha básica ──
    ficha_basica: z
      .object({
        dni: z.string().optional(),
        edad: z.number().int().min(18).max(120).optional(),
        profesion: z.string().optional(),
      })
      .partial()
      .optional(),

    // ── Lámina 2 · Rol usuario ──
    rol_usuario: z
      .object({
        filler_role: z
          .enum(["consultor", "cartografo", "candidato", "admin"])
          .optional(),
      })
      .partial()
      .optional(),

    // ── Sección 3 · Análisis electoral ──
    analisis_electoral: z
      .object({
        comentario_consultor: z.string().optional(),
        ranking_partido_zona: z.number().int().min(1).optional(),
      })
      .partial()
      .optional(),

    // ── Sección 3 · Votos para ganar ──
    votos_para_ganar: z
      .object({
        votos_ganador_anterior: z.number().int().min(0).optional(),
        padron_actual: z.number().int().min(0).optional(),
        votos_meta: z.number().int().min(0).optional(),
        fuente: z.string().optional(),
      })
      .partial()
      .optional(),

    // ── Sección 4 · Partidos importantes ──
    partidos: z
      .object({
        observaciones: z.string().optional(),
        top_partidos: z
          .array(
            z.object({
              codigo: z.string(),
              nombre: z.string(),
              porcentaje: z.number().min(0).max(100).optional(),
              comentario: z.string().optional(),
            }),
          )
          .optional(),
      })
      .partial()
      .optional(),

    // ── Sección 5 · Historial político del candidato ──
    historial: z
      .object({
        entries: z
          .array(
            z.object({
              anio: z.number().int(),
              cargo: z.string(),
              jurisdiccion: z.string().optional(),
              partido: z.string().optional(),
              resultado: z.string().optional(),
              votos: z.number().int().optional(),
              porcentaje: z.number().min(0).max(100).optional(),
            }),
          )
          .optional(),
        nunca_postulo: z.boolean().optional(),
        observaciones: z.string().optional(),
      })
      .partial()
      .optional(),

    // ── Sección 6 · Fórmula electoral (aire/mar/tierra) ──
    formula_electoral: z
      .object({
        presupuesto_total: z.number().min(0).optional(),
        peso_aire: z.number().min(0).max(100).optional(),
        peso_mar: z.number().min(0).max(100).optional(),
        peso_tierra: z.number().min(0).max(100).optional(),
        justificacion: z.string().optional(),
      })
      .partial()
      .optional(),

    // ── Sección 6 · Recorrido estratégico (5 hitos) ──
    recorrido_estrategico: z
      .object({
        hitos: z.array(hitoSchema).optional(),
      })
      .partial()
      .optional(),

    // ── Sección 7 · Presencia digital (4 checks) ──
    presencia_digital: z
      .object({
        web_oficial: z.enum(["ok", "review", "flag"]).optional(),
        google_results: z.enum(["ok", "review", "flag"]).optional(),
        redes_verificadas: z.enum(["ok", "review", "flag"]).optional(),
        info_clave: z.enum(["ok", "review", "flag"]).optional(),
        notas: z.string().optional(),
      })
      .partial()
      .optional(),

    // ── Sección 7 · Redes sociales (candidato + 3 adversarios) ──
    redes_sociales: z
      .object({
        candidato: redesSchema.optional(),
        adversarios: z.array(adversarioSchema).max(5).optional(),
      })
      .partial()
      .optional(),

    // ── Sección 8 · Debilidades (4 fuentes + lista libre) ──
    debilidades: z
      .object({
        fuentes: z.array(debilidadFuenteSchema).optional(),
        lista_libre: z
          .array(
            z.object({
              titulo: z.string(),
              descripcion: z.string().optional(),
              severidad: z.enum(["baja", "media", "alta"]).default("media"),
            }),
          )
          .optional(),
      })
      .partial()
      .optional(),

    // ── Sección 9 · Quién es (bio libre) ──
    quien_es: z
      .object({
        texto_libre: z.string().optional(),
        trayectoria: z.string().optional(),
        valores: z.array(z.string()).optional(),
      })
      .partial()
      .optional(),

    // ── Bitácora del consultor (append-only por session) ──
    bitacora: z
      .array(
        z.object({
          ts: z.string(),
          session_id: z.string().optional(),
          consultor_user_id: z.string().optional(),
          accion: z.string(),
          campo: z.string().optional(),
          nota: z.string().optional(),
        }),
      )
      .optional(),

    // ── Text overrides: cualquier texto hardcoded del template ──
    text_overrides: z.record(z.string(), z.string()).optional(),

    // ── Perfil Candidato 5N ────────────────────────────────────────────
    perfil_candidato: z
      .object({
        // N1 — Identidad
        n1_identidad: z
          .object({
            nombre_completo: z.string().optional(),
            apodo: z.string().optional(),
            fecha_nacimiento: z.string().optional(),
            lugar_nacimiento: z.string().optional(),
            sexo: z.enum(["M", "F"]).optional(),
            documento_tipo: z.enum(["DNI", "CE", "PASAPORTE"]).optional(),
            documento_numero: z.string().optional(),
            bio_corta: z.string().max(500).optional(),
            foto_url: z.string().optional(),
            estado_civil: z.string().optional(),
            hijos: z.number().int().min(0).optional(),
            religion: z.string().optional(),
          })
          .partial()
          .optional(),
        // N2 — Trayectoria
        n2_trayectoria: z
          .object({
            ocupacion_actual: z.string().optional(),
            profesion: z.string().optional(),
            historial_laboral: z
              .array(
                z.object({
                  orden: z.number().int(),
                  cargo: z.string(),
                  organizacion: z.string(),
                  anio_inicio: z.number().int().optional(),
                  anio_fin: z.union([z.number().int(), z.literal("actual")]).optional(),
                  descripcion: z.string().optional(),
                }),
              )
              .optional(),
            logros_principales: z.array(z.string()).optional(),
            formacion: z
              .array(
                z.object({
                  nivel: z.string(),
                  institucion: z.string(),
                  titulo: z.string().optional(),
                  anio: z.number().int().optional(),
                }),
              )
              .optional(),
          })
          .partial()
          .optional(),
        // N3 — Riesgo legal/reputacional
        n3_riesgo: z
          .object({
            denuncias_penales: z
              .array(
                z.object({
                  descripcion: z.string(),
                  estado: z.enum(["activa", "archivada", "sentencia"]),
                  fuente: z.string().optional(),
                }),
              )
              .optional(),
            google_negativo: z.array(z.string()).optional(),
            jne_observaciones: z.array(z.string()).optional(),
            nivel_riesgo_global: z.enum(["bajo", "medio", "alto", "critico"]).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        // N4 — Patrimonio
        n4_patrimonio: z
          .object({
            declaracion_jurada_url: z.string().optional(),
            bienes_principales: z.array(z.string()).optional(),
            deudas: z.array(z.string()).optional(),
            consistencia: z.enum(["consistente", "inconsistente", "sin_datos"]).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        // N5 — Salud
        n5_salud: z
          .object({
            estado_general: z.enum(["optimo", "bueno", "regular", "preocupante"]).optional(),
            limitaciones: z.array(z.string()).optional(),
            energia_campana: z.enum(["alta", "media", "baja"]).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        // Entorno
        entorno: z
          .object({
            familia_en_campana: z.boolean().optional(),
            principales_asesores: z
              .array(
                z.object({
                  nombre: z.string(),
                  rol: z.string(),
                  confianza: z.enum(["alta", "media", "baja"]).default("media"),
                }),
              )
              .optional(),
            financiadores_clave: z.array(z.string()).optional(),
            adversarios_internos: z.array(z.string()).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        // Coherencia narrativa
        coherencia: z
          .object({
            mensaje_vida_candidatura: z.string().optional(),
            contradicciones: z.array(z.string()).optional(),
            score: z.number().int().min(1).max(10).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),

    // ── Territorio ECD ─────────────────────────────────────────────────
    territorio_ecd: z
      .object({
        // E — Estructura (Bourdieu)
        e1_capital_economico: z
          .object({
            pbi_per_capita: z.number().optional(),
            nivel_pobreza_pct: z.number().min(0).max(100).optional(),
            principales_sectores: z.array(z.string()).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        e2_capital_social: z
          .object({
            organizaciones_clave: z.array(z.string()).optional(),
            lideres_territoriales: z
              .array(
                z.object({
                  nombre: z.string(),
                  influencia: z.enum(["alta", "media", "baja"]).default("media"),
                  afinidad: z.enum(["favorable", "neutro", "adverso"]).default("neutro"),
                }),
              )
              .optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        e3_capital_cultural: z
          .object({
            identidades_dominantes: z.array(z.string()).optional(),
            fiestas_costumbres: z.array(z.string()).optional(),
            lenguas: z.array(z.string()).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        e4_campo_politico: z
          .object({
            partidos_fuertes: z
              .array(
                z.object({
                  nombre: z.string(),
                  pct_aprox: z.number().min(0).max(100).optional(),
                  trend: z.enum(["subiendo", "estable", "bajando"]).optional(),
                }),
              )
              .optional(),
            voto_historico_tendencia: z.string().optional(),
            nivel_polarizacion: z.enum(["bajo", "medio", "alto"]).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        e5_infraestructura: z
          .object({
            conectividad: z.enum(["buena", "regular", "mala"]).optional(),
            zonas_geograficas: z.array(z.string()).optional(),
            dificultades_acceso: z.array(z.string()).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),

        // C — Conciencia (Michigan)
        c1_identificacion: z
          .object({
            porcentaje_identificados: z.number().min(0).max(100).optional(),
            partido_dominante: z.string().optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        // C2 ★ — Segmentos psicográficos
        c2_segmentos: z
          .array(
            z.object({
              id: z.string(),
              nombre: z.string(),
              pct_aprox: z.number().min(0).max(100).optional(),
              valores: z.array(z.string()).optional(),
              aspiraciones: z.array(z.string()).optional(),
              temores: z.array(z.string()).optional(),
              problema_principal: z.string().optional(),
              medio_info_preferido: z.string().optional(),
            }),
          )
          .max(8)
          .optional(),
        c3_issues: z
          .object({
            top_issues: z
              .array(
                z.object({
                  issue: z.string(),
                  pct_menciona: z.number().min(0).max(100).optional(),
                  prioridad: z.number().int().min(1).optional(),
                }),
              )
              .optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        c4_evaluacion: z
          .object({
            aprobacion_candidato: z.number().min(0).max(100).optional(),
            nota_gestion_anterior: z.number().min(1).max(5).optional(),
            comentarios: z.string().optional(),
          })
          .partial()
          .optional(),
        c5_intencion_voto: z
          .object({
            candidato_puntero: z.string().optional(),
            pct_nuestro_candidato: z.number().min(0).max(100).optional(),
            pct_indecisos: z.number().min(0).max(100).optional(),
            fecha_medicion: z.string().optional(),
            fuente: z.string().optional(),
          })
          .partial()
          .optional(),
        c6_voto_util: z
          .object({
            escenario: z.string().optional(),
            riesgo_voto_util: z.enum(["bajo", "medio", "alto"]).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),

        // D — Decisión (Rational Choice)
        d1_costo_voto: z
          .object({
            distancia_urnas: z.enum(["baja", "media", "alta"]).optional(),
            obligatoriedad_percibida: z.enum(["alta", "media", "baja"]).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        d2_beneficios: z
          .object({
            promesas_mas_valoradas: z.array(z.string()).optional(),
            credibilidad_promesas: z.enum(["alta", "media", "baja"]).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        d3_riesgo: z
          .object({
            miedo_al_cambio: z.enum(["alto", "medio", "bajo"]).optional(),
            incertidumbre_candidato: z.enum(["alta", "media", "baja"]).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        d4_influencia: z
          .object({
            influencers_clave: z
              .array(
                z.object({
                  nombre: z.string(),
                  tipo: z.string(),
                  alcance: z.string().optional(),
                }),
              )
              .optional(),
            grupos_presion: z.array(z.string()).optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
        // D5 ★ — Matriz de decisión por segmento
        d5_matrix: z
          .array(
            z.object({
              segmento_id: z.string(),
              candidato_preferido: z.string().optional(),
              razon_preferencia: z.string().optional(),
              voto_util: z.boolean().optional(),
              prob_cambio: z.enum(["alta", "media", "baja"]).optional(),
              mensaje_clave: z.string().optional(),
              canal_efectivo: z.string().optional(),
              portavoz_sugerido: z.string().optional(),
            }),
          )
          .optional(),

        // Núcleo Goberna (síntesis E×C×D)
        nucleo_goberna: z
          .object({
            segmentos_prioritarios: z
              .array(
                z.object({
                  segmento_id: z.string(),
                  mensaje_central: z.string().optional(),
                  canal_principal: z.string().optional(),
                  portavoz: z.string().optional(),
                  accion_inmediata: z.string().optional(),
                }),
              )
              .max(3)
              .optional(),
            propuesta_central: z.string().optional(),
            diferenciador_clave: z.string().optional(),
            notas: z.string().optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),

    // ── Fase 1 Rápida — onboarding por candidato ──────────────────────
    // Datos que el consultor llena en /onboarding/[slug]/fase-1.
    // Se usan para generar el deck Fase 2 personalizado.
    fase1_rapida: z
      .object({
        // Modo de llenado
        modo: z.enum(["rapida", "completa"]).default("rapida").optional(),

        // Sección 1 — Candidato
        candidato: z
          .object({
            nombre_completo: z.string().optional(),
            apodo: z.string().optional(),
            fecha_nacimiento: z.string().optional(),
            sexo: z.enum(["M", "F"]).optional(),
            documento_tipo: z.enum(["DNI", "CE", "PASAPORTE"]).optional(),
            documento_numero: z.string().optional(),
            ocupacion_actual: z.string().optional(),
            bio_corta: z.string().max(300).optional(),
            foto_url: z.string().optional(),
            tipo: z.enum(["candidato-propio", "rival", "aliado"]).default("candidato-propio").optional(),
          })
          .partial()
          .optional(),

        // Sección 2 — Postulación
        postulacion: z
          .object({
            cargo_codigo: z.enum([
              "alcalde_distrital", "alcalde_provincial", "regidor",
              "consejero_regional", "gobernador_regional", "congresista", "presidente",
            ]).optional(),
            nombre_organizacion: z.string().optional(),
            nombre_territorio: z.string().optional(),
            nivel_territorio: z.enum(["distrital", "provincial", "regional", "nacional"]).optional(),
            fecha_eleccion: z.string().optional(),
          })
          .partial()
          .optional(),

        // Sección 3 — Estrategia
        estrategia: z
          .object({
            tipo_campana: z.enum(["RACIONAL", "EMOTIVA", "INSTINTIVA", "MIXTA"]).optional(),
            combinacion_mixta: z.array(z.enum(["RACIONAL", "EMOTIVA", "INSTINTIVA"])).max(2).optional(),
            eje_emocional: z.enum([
              "PLAN_DE_GOBIERNO", "EQUIPO_DE_CAMPAÑA", "SIMPATIA", "ESPERANZA", "ODIO", "MIEDO",
            ]).optional(),
            frente_principal: z.enum(["TIERRA", "MAR", "AIRE"]).optional(),
            frentes_secundarios: z.array(z.enum(["TIERRA", "MAR", "AIRE"])).max(2).optional(),
          })
          .partial()
          .optional(),

        // Sección 4 — Diagnóstico inicial (FODA + competidores)
        diagnostico_inicial: z
          .object({
            fortalezas: z.array(z.string()).optional(),
            debilidades: z.array(z.string()).optional(),
            oportunidades: z.array(z.string()).optional(),
            amenazas: z.array(z.string()).optional(),
            principales_competidores: z
              .array(
                z.object({
                  nombre: z.string(),
                  partido: z.string().optional(),
                  nivel_amenaza: z.enum(["bajo", "medio", "alto"]).default("medio"),
                  notas: z.string().optional(),
                }),
              )
              .max(5)
              .optional(),
          })
          .partial()
          .optional(),

        // Sección 5 — Propuestas
        propuestas: z
          .array(
            z.object({
              orden: z.number().int().min(1),
              titulo: z.string(),
              descripcion_corta: z.string().max(140),
              icono: z.string().optional(),
              sector: z.string().optional(),
            }),
          )
          .min(0)
          .max(6)
          .optional(),

        // Sección 6 — Branding
        branding: z
          .object({
            slogan: z.string().optional(),
            color_primario: z.string().optional(),
            color_secundario: z.string().optional(),
            logo_url: z.string().optional(),
          })
          .partial()
          .optional(),

        // Sección 7 — Contexto territorial
        contexto_territorio: z
          .object({
            poblacion_aproximada: z.number().int().min(0).optional(),
            principales_problemas: z.array(z.string()).optional(),
            zonas_fuertes: z.array(z.string()).optional(),
            zonas_debiles: z.array(z.string()).optional(),
            notas_adicionales: z.string().optional(),
          })
          .partial()
          .optional(),

        // Estado de completitud por sección
        secciones_completas: z.array(z.string()).optional(),
        publicado: z.boolean().default(false).optional(),
        publicado_at: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

export type ConsultorFormFase2 = z.infer<typeof consultorFormFase2Schema>;

/**
 * Patch schema para PATCH /form. Acepta cualquier subset del form
 * principal — el endpoint hace deep-merge contra lo existente.
 */
export const consultorFormPatchSchema = consultorFormFase2Schema;
export type ConsultorFormPatch = z.infer<typeof consultorFormPatchSchema>;
