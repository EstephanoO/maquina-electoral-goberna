import { z } from "zod";

export const createAccessRequestSchema = z.object({
  campaign_id: z.string().uuid("campaign_id invalido"),
  perm_tierra: z.boolean().optional().default(true),
  perm_digital: z.boolean().optional().default(true),
});

export const resolveAccessRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
  /** Role to assign on approval */
  role: z.enum(["consultor", "candidato", "brigadista_zonal", "agente_campo", "agente_digital"]).optional().default("agente_campo"),
  /** Permission for Tierra module (field operations) */
  perm_tierra: z.boolean().optional().default(true),
  /** Permission for Digital module (web/social) */
  perm_digital: z.boolean().optional().default(true),
});

export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;
export type ResolveAccessRequestInput = z.infer<typeof resolveAccessRequestSchema>;
