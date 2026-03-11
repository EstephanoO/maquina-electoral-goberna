import { z } from "zod";

// Categories are now dynamic (stored in audio_catalog_categories table).
// No hardcoded enum — any non-empty string is accepted as category key.

export const listCatalogSchema = z.object({
  campaign_id: z.string().uuid(),
  active_only: z.coerce.boolean().optional().default(true),
});

export const generateAudioSchema = z.object({
  id: z.string().uuid(),
});

export const createItemSchema = z.object({
  campaign_id: z.string().uuid(),
  category: z.string().min(1).max(100),
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

// ── Category schemas ─────────────────────────────────────────────────
export const createCategorySchema = z.object({
  campaign_id: z.string().uuid(),
  key: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "key debe ser snake_case (letras minúsculas, números, guión bajo)"),
  label: z.string().min(1).max(100),
  icon: z.string().max(50).optional().default("default"),
  color: z.string().max(20).optional().default("#8696a0"),
  sort_order: z.number().int().min(0).optional().default(0),
});

export const updateCategorySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  sort_order: z.number().int().min(0).optional(),
});
