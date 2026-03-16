import { z } from "zod";

export const markHabladoSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export const blastReportItemSchema = z.object({
  phone:        z.string().max(20),
  contact_name: z.string().max(200).optional(),
  message:      z.string().max(600).optional(),
  status:       z.enum(["sent", "failed"]),
  error:        z.string().max(300).nullable().optional(),
  own_number:   z.string().max(20).nullable().optional(),
});

export const blastReportSchema = z.object({
  results: z.array(blastReportItemSchema).min(1).max(100),
});

// POST /api/blast/number-config — register a WA number as a blast slot
export const numberConfigSchema = z.object({
  wa_number:   z.string().min(10).max(20),
  label:       z.string().max(100).optional(),
  segment_idx: z.number().int().min(0).max(29),  // slot 0-29
  total_slots: z.number().int().min(1).max(30),
});
