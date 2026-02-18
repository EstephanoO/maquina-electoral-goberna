import { z } from "zod";

export const createZoneSchema = z.object({
  campaign_id: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
  radius_meters: z.number().int().min(50).max(50000).default(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
  assigned_to: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateZoneInput = z.infer<typeof createZoneSchema>;

export const updateZoneSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  center_lat: z.number().min(-90).max(90).optional(),
  center_lng: z.number().min(-180).max(180).optional(),
  radius_meters: z.number().int().min(50).max(50000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
