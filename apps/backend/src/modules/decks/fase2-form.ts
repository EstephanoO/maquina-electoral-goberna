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
