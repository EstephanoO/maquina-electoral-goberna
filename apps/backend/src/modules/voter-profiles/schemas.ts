import { z } from "zod";

export const PIPELINE_STATUSES = ["nuevo", "contactado", "respondido", "comprometido", "invalido"] as const;
export const VOTE_CLASSES = ["duro", "blando", "flotante", "invalido", ""] as const;

export const listQuerySchema = z.object({
  pipeline_status: z.string().optional(),
  vote_class: z.string().optional(),
  search: z.string().optional(),
  has_wa: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const updateBodySchema = z.object({
  canonical_name: z.string().min(1).max(200).optional(),
  zona: z.string().max(200).optional(),
  distrito: z.string().max(200).optional(),
  departamento: z.string().max(200).optional(),
  provincia: z.string().max(200).optional(),
  domicilio: z.string().max(500).optional(),
  local_votacion: z.string().max(500).optional(),
  vote_class: z.enum(["duro", "blando", "flotante", "invalido", ""]).optional(),
  pipeline_status: z.enum(PIPELINE_STATUSES).optional(),
  category: z.string().max(200).optional(),
  signal_score: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(5000).optional(),
});

export const pipelineStatusSchema = z.object({
  status: z.enum(PIPELINE_STATUSES),
});
