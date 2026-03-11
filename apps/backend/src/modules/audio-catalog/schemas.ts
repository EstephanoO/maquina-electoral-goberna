import { z } from "zod";

// Canonical category list — must stay in sync with extension panel CATALOG_CATEGORY_LABELS
export const AUDIO_CATALOG_CATEGORIES = [
  "saludo",
  "agradecimiento",
  "pedir_voto",
  "respuesta_trabajo",
  "respuesta_dinero",
  "invitacion_evento",
  "despedida",
  "propuestas",
] as const;

export type AudioCatalogCategory = typeof AUDIO_CATALOG_CATEGORIES[number];

export const listCatalogSchema = z.object({
  campaign_id: z.string().uuid(),
  active_only: z.coerce.boolean().optional().default(true),
});

export const generateAudioSchema = z.object({
  id: z.string().uuid(),
});

export const createItemSchema = z.object({
  campaign_id: z.string().uuid(),
  category: z.enum(AUDIO_CATALOG_CATEGORIES, {
    error: `category debe ser uno de: ${AUDIO_CATALOG_CATEGORIES.join(", ")}`,
  }),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional().default(""),
  script_text: z.string().min(1).max(5000),
  sort_order: z.number().int().min(0).optional().default(0),
  voice_id: z.string().max(100).optional(),
  // If true, backend auto-generates audio after creating the item (requires ELEVENLABS_API_KEY)
  auto_generate: z.boolean().optional().default(false),
});

export const updateItemSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  script_text: z.string().min(1).max(5000).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});
