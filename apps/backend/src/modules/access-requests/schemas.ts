import { z } from "zod";

export const createAccessRequestSchema = z.object({
  campaign_id: z.string().uuid("campaign_id invalido"),
  perm_tierra: z.boolean().optional().default(true),
  perm_digital: z.boolean().optional().default(true),
});

/** Map frontend aliases to canonical role names */
const ROLE_ALIASES: Record<string, string> = {
  agent: "agente_campo",
  supervisor: "jefe_campana",
};

export const resolveAccessRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
  /** Role to assign on approval. Accepts aliases: agent, supervisor */
  role: z.string().optional().default("agente_campo").transform((v) => ROLE_ALIASES[v] ?? v).pipe(
    z.enum(["consultor", "jefe_campana", "brigadista_zonal", "agente_campo"]),
  ),
  /** Permission for Tierra module (field operations) */
  perm_tierra: z.boolean().optional().default(true),
  /** Permission for Digital module (web/social) */
  perm_digital: z.boolean().optional().default(true),
});

export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;
export type ResolveAccessRequestInput = z.infer<typeof resolveAccessRequestSchema>;
