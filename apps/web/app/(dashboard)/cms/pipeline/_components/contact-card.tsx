"use client";

import type { CmsContact } from "@/lib/services/cms";
import { getInitials, formatPhone, formatDateShort, getLastInteractionMs, formatRelative, getTagColor } from "./pipeline-utils";

type Props = {
  contact: CmsContact;
  accent: string;
  onOpenChat?: (contact: CmsContact) => void;
  lockLabel?: string | null;
  lockedByOther?: boolean;
};

export function ContactCard({
  contact,
  accent,
  onOpenChat,
  lockLabel,
  lockedByOther = false,
}: Props) {
  const name = contact.nombre?.trim() || "Sin nombre";
  const zone = contact.zona || contact.distrito || "Sin zona";
  const lastMs = getLastInteractionMs(contact);
  const tags = (contact.cms_tags ?? []).slice(0, 3);
  const clickable = Boolean(onOpenChat) && !lockedByOther;

  return (
    <article
      className={`relative rounded-xl border border-slate-200 bg-white p-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.05)] ${clickable ? "cursor-pointer transition-colors hover:bg-slate-50" : ""}`}
      onClick={clickable ? () => onOpenChat?.(contact) : undefined}
      aria-disabled={lockedByOther}
    >
      {/* Row 1: avatar + name + date */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-[34px] h-[34px] rounded-full border border-slate-200 bg-slate-100 text-slate-800 text-[12px] font-extrabold inline-flex items-center justify-center shrink-0">
            {getInitials(name)}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-slate-900 leading-tight truncate">{name}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">{zone}</div>
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400 font-semibold">{formatDateShort(contact.created_at)}</span>
      </div>

      {/* Row 2: phone */}
      {contact.telefono && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-[#25D366] text-[12px] font-semibold">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <title>WhatsApp</title>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          {formatPhone(contact.telefono)}
        </div>
      )}

      {/* Row 3: tags + last activity */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-h-[22px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold max-w-[110px] truncate"
              style={{ color: getTagColor(tag) }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getTagColor(tag) }} />
              {tag}
            </span>
          ))}
        </div>
        <span className="inline-flex items-center gap-1 shrink-0 text-[11px] font-bold text-slate-500" title="Ultima interaccion">
          <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: accent }} />
          {formatRelative(lastMs)}
        </span>
      </div>

      {lockedByOther && (
        <div className="absolute inset-0 rounded-xl bg-slate-900/45 border border-slate-700/40 pointer-events-none flex items-center justify-center px-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-950/80 text-white text-[11px] font-bold px-3 py-1.5 max-w-full">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M7 11V8a5 5 0 0 1 10 0v3" />
              <rect x="5" y="11" width="14" height="10" rx="2" />
            </svg>
            <span className="truncate">{lockLabel ?? "Atendido"}</span>
          </div>
        </div>
      )}
    </article>
  );
}
