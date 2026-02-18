import { z } from "zod";

const roleEnum = z.enum(["admin", "consultor", "jefe_campana", "brigadista_zonal", "agente_campo"]);

export const createOrgNodeSchema = z.object({
  campaign_id: z.string().uuid(),
  user_id: z.string().uuid(),
  parent_user_id: z.string().uuid().nullable().optional(),
  role: roleEnum,
  zone_id: z.string().uuid().nullable().optional(),
});

export type CreateOrgNodeInput = z.infer<typeof createOrgNodeSchema>;

export const updateOrgNodeSchema = z.object({
  parent_user_id: z.string().uuid().nullable().optional(),
  role: roleEnum.optional(),
  zone_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export type UpdateOrgNodeInput = z.infer<typeof updateOrgNodeSchema>;
