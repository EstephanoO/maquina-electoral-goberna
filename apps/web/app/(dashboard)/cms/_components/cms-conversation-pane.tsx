"use client";

/**
 * CMS Conversation Pane — WhatsApp-style chat pane with message bubbles,
 * compose input, action buttons (hablado/respondieron/archive), and
 * Chrome extension integration for opening WhatsApp.
 *
 * This is the center panel of the 3-pane CMS layout.
 */

import { memo, useEffect, useRef, useMemo, useState, useCallback } from "react";
import type { CmsContact, CmsStatus, CmsTwilioMessage, CmsTwilioStatus } from "@/lib/services/cms";
import { CmsEmptyState } from "./cms-empty-state";

type CmsConversationPaneProps = {
  contact: CmsContact | null;
  messages: CmsTwilioMessage[];
  loadingMessages: boolean;
  messagesError: string | null;
  draft: string;
  sending: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRefreshMessages: () => void;
  onMarkHablado: (id: string) => void;
  onMarkRespondieron: (id: string) => void;
  onArchive: (id: string) => void;
  onRevert: (id: string) => void;
  onOpenWhatsApp: (phone: string, text?: string) => void;
  onOpenProfile: (contact: CmsContact) => void;
  actionLoading: string | null;
  /** Tags management props */
  contactTags: string[];
  availableTags: string[];
  onAssignTag: (contactId: string, tagName: string) => void;
  onRemoveTag: (contactId: string, tagName: string) => void;
  onCreateTag: (name: string) => void;
};

const STATUS_ACTIONS: Record<CmsStatus, { primary: string; primaryAction: string; secondary?: string; secondaryAction?: string }> = {
  nuevo: { primary: "Marcar Hablado", primaryAction: "hablado" },
  hablado: { primary: "Marcar Contesto", primaryAction: "respondieron", secondary: "Deshacer", secondaryAction: "revert" },
  respondieron: { primary: "Archivar", primaryAction: "archive", secondary: "Deshacer", secondaryAction: "revert" },
  archivado: { primary: "Desarchivar", primaryAction: "revert" },
};

