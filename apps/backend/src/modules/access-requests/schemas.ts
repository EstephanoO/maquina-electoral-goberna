import { z } from "zod";

export const createAccessRequestSchema = z.object({
  campaign_id: z.string().uuid("campaign_id invalido"),
  perm_tierra: z.boolean().optional().default(true),
  perm_digital: z.boolean().optional().default(true),
});

export const resolveAccessRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
  /** Role to assign on approval. Defaults to 'agente_campo' if not specified. */
  role: z.enum(["consultor", "jefe_campana", "brigadista_zonal", "agente_campo"]).optional().default("agente_campo"),
});

export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;
export type ResolveAccessRequestInput = z.infer<typeof resolveAccessRequestSchema>;
