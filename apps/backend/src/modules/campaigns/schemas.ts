import { z } from "zod";

const jurisdiccionNivelEnum = z.enum(["departamento", "provincia", "distrito"]);

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  cargo: z.string().trim().max(200).optional(),
  numero: z.number().int().positive().optional(),
  partido: z.string().trim().max(200).optional(),
  foto_url: z.string().trim().max(500).optional(),
  jurisdiccion_nivel: jurisdiccionNivelEnum.optional(),
  jurisdiccion_code: z.string().trim().min(2).max(6).optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  cargo: z.string().trim().max(200).optional(),
  numero: z.number().int().positive().optional(),
  partido: z.string().trim().max(200).optional(),
  foto_url: z.string().trim().max(500).optional(),
  jurisdiccion_nivel: jurisdiccionNivelEnum.nullable().optional(),
  jurisdiccion_code: z.string().trim().min(2).max(6).nullable().optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
