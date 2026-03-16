import { z } from "zod";

// ── Single result ──────────────────────────────────────────────────────
export const waValidatorResultSchema = z.object({
  id: z.string().uuid(),
  wa_valid: z.boolean(),
  // 'silent' = query service (no message), 'conv' = opened chat + sent message
  mode: z.enum(["silent", "conv"]).optional().default("silent"),
});

export type WaValidatorResult = z.infer<typeof waValidatorResultSchema>;

// ── Batch payload ──────────────────────────────────────────────────────
export const waValidatorResultsBatchSchema = z.object({
  results: z.array(waValidatorResultSchema).min(1).max(100),
});

export type WaValidatorResultsBatch = z.infer<typeof waValidatorResultsBatchSchema>;

// ── DB row ─────────────────────────────────────────────────────────────
export interface WaValidatorContactRow {
  id: string;
  nombre: string;
  telefono: string;
  encuestador: string;
  zona: string;
  wa_valid: boolean | null;
  wa_validated_at: string | null;
}

// ── Stats by brigadista ────────────────────────────────────────────────
export interface WaValidatorBrigadistaStats {
  encuestador: string;
  total: number;
  valid: number;
  invalid: number;
  pending: number;
  invalid_rate_pct: number;
}

export interface WaValidatorSummary {
  total: number;
  valid: number;
  invalid: number;
  pending: number;
}
