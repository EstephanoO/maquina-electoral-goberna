import type { ExtensionMonitorPhone } from "@/lib/services/cms";

// ── Constants ────────────────────────────────────────────────────────
export const SLOTS = [
  "Vasquez 1",
  "Vasquez 2",
  "Vasquez 3",
  "Vasquez 4",
  "Vasquez 5",
  "Vasquez 6",
];
export const POLL_PHONES_MS = 30_000;
export const POLL_SSE_MS = 60_000;
export const POLL_FALLBACK_MS = 15_000;
export const CLASS_PAGE_SIZE = 30;

export const EMPTY_PHONE: ExtensionMonitorPhone = {
  own_number: "",
  alias: null,
  wa_sent: 0,
  unique_contacts: 0,
  last_event_at: null,
  operators: [],
};

// ── Helpers ──────────────────────────────────────────────────────────
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function fmtRel(iso: string | null): string {
  if (!iso) return "\u2014";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
