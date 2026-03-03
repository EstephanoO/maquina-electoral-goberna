"use client";

/**
 * CMS Contact Card — A single contact row in the sidebar list.
 * WhatsApp-style compact layout with name, phone, status badge, preview text.
 */

import { useMemo } from "react";
import type { CmsContact, CmsStatus } from "@/lib/services/cms";

type CmsContactCardProps = {
  contact: CmsContact;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpenProfile: (contact: CmsContact) => void;
};

const STATUS_CONFIG: Record<CmsStatus, { label: string; dot: string; text: string }> = {
  nuevo: { label: "Nuevo", dot: "bg-sky-500", text: "text-sky-700" },
  hablado: { label: "Hablado", dot: "bg-amber-500", text: "text-amber-700" },
  respondieron: { label: "Contesto", dot: "bg-emerald-500", text: "text-emerald-700" },
  archivado: { label: "Archivado", dot: "bg-slate-400", text: "text-slate-500" },
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return `+51 ${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  return phone;
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

function getPreview(c: CmsContact): string {
  const notes = c.cms_operator_notes;
  if (notes?.comentarios) return notes.comentarios;
  if (c.candidato_preferido) return `Pref: ${c.candidato_preferido}`;
  if (c.zona) return c.zona;
  if (c.encuestador) return `Enc: ${c.encuestador}`;
  return "Sin interacciones aun";
}

function getRelevantTimestamp(c: CmsContact): string | null {
  if (c.cms_respondieron_at) return c.cms_respondieron_at;
  if (c.cms_hablado_at) return c.cms_hablado_at;
  if (c.cms_claimed_at) return c.cms_claimed_at;
  return c.created_at;
}

export function CmsContactCard({ contact, selected, onSelect, onOpenProfile }: CmsContactCardProps) {
  const status = STATUS_CONFIG[contact.cms_status] || STATUS_CONFIG.nuevo;
  const initials = useMemo(() => getInitials(contact.nombre || "?"), [contact.nombre]);
  const preview = useMemo(() => getPreview(contact), [contact]);
  const timestamp = formatTimestamp(getRelevantTimestamp(contact));
  const phone = formatPhone(contact.telefono);

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-100 ${
        selected
          ? "bg-[var(--goberna-blue-50)] border-l-2 border-l-[var(--goberna-blue-500)]"
          : "hover:bg-slate-50/80 border-l-2 border-l-transparent"
      }`}
    >
      {/* Avatar */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenProfile(contact); }}
        className="shrink-0 w-10 h-10 rounded-full bg-[var(--goberna-blue-100)] flex items-center justify-center text-xs font-bold text-[var(--goberna-blue-700)] hover:ring-2 hover:ring-[var(--goberna-blue-300)] transition-all"
        title="Ver perfil"
      >
        {initials}
      </button>

      {/* Body */}
      <button
        type="button"
        onClick={() => onSelect(contact.id)}
        className="flex-1 min-w-0 text-left"
      >
        {/* Row 1: Name + timestamp */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-slate-800 truncate">
            {contact.nombre || "Sin nombre"}
          </span>
          {timestamp && (
            <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{timestamp}</span>
          )}
        </div>

        {/* Row 2: Phone */}
        {phone && (
          <p className="text-[11px] text-emerald-600 font-medium mt-0.5 truncate">{phone}</p>
        )}

        {/* Row 3: Preview + status badge */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-[11px] text-slate-400 truncate flex-1">{preview}</p>
          <span className="flex items-center gap-1 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            <span className={`text-[10px] font-medium ${status.text}`}>{status.label}</span>
          </span>
        </div>

        {/* Tags */}
        {contact.cms_tags && contact.cms_tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {contact.cms_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-px text-[9px] font-medium rounded-full bg-slate-100 text-slate-500 truncate max-w-[80px]"
              >
                {tag}
              </span>
            ))}
            {contact.cms_tags.length > 3 && (
              <span className="text-[9px] text-slate-400">+{contact.cms_tags.length - 3}</span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
