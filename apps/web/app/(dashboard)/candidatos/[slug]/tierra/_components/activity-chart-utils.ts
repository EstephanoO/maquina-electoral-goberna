/**
 * activity-chart-utils.ts — Pure utility functions for ActivityCharts time-series.
 *
 * Extracted from activity-charts.tsx to keep the component focused on rendering.
 */

import type { FormRecord } from "@/lib/services";

/* ========== Types ========== */

export type TimeSeriesPoint = { label: string; forms: number; agents: number };

/* ========== Constants ========== */

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

/* ========== Helpers ========== */

export function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

export function formatDayLabel(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()}`;
}

export function resolveAgentName(form: FormRecord): { shortName: string; fullName: string } {
  const full = (form.encuestador || "").trim();
  if (!full) return { shortName: "Agente", fullName: "Agente" };
  const short = full.split(/\s+/)[0] || "Agente";
  return { shortName: short, fullName: full };
}

export function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prev) / prev) * 100);
}

/** Build day buckets between two dates (inclusive start, exclusive end). */
export function buildDayBuckets(from: Date, to: Date): Map<string, { forms: number; agents: Set<string> }> {
  const map = new Map<string, { forms: number; agents: Set<string> }>();
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    map.set(getDayKey(cursor), { forms: 0, agents: new Set() });
    cursor.setDate(cursor.getDate() + 1);
  }
  return map;
}

/** Sort day keys chronologically and produce TimeSeries. */
export function dayMapToSeries(dayMap: Map<string, { forms: number; agents: Set<string> }>): TimeSeriesPoint[] {
  return [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return { label: formatDayLabel(date), forms: bucket.forms, agents: bucket.agents.size };
    });
}

/** Round up to a nice Y-axis ceiling (5, 10, 20, 50, 100...) with ~20% headroom */
export function niceYMax(max: number): [number, number] {
  if (max === 0) return [0, 10];
  const padded = Math.ceil(max * 1.2);
  const mag = Math.pow(10, Math.floor(Math.log10(padded)));
  const steps = [1, 2, 5, 10].map((s) => s * mag);
  const nice = steps.find((s) => s >= padded) ?? padded;
  return [0, nice];
}
