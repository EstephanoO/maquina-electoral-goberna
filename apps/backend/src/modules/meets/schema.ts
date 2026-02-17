import { z } from "zod";

// ── Status values ───────────────────────────────────────────────────
export const MEET_STATUSES = ["pending_location", "scheduled", "active", "completed", "cancelled"] as const;
export type MeetStatus = (typeof MEET_STATUSES)[number];

// ── Create meet ─────────────────────────────────────────────────────
export const createMeetSchema = z.object({
  campaign_id: z.string().uuid(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  location_name: z.string().trim().max(255).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().optional(),
});

export type CreateMeetInput = z.infer<typeof createMeetSchema>;

// ── Update meet ─────────────────────────────────────────────────────
export const updateMeetSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  location_name: z.string().trim().max(255).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
});

export type UpdateMeetInput = z.infer<typeof updateMeetSchema>;

// ── Update status ───────────────────────────────────────────────────
export const updateMeetStatusSchema = z.object({
  status: z.enum(MEET_STATUSES),
});
