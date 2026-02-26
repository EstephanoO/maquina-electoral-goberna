import type { CmsContact } from "@/lib/services/cms";

/* ─── Tag color palette ─── */

const TAG_COLORS = [
  "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#14b8a6", "#f97316", "#84cc16", "#ec4899", "#6366f1",
] as const;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getTagColor(tag: string): string {
  const norm = tag.trim().toLowerCase();
  if (!norm) return TAG_COLORS[0];
  return TAG_COLORS[hashStr(norm) % TAG_COLORS.length];
}

/* ─── Contact helpers ─── */

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "SN";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function formatPhone(phone: string): string {
  if (!phone) return "";
  return phone.startsWith("+") ? phone : `+51${phone}`;
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "--/--";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "--/--";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function getLastInteractionMs(contact: CmsContact): number {
  return [contact.cms_respondieron_at, contact.cms_hablado_at, contact.cms_claimed_at, contact.created_at]
    .reduce((max, v) => {
      if (!v) return max;
      const t = Date.parse(v);
      return Number.isNaN(t) ? max : Math.max(max, t);
    }, 0);
}

export function formatRelative(dateMs: number): string {
  if (!dateMs) return "—";
  const diff = Date.now() - dateMs;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}
