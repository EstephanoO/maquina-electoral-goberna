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
    // El consultor puede sobrescribir kickers, títulos, pilares, párrafos
    // intro, etc. Cada texto tiene un key único tipo "slideId.path".
    // Si está vacío, el slide muestra el default hardcoded. Permite
    // personalizar 100% el deck por candidato sin tocar el código.
    text_overrides: z.record(z.string(), z.string()).optional(),
  })
  .partial();

export type ConsultorFormFase2 = z.infer<typeof consultorFormFase2Schema>;

/**
 * Patch schema para PATCH /form. Acepta cualquier subset del form
 * principal — el endpoint hace deep-merge contra lo existente.
 */
export const consultorFormPatchSchema = consultorFormFase2Schema;
export type ConsultorFormPatch = z.infer<typeof consultorFormPatchSchema>;
