import { z } from "zod";

// ── Status values ───────────────────────────────────────────────────
export const MEET_STATUSES = ["pending_location", "scheduled", "active", "completed", "cancelled"] as const;
export type MeetStatus = (typeof MEET_STATUSES)[number];

export const MEET_TYPES = ["recoleccion", "reunion", "capacitacion"] as const;
export type MeetType = (typeof MEET_TYPES)[number];

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
  // New fields
  leader_id: z.string().uuid().optional(),
  zone_id: z.string().uuid().optional(),
  meet_type: z.enum(MEET_TYPES).default("recoleccion"),
  directions_text: z.string().trim().max(2000).optional(),
  directions_url: z.string().url().max(500).optional(),
  collection_center_lat: z.number().min(-90).max(90).optional(),
  collection_center_lng: z.number().min(-180).max(180).optional(),
  collection_radius_meters: z.number().int().min(50).max(50000).optional(),
  target_forms: z.number().int().min(0).optional(),
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
  // New fields
  leader_id: z.string().uuid().nullable().optional(),
  zone_id: z.string().uuid().nullable().optional(),
  meet_type: z.enum(MEET_TYPES).optional(),
  directions_text: z.string().trim().max(2000).nullable().optional(),
  directions_url: z.string().url().max(500).nullable().optional(),
  collection_center_lat: z.number().min(-90).max(90).nullable().optional(),
  collection_center_lng: z.number().min(-180).max(180).nullable().optional(),
  collection_radius_meters: z.number().int().min(50).max(50000).nullable().optional(),
  target_forms: z.number().int().min(0).nullable().optional(),
});

export type UpdateMeetInput = z.infer<typeof updateMeetSchema>;

// ── Update status ───────────────────────────────────────────────────
export const updateMeetStatusSchema = z.object({
  status: z.enum(MEET_STATUSES),
});
