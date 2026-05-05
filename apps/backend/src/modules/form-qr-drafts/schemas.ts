import { z } from "zod";

// POST /api/form-qr-drafts — el brigadista terminó el form, queremos token + qr_url
export const createDraftSchema = z.object({
  client_id: z.string().trim().min(1),
  form_definition_id: z.string().uuid().optional(),
  data: z.record(z.string(), z.unknown()),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export type CreateDraftInput = z.infer<typeof createDraftSchema>;
