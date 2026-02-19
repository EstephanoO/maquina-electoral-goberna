/**
 * Objectives Schemas
 * Zod validation schemas for objectives endpoints
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// Zone Objectives
// ═══════════════════════════════════════════════════════════════════════════

export const upsertZoneObjectiveSchema = z.object({
  region: z.string().trim().min(1, "Region is required").max(100),
  target_forms: z.number().int().min(0, "Target must be >= 0").max(1000000),
  description: z.string().trim().max(500).optional(),
});

export const bulkUpsertZoneObjectivesSchema = z.object({
  objectives: z.array(upsertZoneObjectiveSchema).min(1).max(100),
});

// ═══════════════════════════════════════════════════════════════════════════
// User Objectives
// ═══════════════════════════════════════════════════════════════════════════

export const setUserObjectiveSchema = z.object({
  user_id: z.string().uuid("Invalid user ID"),
  target_forms: z.number().int().min(0).max(1000000).nullable(),
  notes: z.string().trim().max(500).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type UpsertZoneObjectiveInput = z.infer<typeof upsertZoneObjectiveSchema>;
export type BulkUpsertZoneObjectivesInput = z.infer<typeof bulkUpsertZoneObjectivesSchema>;
export type SetUserObjectiveInput = z.infer<typeof setUserObjectiveSchema>;
