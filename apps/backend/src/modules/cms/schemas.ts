import { z } from "zod";

// ── Route params ──────────────────────────────────────────────────
export const contactIdParams = z.object({
  id: z.string().uuid(),
});

export const waPhoneIdParams = z.object({
  id: z.string().uuid(),
});

// ── Query strings ─────────────────────────────────────────────────
export const listContactsQuery = z.object({
  status: z.string().optional().default("nuevo"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(200).optional().default(""),
  tag: z.string().max(64).optional().default(""),
});

export const brigadistasMetricsQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const extensionMonitorQuery = z.object({
  campaign_id: z.string().uuid("campaign_id debe ser un UUID válido"),
});

// ── Body schemas (extracted from inline in routes.ts) ─────────────

export const signalFlagsSchema = z.object({
  responde: z.boolean().optional(),
  hace_pregunta: z.boolean().optional(),
  pide_informacion: z.boolean().optional(),
  comparte_ubicacion: z.boolean().optional(),
  deja_en_visto: z.boolean().optional(),
  bloquea: z.boolean().optional(),
});

export const updateNotesSchema = z.object({
  local_votacion: z.string().max(500).optional().default(""),
  domicilio: z.string().max(500).optional().default(""),
  comentarios: z.string().max(2000).optional().default(""),
  signal_flags: signalFlagsSchema.optional().default({}),
  signal_score: z.number().int().min(-200).max(200).optional().default(0),
  vote_tier: z.enum(["contacto_basura", "voto_blando", "voto_duro"]).optional().default("contacto_basura"),
});

export const setTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(32)).max(20),
});

export const extensionEventSchema = z.object({
  type: z.enum(["message_sent", "message_received"]),
  phone: z.string().min(7).max(20).optional(),
  contact_name: z.string().max(200).optional(),
  own_number: z.string().max(20).optional().default(""),
  preview: z.string().max(500).optional().default(""),
  detected_at: z.number().optional(),
}).refine(
  (d) => d.phone || d.contact_name,
  { message: "phone o contact_name es requerido" },
);

export const publicContactSchema = z.object({
  campaign_slug: z.string().min(1, "campaign_slug es requerido"),
  nombre: z.string().min(1, "nombre es requerido").max(200),
  telefono: z.string().min(6, "telefono es requerido").max(20),
  zona: z.string().max(200).optional().default(""),
  distrito: z.string().max(200).optional().default(""),
  comentarios: z.string().max(2000).optional().default(""),
});

export const waPhoneSchema = z.object({
  number: z.string().min(7).max(20),
  alias: z.string().min(1).max(100),
});
