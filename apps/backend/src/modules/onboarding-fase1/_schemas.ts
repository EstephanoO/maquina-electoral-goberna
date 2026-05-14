/**
 * Schemas zod compartidos para el CRM de candidatos en `onboarding_fase1`.
 * Reuso entre repos y routes.
 */
import { z } from "zod";

// ── enums ─────────────────────────────────────────────────────────
export const estadoPipelineEnum = z.enum([
  "lead",
  "calificado",
  "en_pitch",
  "aprobado",
  "rechazado",
  "pausado",
]);
export type EstadoPipeline = z.infer<typeof estadoPipelineEnum>;

// ── candidato ─────────────────────────────────────────────────────
export const candidatoCreateSchema = z.object({
  nombres: z.string().min(1).max(120),
  apellidos: z.string().min(1).max(120),
  dni: z.string().regex(/^\d{6,12}$/).optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().email().max(160).optional(),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lugar_nacimiento: z.string().max(160).optional(),
  genero: z.string().max(40).optional(),
});
export type CandidatoCreate = z.infer<typeof candidatoCreateSchema>;

export const candidatoUpdateSchema = candidatoCreateSchema.partial().extend({
  foto_url: z.string().url().optional().nullable(),
});
export type CandidatoUpdate = z.infer<typeof candidatoUpdateSchema>;

// ── postulación ───────────────────────────────────────────────────
export const postulacionUpsertSchema = z.object({
  id_cargo_gobierno: z.number().int().positive(),
  id_organizacion_politica: z.number().int().positive().optional(),
  id_proceso_electoral: z.number().int().positive(),
  id_departamento: z.number().int().positive().optional(),
  id_provincia: z.number().int().positive().optional(),
  id_distrito: z.number().int().positive().optional(),
}).refine(
  (v) => v.id_departamento || v.id_provincia || v.id_distrito,
  { message: "Al menos una jurisdicción (departamento/provincia/distrito) requerida" },
);
export type PostulacionUpsert = z.infer<typeof postulacionUpsertSchema>;

// ── fórmula ───────────────────────────────────────────────────────
export const formulaCreateSchema = z.object({
  orden: z.number().int().min(1).max(50),
  nombres: z.string().min(1).max(120),
  apellidos: z.string().min(1).max(120),
  dni: z.string().regex(/^\d{6,12}$/).optional(),
  cargo_companero: z.string().max(120).optional(),
  notas: z.string().max(1000).optional(),
});
export type FormulaCreate = z.infer<typeof formulaCreateSchema>;

// ── nota ──────────────────────────────────────────────────────────
export const notaCreateSchema = z.object({
  texto: z.string().min(1).max(8000),
});
export type NotaCreate = z.infer<typeof notaCreateSchema>;

// ── transición de estado ──────────────────────────────────────────
export const transicionSchema = z.object({
  nuevo_estado: estadoPipelineEnum,
  motivo: z.string().max(2000).optional(),   // requerido cuando rechazado/pausado
}).refine(
  (v) => {
    if (v.nuevo_estado === "rechazado" || v.nuevo_estado === "pausado") {
      return Boolean(v.motivo && v.motivo.length > 0);
    }
    return true;
  },
  { message: "motivo requerido al rechazar o pausar" },
);
export type Transicion = z.infer<typeof transicionSchema>;

// ── consultor_form (JSONB pasthrough) ─────────────────────────────
// El form es libre — JSONB. Validación profunda en el frontend.
// Solo nos importan las metadata top-level.
export const consultorFormUpdateSchema = z.object({
  payload: z.record(z.unknown()),
  ultima_seccion: z.string().max(80).optional(),
  completado: z.boolean().optional(),
});
export type ConsultorFormUpdate = z.infer<typeof consultorFormUpdateSchema>;

// ── deck publicar ─────────────────────────────────────────────────
export const deckPublishSchema = z.object({
  payload: z.record(z.unknown()),     // snapshot de las slides + config
});
export type DeckPublish = z.infer<typeof deckPublishSchema>;

// ── listado: query params ─────────────────────────────────────────
export const candidatoListQuerySchema = z.object({
  estado: estadoPipelineEnum.optional(),
  creado_por: z.string().uuid().optional(),
  q: z.string().max(120).optional(),           // búsqueda por nombres/dni
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CandidatoListQuery = z.infer<typeof candidatoListQuerySchema>;
