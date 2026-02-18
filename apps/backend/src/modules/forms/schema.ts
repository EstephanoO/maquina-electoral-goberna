import { z } from "zod";

export const formSchema = z.object({
  client_id: z.string().trim().min(1).optional(),
  campaign_id: z.string().uuid().optional(),
  form_definition_id: z.string().uuid().optional(),
  encuestador: z.string().trim().optional(),
  encuestador_id: z.string().trim().optional(),
}).passthrough();

export type FormInput = z.infer<typeof formSchema>;
