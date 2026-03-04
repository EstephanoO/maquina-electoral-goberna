/**
 * GOBERNA — CMS Metrics shared helpers
 */

export const FONT = "var(--font-montserrat), system-ui, sans-serif";

export const HIDDEN_EMAILS = new Set(["cesarvasquez@goberna.pe"]);
export const HIDDEN_NAMES = new Set(["Cesar Vasquez"]);

export function pct(a: number, b: number): string {
  if (b <= 0) return "0";
  return ((a / b) * 100).toFixed(0);
}

export function formatMins(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v < 1) return "<1m";
  if (v < 60) return `${Math.round(v)}m`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
