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
