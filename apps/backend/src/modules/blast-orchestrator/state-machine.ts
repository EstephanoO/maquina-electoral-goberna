// blast-orchestrator/state-machine.ts
// Pure-function state machine for phone orchestration.
// The backend computes state transitions; the extension executes them.
// See: docs/BLAST-V2-ARCHITECTURE.md §2.1

import type { PhoneState, PhoneStateName, Signal } from "./types";

// ── Peru timezone helpers ───────────────────────────────────────────

/** Get current hour in Peru (UTC-5) */
export function getPeruHour(now: Date): number {
  // UTC hour - 5, wrap around midnight
  const utcH = now.getUTCHours();
  return (utcH - 5 + 24) % 24;
}

/** Get day of week in Peru (0=Sunday, 6=Saturday) */
export function getPeruDayOfWeek(now: Date): number {
  // Shift by -5h to get Peru's "local" date
  const peruMs = now.getTime() - 5 * 3600_000;
  return new Date(peruMs).getUTCDay();
}

/** Diff in minutes between two dates */
function diffMinutes(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

/** Add seconds to a date */
function addSeconds(d: Date, sec: number): Date {
  return new Date(d.getTime() + sec * 1000);
}

// ── Operating hours ─────────────────────────────────────────────────

/**
 * Check if the current time is within operating hours for Peru.
 * Mon-Fri: 08:00 - 20:00
 * Sat: 09:00 - 14:00
 * Sun: OFF
 */
export function isWithinOperatingHours(now: Date): boolean {
  const day = getPeruDayOfWeek(now);
  const hour = getPeruHour(now);

  if (day === 0) return false; // Sunday
  if (day === 6) return hour >= 9 && hour < 14; // Saturday
  return hour >= 8 && hour < 20; // Mon-Fri
}

// ── State transition engine ─────────────────────────────────────────

/**
 * Compute the next state for a phone given a signal.
 * This is a PURE FUNCTION: same inputs → same output. No side effects.
 * The caller persists the returned state.
 */
export function computeNextState(
  current: PhoneState,
  signal: Signal,
): PhoneState {
  const now = signal.timestamp;

  // ── Rule 1: Operating hours ──
  if (!isWithinOperatingHours(now)) {
    if (current.state !== "dormant") {
      return {
        ...current,
        state: "dormant",
        state_entered_at: now,
      };
    }
    return current;
  }

  // ── Rule 2: Manual pause/resume ──
  if (signal.type === "manual_pause") {
    return { ...current, state: "paused", state_entered_at: now };
  }
  if (signal.type === "manual_resume" && current.state === "paused") {
    return { ...current, state: "sending", state_entered_at: now };
  }

  // ── Rule 3: Ban detected — immediate stop ──
  if (signal.type === "ban_detected") {
    return {
      ...current,
      state: "paused",
      state_entered_at: now,
      quality_rating: "red",
    };
  }

  // ── Rule 4: Daily limit reached ──
  if (current.sent_today >= current.daily_limit) {
    if (current.state !== "paused") {
      return { ...current, state: "paused", state_entered_at: now };
    }
    return current;
  }

  // ── Rule 5: Spam risk critical (score ≥ 70) ──
  if (signal.type === "spam_score_update" && signal.score !== undefined) {
    const newScore = signal.score;
    const updated = { ...current, spam_score: newScore };

    if (newScore >= 70) {
      return {
        ...updated,
        state: "throttled",
        state_entered_at: now,
        cooldown_until: addSeconds(now, 180), // 3 min
        quality_rating: "red",
      };
    }
    if (newScore >= 45 && current.state === "sending") {
      return {
        ...updated,
        state: "throttled",
        state_entered_at: now,
        cooldown_until: addSeconds(now, 60), // 1 min
        quality_rating: "yellow",
      };
    }
    return updated;
  }

  // ── Rule 6: Checkpoint (every 50 messages in current block) ──
  if (signal.type === "block_complete" && current.state === "sending") {
    return {
      ...current,
      state: "checkpoint",
      state_entered_at: now,
    };
  }

  if (signal.type === "checkpoint_cleared" && current.state === "checkpoint") {
    return {
      ...current,
      state: "sending",
      state_entered_at: now,
      block_sent: 0,
      current_block: null,
    };
  }

  // ── Rule 7: Throttle cooldown expired → resume ──
  if (
    current.state === "throttled" &&
    current.cooldown_until &&
    now >= current.cooldown_until
  ) {
    return {
      ...current,
      state: "sending",
      state_entered_at: now,
      cooldown_until: null,
    };
  }

  // ── Rule 8: Warming → Sending after 30 min ──
  if (current.state === "dormant" && signal.type === "schedule_tick") {
    return {
      ...current,
      state: "warming",
      state_entered_at: now,
      warmup_start_at: now,
    };
  }

  if (current.state === "warming" && current.warmup_start_at) {
    const warmingMinutes = diffMinutes(now, current.warmup_start_at);
    if (warmingMinutes >= 30) {
      return {
        ...current,
        state: "sending",
        state_entered_at: now,
      };
    }
  }

  // ── Rule 9: Message events update counters ──
  if (signal.type === "message_sent" && current.state === "sending") {
    return {
      ...current,
      sent_today: current.sent_today + 1,
      block_sent: current.block_sent + 1,
      last_sent_at: now,
    };
  }

  if (signal.type === "message_failed") {
    return {
      ...current,
      failed_today: current.failed_today + 1,
    };
  }

  if (signal.type === "reply_received") {
    return {
      ...current,
      replied_today: current.replied_today + 1,
    };
  }

  return current;
}

// ── Quality rating calculation ──────────────────────────────────────

export function computeQualityRating(
  replyRate7d: number,
  spamScore: number,
): "green" | "yellow" | "red" {
  if (spamScore >= 70 || replyRate7d < 0.15) return "red";
  if (spamScore >= 45 || replyRate7d < 0.25) return "yellow";
  return "green";
}

// ── State name helpers ──────────────────────────────────────────────

const VALID_STATES: ReadonlySet<PhoneStateName> = new Set([
  "dormant", "warming", "sending", "checkpoint",
  "cooling", "throttled", "paused",
]);

export function isValidState(s: string): s is PhoneStateName {
  return VALID_STATES.has(s as PhoneStateName);
}
