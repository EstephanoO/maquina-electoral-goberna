// blast-orchestrator/rate-controller.ts
// Adaptive daily limit calculation per phone.
// Replaces the static warmup curve in blast/repository.ts getNumberHealth().
// See: docs/BLAST-V2-ARCHITECTURE.md §2.1

import type { PhoneHealthData, ScaleGates } from "./types";

// ── Warmup curve ────────────────────────────────────────────────────
// More conservative than v1 (which went 30→300 in 15 days).
// v2 goes 20→1000 in 30 days with gating conditions.

const WARMUP_CURVE: ReadonlyArray<[day: number, limit: number]> = [
  [1, 20],   [2, 40],   [3, 60],   [4, 80],   [5, 100],
  [6, 130],  [7, 160],  [8, 200],  [9, 240],  [10, 280],
  [11, 320], [12, 360], [13, 400], [14, 450], [15, 500],
  [16, 550], [17, 600], [18, 650], [19, 700], [20, 750],
  [21, 800], [25, 900], [30, 1000],
];

/** Interpolate between warmup curve points. */
function interpolateWarmupCurve(day: number): number {
  if (day <= 0) return WARMUP_CURVE[0]![1];

  for (let i = 0; i < WARMUP_CURVE.length - 1; i++) {
    const entry = WARMUP_CURVE[i]!;
    const next = WARMUP_CURVE[i + 1]!;
    const [d1, l1] = entry;
    const [d2, l2] = next;
    if (day >= d1 && day <= d2) {
      // Linear interpolation between two points
      const ratio = (day - d1) / (d2 - d1);
      return Math.round(l1 + ratio * (l2 - l1));
    }
  }

  // Beyond last point
  return WARMUP_CURVE[WARMUP_CURVE.length - 1]![1];
}

// ── Daily limit calculation ─────────────────────────────────────────

const ABSOLUTE_CAP = 1000;

/**
 * Compute the adaptive daily limit for a phone.
 * Considers warmup day, reply rate, incidents, and streaks.
 */
export function computeDailyLimit(phone: PhoneHealthData): number {
  // Base: warmup curve
  let base = interpolateWarmupCurve(phone.warmup_day);

  // Multiplier by reply rate (the MOST important indicator)
  if (phone.reply_rate_7d >= 0.40) {
    base *= 1.20; // +20% bonus
  } else if (phone.reply_rate_7d >= 0.25) {
    base *= 1.00; // neutral
  } else if (phone.reply_rate_7d >= 0.15) {
    base *= 0.80; // -20% penalty
  } else {
    base *= 0.50; // -50% penalty — DANGER ZONE
  }

  // Penalty for recent incidents (reports_received)
  if (phone.reports_received > 0) {
    base *= Math.max(0.30, 1 - phone.reports_received * 0.15);
  }

  // Bonus for incident-free streak (>10 blocks without incident)
  if (phone.blocks_without_incident >= 10) {
    base *= 1.10;
  }

  return Math.min(Math.round(base), ABSOLUTE_CAP);
}

// ── Hourly limit ────────────────────────────────────────────────────

const OPERATING_HOURS_PER_DAY = 8; // Mon-Fri 08-20 minus breaks

/**
 * Hourly limit is daily / operating hours, clamped between 20 and 150.
 */
export function computeHourlyLimit(dailyLimit: number): number {
  const raw = Math.round(dailyLimit / OPERATING_HOURS_PER_DAY);
  return Math.min(150, Math.max(20, raw));
}

// ── Scale gates ─────────────────────────────────────────────────────

const DEFAULT_GATES: ScaleGates = {
  reply_rate_7d_above: 0.25,
  spam_score_below: 30,
  consecutive_days_healthy: 3,
  no_wa_rate_below: 0.15,
  failed_rate_below: 0.05,
  daily_limit_utilization: 0.85,
};

/**
 * Check if a phone meets ALL conditions to scale up its daily limit.
 * ALL gates must pass — this is intentionally strict.
 */
export function canScaleUp(
  phone: PhoneHealthData,
  gates: ScaleGates = DEFAULT_GATES,
): boolean {
  return (
    phone.reply_rate_7d >= gates.reply_rate_7d_above &&
    // spam_score is 0-100 where lower is better (compared as "below")
    // but PhoneHealthData doesn't have spam_score, we rely on quality_rating
    phone.quality_rating === "green" &&
    phone.consecutive_healthy_days >= gates.consecutive_days_healthy &&
    phone.no_wa_rate <= gates.no_wa_rate_below &&
    phone.failed_rate <= gates.failed_rate_below &&
    phone.utilization >= gates.daily_limit_utilization
  );
}

// ── Rollback triggers ───────────────────────────────────────────────

/**
 * Evaluate rollback triggers and return the most severe action needed.
 * Returns null if no trigger fires.
 */
export function evaluateRollbackTriggers(metrics: {
  reply_rate_24h: number;
  spam_score_sustained_1h: number;
  ack_failure_rate_2h: number;
  operator_capacity_30m: number;
  ban_detected: boolean;
}): "reduce_30" | "reduce_50" | "pause_phone" | null {
  // Most severe first
  if (metrics.ban_detected) return "pause_phone";

  if (metrics.ack_failure_rate_2h > 0.10) return "pause_phone";

  if (metrics.reply_rate_24h < 0.15) return "reduce_50";

  if (metrics.spam_score_sustained_1h > 50) return "reduce_30";

  if (metrics.operator_capacity_30m > 0.90) return "reduce_30";

  return null;
}