const STATUS_LABELS: Record<CmsStatus, { label: string; color: string; bg: string }> = {
  nuevo: { label: "Nuevo", color: "text-sky-700", bg: "bg-sky-50 border-sky-200" },
  hablado: { label: "Hablado", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  respondieron: { label: "Contesto", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  archivado: { label: "Archivado", color: "text-slate-500", bg: "bg-slate-50 border-slate-200" },
};

function formatPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return `+51 ${digits}`;
  if (digits.length === 11 && digits.startsWith("51")) return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  return phone;
}

function formatMessageTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function formatDayLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return "Hoy";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

function sameDay(a: string, b: string): boolean {
  try {
    return new Date(a).toDateString() === new Date(b).toDateString();
  } catch {
    return false;
  }
}

function getStatusIcon(status: CmsTwilioStatus): { symbol: string; color: string; title: string } {
  switch (status) {
    case "queued": return { symbol: "\u{1F551}", color: "text-slate-400", title: "En cola" };
    case "sent": return { symbol: "\u2713", color: "text-slate-400", title: "Enviado" };
    case "delivered": return { symbol: "\u2713\u2713", color: "text-slate-400", title: "Entregado" };
    case "read": return { symbol: "\u2713\u2713", color: "text-sky-500", title: "Leido" };
    case "failed": return { symbol: "\u2717", color: "text-red-500", title: "Fallido" };
    case "undelivered": return { symbol: "\u2717", color: "text-red-400", title: "No entregado" };
    case "received": return { symbol: "\u2193", color: "text-emerald-500", title: "Recibido" };
    default: return { symbol: "?", color: "text-slate-300", title: status };
  }
}

export const CmsConversationPane = memo(function CmsConversationPane({
  contact,
  messages,
  loadingMessages,
  messagesError,
  draft,
  sending,
  onDraftChange,
  onSend,
  onRefreshMessages,
  onMarkHablado,
  onMarkRespondieron,
  onArchive,
  onRevert,
  onOpenWhatsApp,
  onOpenProfile,
  actionLoading,
  contactTags,
  availableTags,
  onAssignTag,
  onRemoveTag,
  onCreateTag,
}: CmsConversationPaneProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  // Scroll to bottom on new messages
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length !== prevMsgCount.current) {
      prevMsgCount.current = messages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Focus input when contact changes
  useEffect(() => {
    if (contact) inputRef.current?.focus();
  }, [contact]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend],
  );

  const handleAction = useCallback(
    (action: string) => {
      if (!contact) return;
      switch (action) {
        case "hablado": onMarkHablado(contact.id); break;
        case "respondieron": onMarkRespondieron(contact.id); break;
        case "archive": onArchive(contact.id); break;
        case "revert": onRevert(contact.id); break;
      }
    },
    [contact, onMarkHablado, onMarkRespondieron, onArchive, onRevert],
  );

  const handleCreateAndAssignTag = useCallback(() => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (!trimmed || !contact) return;
    if (!availableTags.includes(trimmed)) onCreateTag(trimmed);
    onAssignTag(contact.id, trimmed);
    setNewTagInput("");
  }, [newTagInput, contact, availableTags, onCreateTag, onAssignTag]);

  // Build timeline with day separators
  const timeline = useMemo(() => {
    const rows: Array<{ type: "day"; label: string } | { type: "message"; msg: CmsTwilioMessage }> = [];
    let lastDate = "";
    for (const msg of messages) {
      if (!lastDate || !sameDay(lastDate, msg.created_at)) {
        rows.push({ type: "day", label: formatDayLabel(msg.created_at) });
        lastDate = msg.created_at;
      }
      rows.push({ type: "message", msg });
    }
    return rows;
  }, [messages]);

  if (!contact) {
    return <CmsEmptyState variant="no-selection" />;
  }

  const statusInfo = STATUS_LABELS[contact.cms_status] || STATUS_LABELS.nuevo;
  const actions = STATUS_ACTIONS[contact.cms_status] || STATUS_ACTIONS.nuevo;
  const phone = formatPhone(contact.telefono);
  const isArchived = contact.cms_status === "archivado";

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-surface border-b border-border/80">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onOpenProfile(contact)}
            className="shrink-0 w-9 h-9 rounded-full bg-[var(--goberna-blue-100)] flex items-center justify-center text-xs font-bold text-[var(--goberna-blue-700)] hover:ring-2 hover:ring-[var(--goberna-blue-300)] transition-all"
          >
            {(contact.nombre || "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
          </button>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-text-primary truncate">{contact.nombre || "Sin nombre"}</p>
            {phone && (
              <button
                type="button"
                onClick={() => onOpenWhatsApp(contact.telefono)}
                className="text-[11px] text-emerald-600 font-medium hover:underline flex items-center gap-1"
              >
                <WhatsAppIcon /> {phone}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge */}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusInfo.bg} ${statusInfo.color}`}>
            {statusInfo.label}
          </span>

          {/* Tags toggle */}
          <button
            type="button"
            onClick={() => setShowTagPanel(!showTagPanel)}
            className={`p-1.5 rounded-lg transition-colors ${
              showTagPanel ? "bg-[var(--goberna-blue-100)] text-[var(--goberna-blue-700)]" : "text-text-tertiary hover:bg-surface-active"
            }`}
            title="Etiquetas"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <title>Etiquetas</title>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </button>

          {/* Action buttons */}
          {actions.secondary && (
            <button
              type="button"
              onClick={() => handleAction(actions.secondaryAction!)}
              disabled={!!actionLoading}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-text-tertiary bg-surface-active hover:bg-surface-active disabled:opacity-40 transition-colors"
            >
              {actionLoading === actions.secondaryAction ? "..." : actions.secondary}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleAction(actions.primaryAction)}
            disabled={!!actionLoading}
            className="px-3 py-1 rounded-lg text-[11px] font-semibold text-white bg-[var(--goberna-blue-700)] hover:bg-[var(--goberna-blue-800)] disabled:opacity-40 transition-colors"
          >
            {actionLoading === actions.primaryAction ? "..." : actions.primary}
          </button>
        </div>
      </div>

      {/* ── Tags panel (inline, below header) ── */}
      {showTagPanel && (
        <div className="shrink-0 px-4 py-2 bg-surface border-b border-surface-active flex items-center gap-2 flex-wrap">
          {contactTags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--goberna-blue-50)] text-[var(--goberna-blue-700)] text-[10px] font-medium">
              {tag}
              <button type="button" onClick={() => onRemoveTag(contact.id, tag)} className="text-[9px] opacity-60 hover:opacity-100">x</button>
            </span>
          ))}
          {/* Quick assign from available */}
          {availableTags.filter((t) => !contactTags.includes(t)).slice(0, 5).map((tag) => (
            <button
              type="button"
              key={tag}
              onClick={() => onAssignTag(contact.id, tag)}
              className="px-2 py-0.5 rounded-full border border-dashed border-border-strong text-[10px] text-text-tertiary hover:border-[var(--goberna-blue-400)] hover:text-[var(--goberna-blue-600)] transition-colors"
            >
              + {tag}
            </button>
          ))}
          {/* Create new tag inline */}
          <div className="inline-flex items-center gap-1">
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateAndAssignTag(); }}
              placeholder="Nueva..."
              className="w-20 text-[10px] px-1.5 py-0.5 rounded border border-border outline-none focus:border-[var(--goberna-blue-400)] placeholder:text-text-tertiary"
            />
          </div>
        </div>
      )}

      {/* ── Messages area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loadingMessages && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-border border-t-[var(--goberna-blue-500)] rounded-full animate-spin" />
          </div>
        )}

        {messagesError && !loadingMessages && (
          <div className="text-center py-6">
            <p className="text-xs text-red-400 mb-2">{messagesError}</p>
            <button type="button" onClick={onRefreshMessages} className="text-xs text-[var(--goberna-blue-600)] hover:underline">
              Reintentar
            </button>
          </div>
        )}

        {!loadingMessages && !messagesError && messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-text-tertiary mb-1">Sin mensajes WhatsApp</p>
            <p className="text-[11px] text-text-tertiary">Envia un mensaje via Twilio o abre WhatsApp Web</p>
          </div>
        )}

        {timeline.map((row, idx) => {
          if (row.type === "day") {
            return (
              <div key={`day-${row.label}`} className="flex items-center justify-center my-3">
                <span className="px-3 py-1 bg-surface rounded-full text-[10px] font-medium text-text-tertiary shadow-sm">
                  {row.label}
                </span>
              </div>
            );
          }

          const msg = row.msg;
          const isOutbound = msg.direction === "outbound";
          const statusIcon = isOutbound ? getStatusIcon(msg.status) : null;

          return (
            <div key={msg.id || `msg-${String(idx)}`} className={`flex mb-1.5 ${isOutbound ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-3 py-1.5 rounded-xl text-[13px] leading-relaxed ${
                isOutbound
                  ? "bg-[#d9fdd3] text-text-primary rounded-tr-sm"
                  : "bg-surface text-text-primary rounded-tl-sm shadow-sm"
              }`}>
                <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                <div className={`flex items-center gap-1 mt-0.5 ${isOutbound ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] text-text-tertiary tabular-nums">{formatMessageTime(msg.created_at)}</span>
                  {statusIcon && (
                    <span className={`text-[10px] ${statusIcon.color}`} title={statusIcon.title}>{statusIcon.symbol}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Compose bar ── */}
      {!isArchived && (
        <div className="shrink-0 px-4 py-2 bg-surface border-t border-border/80">
          <div className="flex items-end gap-2">
            {/* Open WhatsApp button */}
            <button
              type="button"
              onClick={() => onOpenWhatsApp(contact.telefono, draft || undefined)}
              className="shrink-0 p-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              title="Abrir en WhatsApp Web (extension)"
            >
              <WhatsAppIcon size={18} />
            </button>

            {/* Text input */}
            <div className="flex-1 flex items-end bg-surface-hover rounded-2xl border border-border focus-within:border-[var(--goberna-blue-400)] transition-colors">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 px-3 py-2 text-[13px] bg-transparent outline-none resize-none max-h-24 placeholder:text-text-tertiary"
              />
            </div>

            {/* Send button (Twilio) */}
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !draft.trim()}
              className="shrink-0 p-2 rounded-full bg-[var(--goberna-blue-700)] text-white hover:bg-[var(--goberna-blue-800)] disabled:opacity-30 disabled:cursor-default transition-colors"
              title="Enviar via Twilio"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <title>Enviar</title>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>

          <p className="text-[9px] text-text-tertiary mt-1 text-center">
            Boton verde = WhatsApp Web (extension) &middot; Boton azul = Twilio API
          </p>
        </div>
      )}
    </div>
  );
});

function WhatsAppIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <title>WhatsApp</title>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .613.613l4.458-1.495A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.312-.727-5.994-1.96l-.418-.307-3.296 1.104 1.104-3.296-.307-.418A9.935 9.935 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
    </svg>
  );
}
