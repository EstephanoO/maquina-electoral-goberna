import { z } from "zod";

/* ─── Validation status pipeline ─── */

export const VALIDATION_STATUSES = ["pendiente", "contactado", "respondido", "invalido"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/* ─── Zod schemas ─── */

export const updateStatusSchema = z.object({
  status: z.enum(VALIDATION_STATUSES),
  notes: z.string().max(500).optional(),
  vote_class: z.string().max(20).optional(),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

/* ─── Classification event schemas ─── */

export const CLASSIFICATION_SOURCES = ["auto", "manual", "correction"] as const;
export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

export const classificationEventSchema = z.object({
  phone: z.string().max(20).optional(),
  contact_name: z.string().max(200).optional(),
  message_text: z.string().max(2000).optional().default(""),
  validation_id: z.string().uuid().optional(),
  source: z.enum(CLASSIFICATION_SOURCES),
  category: z.string().max(60).optional().default(""),
  vote_class: z.string().max(20).optional().default(""),
  status: z.string().max(20).optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0),
  reason: z.string().max(500).optional().default(""),
});

export type ClassificationEventInput = z.infer<typeof classificationEventSchema>;

export const correctClassificationSchema = z.object({
  corrected_vote_class: z.string().max(20),
  corrected_status: z.string().max(20),
});

export type CorrectClassificationInput = z.infer<typeof correctClassificationSchema>;

/* ─── Scorer config schema (per-campaign overrides) ─── */

// Shape de campaigns.config.scorer_config — cada campo es opcional,
// defaults globales de CATEGORY_WEIGHTS/THRESHOLDS se usan como fallback.
export const scorerConfigSchema = z.object({
  // Umbrales de clasificación
  threshold_duro: z.number().min(0.1).max(10).optional(),
  threshold_blando: z.number().min(0.01).max(10).optional(),
  threshold_flotante: z.number().min(0.01).max(10).optional(),
  // Lock de inválido
  invalido_lock_threshold: z.number().min(0.5).max(10).optional(),
  invalido_reversal_threshold: z.number().min(0.5).max(10).optional(),
  // Decay
  decay_half_life_days: z.number().min(1).max(90).optional(),
  // Overrides de pesos por categoría (parcial — se mergean con defaults)
  category_weights: z.record(z.string(), z.number().min(-10).max(10)).optional(),
}).strict();

export type ScorerConfigInput = z.infer<typeof scorerConfigSchema>;

/* ─── Row types ─── */

export type ValidationRow = {
  id: string;
  form_id: string;
  campaign_id: string;
  nombre: string;
  telefono: string;
  encuestador: string;
  zona: string;
  departamento: string | null;
  created_at: string;
  status: ValidationStatus;
  notes: string | null;
  tags: string[];
  score: number;
  vote_class: string;
  claimed_by: string | null;
  claimed_by_name: string | null;
  updated_at: string;
};

export type ClassificationEventRow = {
  id: string;
  campaign_id: string;
  operator_id: string;
  operator_name: string | null;
  validation_id: string | null;
  phone: string | null;
  contact_name: string | null;
  message_text: string;
  source: ClassificationSource;
  category: string;
  vote_class: string;
  status: string;
  confidence: number;
  reason: string;
  corrected_vote_class: string | null;
  corrected_status: string | null;
  corrected_by: string | null;
  corrected_by_name: string | null;
  corrected_at: string | null;
  original_event_id: string | null;
  created_at: string;
  // joined from form_validations
  nombre: string | null;
};
