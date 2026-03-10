import { z } from "zod";

export const listCatalogSchema = z.object({
  campaign_id: z.string().uuid(),
  active_only: z.coerce.boolean().optional().default(true),
});

export const generateAudioSchema = z.object({
  id: z.string().uuid(),
});

export const createItemSchema = z.object({
  campaign_id: z.string().uuid(),
  category: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional().default(""),
  script_text: z.string().min(1).max(5000),
  sort_order: z.number().int().min(0).optional().default(0),
  voice_id: z.string().max(100).optional(),
});

export const updateItemSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  script_text: z.string().min(1).max(5000).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});
