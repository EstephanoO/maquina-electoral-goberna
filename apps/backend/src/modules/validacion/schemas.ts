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
