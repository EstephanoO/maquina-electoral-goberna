import { z } from "zod";

export const createInvitationSchema = z.object({
  campaign_id: z.string().uuid(),
  role: z.enum(["consultor", "jefe_campana", "brigadista_zonal", "agente_campo"]),
  parent_user_id: z.string().uuid().nullable().optional(),
  zone_id: z.string().uuid().nullable().optional(),
  max_uses: z.number().int().min(1).max(1000).default(1),
  expires_in_hours: z.number().int().min(1).max(8760).default(72), // max 1 year
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
