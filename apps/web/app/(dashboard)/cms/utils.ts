/**
 * CMS pure utility functions — no React, no side-effects.
 * Extracted from cms/page.tsx to be shared by hook + components.
 */

import type { CmsContact, CmsTabFilter } from "@/lib/services/cms";

// ── Constants ───────────────────────────────────────────────────────

export const FONT = "var(--font-montserrat), system-ui, sans-serif";
export const NOTES_PANEL_WIDTH = 400;
export const NOTES_PANEL_GAP = 32;
export const PAGE_LIMIT = 25;
export const MOBILE_CHAT_BREAKPOINT_PX = 768;
export const OPEN_MOBILE_SIDEBAR_EVENT = "goberna:open-mobile-sidebar";

export const TAG_COLOR_PALETTE = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#ec4899",
  "#6366f1",
] as const;

// ── Pure helpers ────────────────────────────────────────────────────

export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 32);
}

export function hashTag(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getTagColor(tagName: string): string {
  const normalized = normalizeTagName(tagName).toLowerCase();
  if (!normalized) return TAG_COLOR_PALETTE[0];
  return TAG_COLOR_PALETTE[hashTag(normalized) % TAG_COLOR_PALETTE.length];
}

export function withAlpha(hexColor: string, alpha: number): string {
  const sanitized = hexColor.replace("#", "");
  const fullHex =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((ch) => `${ch}${ch}`)
          .join("")
      : sanitized;

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return `rgba(59, 130, 246, ${alpha})`;
  }

  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

export function getContactLastInteractionMs(contact: CmsContact): number {
  const updatedAt = (contact as CmsContact & { updated_at?: string })
    .updated_at;
  const dataLastInteraction =
    typeof contact.data?.last_interaction_at === "string"
      ? contact.data.last_interaction_at
      : null;
  const dataLastMessage =
    typeof contact.data?.last_message_at === "string"
      ? contact.data.last_message_at
      : null;

  return Math.max(
    toMs(contact.cms_respondieron_at),
    toMs(contact.cms_hablado_at),
    toMs(contact.cms_claimed_at),
    toMs(updatedAt),
    toMs(dataLastInteraction),
    toMs(dataLastMessage),
    toMs(contact.created_at),
  );
}

/**
 * Merge an SSE-updated contact into the current list,
 * respecting the active tab filter.
 */
export function mergeContactForActiveTab(
  prev: CmsContact[],
  contact: CmsContact,
  previousStatus: string,
  activeTab: CmsTabFilter,
): CmsContact[] {
  const belongsInTab =
    activeTab === "todos" || contact.cms_status === activeTab;
  const wasInTab = activeTab === "todos" || previousStatus === activeTab;

  if (belongsInTab && wasInTab) {
    const idx = prev.findIndex((item) => item.id === contact.id);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = contact;
      return next;
    }
    return [contact, ...prev];
  }

  if (belongsInTab) {
    return [contact, ...prev.filter((item) => item.id !== contact.id)];
  }

  if (wasInTab) {
    return prev.filter((item) => item.id !== contact.id);
  }

  return prev;
}
