"use client";

import type { CmsContact } from "@/lib/services/cms";
import { getInitials, formatPhone, formatRelative, getLastInteractionMs } from "./pipeline-utils";

type Props = {
  contact: CmsContact;
  accent: string;
};

export function ContactRow({ contact, accent }: Props) {
  const name = contact.nombre?.trim() || "Sin nombre";
  const zone = contact.zona || contact.distrito || null;
  const phone = contact.telefono ? formatPhone(contact.telefono) : null;
  const lastMs = getLastInteractionMs(contact);

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors min-w-0 group">
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
    </div>
  );
}
