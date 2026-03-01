import { z } from "zod";

/* ─── Validation status pipeline ─── */

export const VALIDATION_STATUSES = ["pendiente", "contactado", "validado", "invalido"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/* ─── Zod schemas ─── */

export const updateStatusSchema = z.object({
  status: z.enum(VALIDATION_STATUSES),
  notes: z.string().max(500).optional(),
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
  created_at: string;           // form's created_at
  status: ValidationStatus;
  notes: string | null;
  claimed_by: string | null;    // user who's working on it
  claimed_by_name: string | null;
  updated_at: string;
};
