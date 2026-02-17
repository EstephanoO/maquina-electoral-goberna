import { z } from "zod";

export const agentLocationSchema = z.object({
  agent_id: z.string().trim().min(1),
  ts: z.string().datetime(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().nonnegative().optional(),
  speed: z.number().finite().nonnegative().optional(),
  heading: z.number().finite().min(0).max(359.999).optional(),
  battery: z.number().finite().min(0).max(100).optional(),
  seq: z.number().int().nonnegative(),
  campaign_id: z.string().uuid().optional(),
});

export const agentLocationBatchSchema = z.object({
  locations: z.array(agentLocationSchema).min(1).max(100),
});
