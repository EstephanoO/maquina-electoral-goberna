"use client";

import type { CmsContact } from "@/lib/services/cms";
import { getInitials, formatPhone, formatRelative, getLastInteractionMs } from "./pipeline-utils";

type Props = {
  contact: CmsContact;
  accent: string;
  onOpenChat?: (contact: CmsContact) => void;
  lockLabel?: string | null;
  lockedByOther?: boolean;
};

export function ContactRow({
  contact,
  accent,
  onOpenChat,
  lockLabel,
  lockedByOther = false,
}: Props) {
  const name = contact.nombre?.trim() || "Sin nombre";
  const zone = contact.zona || contact.distrito || null;
  const phone = contact.telefono ? formatPhone(contact.telefono) : null;
  const lastMs = getLastInteractionMs(contact);
  const clickable = Boolean(onOpenChat);

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? () => onOpenChat?.(contact) : undefined}
      className={`relative w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg min-w-0 group transition-colors ${
        clickable ? "cursor-pointer hover:bg-slate-100" : "cursor-default"
      }`}
    >
      {/* Initials */}
      <div
        className="w-7 h-7 rounded-full text-[10px] font-extrabold inline-flex items-center justify-center shrink-0 text-white"
        style={{ background: accent }}
      >
        {getInitials(name)}
      </div>

      {/* Name */}
      <span className="text-[12px] font-bold text-slate-900 truncate min-w-[80px] max-w-[140px]">
        {name}
      </span>

      {/* Phone */}
      {phone && (
        <span className="text-[11px] text-slate-500 font-medium truncate shrink-0 hidden sm:inline">
          {phone}
        </span>
      )}

      {/* Zone pill */}
      {zone && (
        <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 truncate max-w-[90px] shrink-0">
          {zone}
        </span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Relative time */}
      <span className="text-[10px] font-semibold text-slate-400 shrink-0 tabular-nums">
        {formatRelative(lastMs)}
      </span>
      {lockedByOther && (
        <span className="absolute inset-0 rounded-lg bg-slate-900/45 border border-slate-700/40 pointer-events-none flex items-center justify-center px-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/80 text-white text-[10px] font-bold px-2.5 py-1 max-w-full">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M7 11V8a5 5 0 0 1 10 0v3" />
              <rect x="5" y="11" width="14" height="10" rx="2" />
            </svg>
            <span className="truncate">{lockLabel ?? "Atendido"}</span>
          </span>
        </span>
      )}
    </button>
  );
}
