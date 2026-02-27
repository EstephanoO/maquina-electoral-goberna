"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CmsContact, CmsTwilioMessage } from "@/lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";
const TAG_COLOR_PALETTE = [
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

type Props = {
  contact: CmsContact | null;
  messages: CmsTwilioMessage[];
  loadingMessages: boolean;
  messagesError: string | null;
  draft: string;
  sending: boolean;
  onOpenProfile: (contact: CmsContact) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRefreshMessages: () => void;
  onArchiveContact: (contactId: string) => void;
  archiving: boolean;
  contactTags: string[];
  availableTags: string[];
  onCreateTag: (name: string) => string | null;
  onAssignTag: (contactId: string, tagName: string) => boolean;
  onRemoveTag: (contactId: string, tagName: string) => void;
  onGoPipeline: () => void;
  showMobileBackButton?: boolean;
  onBackToList?: () => void;
};

const CONTACT_STATUS_LABELS: Record<CmsContact["cms_status"], string> = {
  nuevo: "Nuevo",
  hablado: "Hablado",
  respondieron: "Contesto",
  archivado: "Archivado",
};

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leido",
  failed: "Error",
  undelivered: "No entregado",
  received: "Recibido",
};

type MessageStatusGlyph = "clock" | "single-check" | "double-check" | "error";

function getMessageStatusVisual(status: CmsTwilioMessage["status"]): {
  glyph: MessageStatusGlyph;
  color: string;
  label: string;
} {
  const label = MESSAGE_STATUS_LABELS[status] ?? status;

  switch (status) {
    case "queued":
      return { glyph: "clock", color: "#94a3b8", label };
    case "sent":
      return { glyph: "single-check", color: "#64748b", label };
    case "delivered":
      return { glyph: "double-check", color: "#64748b", label };
    case "read":
      return { glyph: "double-check", color: "#0ea5e9", label };
    case "failed":
    case "undelivered":
      return { glyph: "error", color: "#dc2626", label };
    default:
      return { glyph: "single-check", color: "#64748b", label };
  }
}

function MessageStatusIcon({ status }: { status: CmsTwilioMessage["status"] }) {
  const visual = getMessageStatusVisual(status);

  return (
    <span
      title={visual.label}
      aria-label={visual.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: visual.color,
        minWidth: 16,
      }}
    >
      {visual.glyph === "clock" && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <title>{visual.label}</title>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v5l3 1.8" />
        </svg>
      )}

      {visual.glyph === "single-check" && (
        <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.9">
          <title>{visual.label}</title>
          <path d="M1.3 5.8 4.6 9 12.7 1.5" />
        </svg>
      )}

      {visual.glyph === "double-check" && (
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" strokeWidth="1.8">
          <title>{visual.label}</title>
          <path d="M1 5.8 4.1 9 9.1 3.9" />
          <path d="M6.2 5.8 9.3 9 14.3 3.9" />
        </svg>
      )}

      {visual.glyph === "error" && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <title>{visual.label}</title>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.2 9.2 14.8 14.8" />
          <path d="M14.8 9.2 9.2 14.8" />
        </svg>
      )}
    </span>
  );
}

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return "SN";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatPhone(phone: string): string {
  if (!phone) return "";
  if (phone.startsWith("+")) return phone;
  return `+51${phone}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDateTime(dateStr: string | null): string {
  const date = parseDate(dateStr);
  if (!date) return "";
  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMessageTime(dateStr: string): string {
  const date = parseDate(dateStr);
  if (!date) return "--:--";
  return date.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function hashTag(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTagColor(tagName: string): string {
  const normalized = tagName.trim().toLowerCase();
  if (!normalized) return TAG_COLOR_PALETTE[0];
  return TAG_COLOR_PALETTE[hashTag(normalized) % TAG_COLOR_PALETTE.length];
}

type TimelineRow =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: CmsTwilioMessage };

export function ChatConversationPane({
  contact,
  messages,
  loadingMessages,
  messagesError,
  draft,
  sending,
  onOpenProfile,
  onDraftChange,
  onSend,
  onRefreshMessages,
  onArchiveContact,
  archiving,
  contactTags,
  availableTags,
  onCreateTag,
  onAssignTag,
  onRemoveTag,
  onGoPipeline,
  showMobileBackButton = false,
  onBackToList,
}: Props) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [tagsPanelOpen, setTagsPanelOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const timeline = useMemo<TimelineRow[]>(() => {
    const rows: TimelineRow[] = [];
    let lastDay: Date | null = null;

    for (const message of messages) {
      const createdAt = parseDate(message.created_at);
      if (createdAt) {
        if (!lastDay || !sameDay(lastDay, createdAt)) {
          rows.push({
            type: "day",
            key: `day-${createdAt.toISOString()}`,
            label: formatDayLabel(createdAt),
          });
          lastDay = createdAt;
        }
      }

      rows.push({
        type: "message",
        key: `msg-${message.id}`,
        message,
      });
    }

    return rows;
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [timeline.length, contact?.id]);

  useEffect(() => {
    setTagsPanelOpen(false);
    setNewTagName("");
  }, [contact?.id]);

  if (!contact) {
    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
          color: "#64748b",
          padding: 24,
        }}
      >
        Selecciona un contacto para ver la conversacion.
      </div>
    );
  }

  const name = contact.nombre?.trim() || "Sin nombre";
  const statusLabel = CONTACT_STATUS_LABELS[contact.cms_status] ?? CONTACT_STATUS_LABELS.nuevo;
  const activityDate = formatDateTime(
    contact.cms_respondieron_at ?? contact.cms_hablado_at ?? contact.created_at,
  );
  const canSend = Boolean(draft.trim()) && !sending;
  const selectedTagKeys = new Set(contactTags.map((tag) => tag.toLowerCase()));

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        fontFamily: FONT,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          minHeight: 82,
          padding: "10px 16px",
          borderBottom: "1px solid #d6dde6",
          background: "#f0f2f5",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
            flex: 1,
          }}
        >
          {showMobileBackButton && onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              title="Volver a contactos"
              aria-label="Volver a contactos"
              style={{
                ...iconButtonStyle,
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <title>Volver</title>
                <path d="M15 18 9 12l6-6" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenProfile(contact)}
            title="Ver o editar contacto"
            aria-label={`Ver o editar ${name}`}
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "1px solid #d7e0ec",
              background: "#dbe3ec",
              color: "#1e293b",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {getInitials(name)}
          </button>

          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#0f172a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>

            {contact.telefono && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  color: "#25D366",
                  fontSize: 12,
                  fontWeight: 600,
                  width: "fit-content",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <title>WhatsApp</title>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {formatPhone(contact.telefono)}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={onGoPipeline}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              borderRadius: 999,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
            title="Ir a pipeline"
            aria-label="Ir a pipeline"
          >
            Pipeline
          </button>

          <button
            type="button"
            onClick={() => setTagsPanelOpen((prev) => !prev)}
            style={{
              border: "1px solid #cbd5e1",
              background: tagsPanelOpen ? "#e2e8f0" : "#ffffff",
              color: "#334155",
              borderRadius: 999,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
            title="Etiquetas del contacto"
          >
            Etiquetas ({contactTags.length})
          </button>

          <button
            type="button"
            disabled={archiving || contact.cms_status === "archivado"}
            onClick={() => {
              if (contact.cms_status === "archivado") return;
              const ok = window.confirm("¿Archivar este contacto?");
              if (ok) onArchiveContact(contact.id);
            }}
            style={{
              ...iconButtonStyle,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#be123c",
              borderRadius: 10,
              width: 34,
              height: 34,
              cursor: archiving || contact.cms_status === "archivado" ? "not-allowed" : "pointer",
              opacity: archiving || contact.cms_status === "archivado" ? 0.6 : 1,
            }}
            title={contact.cms_status === "archivado" ? "Contacto archivado" : "Archivar contacto"}
            aria-label={contact.cms_status === "archivado" ? "Contacto archivado" : "Archivar contacto"}
          >
            {archiving ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <title>Archivando</title>
                <circle cx="12" cy="12" r="9" strokeDasharray="10 12" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <title>Archivar</title>
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {tagsPanelOpen && (
        <>
          <button
            type="button"
            aria-label="Cerrar panel de etiquetas"
            onClick={() => setTagsPanelOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              border: "none",
              background: "rgba(15, 23, 42, 0.18)",
              zIndex: 20,
              padding: 0,
              margin: 0,
            }}
          />

          <aside
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(340px, 100%)",
              background: "#ffffff",
              borderLeft: "1px solid #d6dde6",
              boxShadow: "-8px 0 24px rgba(15, 23, 42, 0.18)",
              display: "flex",
              flexDirection: "column",
              zIndex: 21,
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Etiquetas del contacto</div>
                <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                  {contactTags.length} seleccionada{contactTags.length === 1 ? "" : "s"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTagsPanelOpen(false)}
                style={{
                  ...iconButtonStyle,
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#475569",
                }}
                aria-label="Cerrar panel de etiquetas"
                title="Cerrar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <title>Cerrar</title>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                gap: 8,
              }}
            >
              <input
                type="text"
                value={newTagName}
                placeholder="Nueva etiqueta"
                onChange={(event) => setNewTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const created = onCreateTag(newTagName);
                  if (!created) return;
                  onAssignTag(contact.id, created);
                  setNewTagName("");
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  fontFamily: FONT,
                  color: "#0f172a",
                  background: "#ffffff",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const created = onCreateTag(newTagName);
                  if (!created) return;
                  onAssignTag(contact.id, created);
                  setNewTagName("");
                }}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  background: "#ffffff",
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                Crear
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "8px 8px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {availableTags.length === 0 ? (
                <div style={{ padding: 8, fontSize: 12, color: "#64748b" }}>
                  Todavia no hay etiquetas disponibles.
                </div>
              ) : (
                availableTags.map((tag) => {
                  const checked = selectedTagKeys.has(tag.toLowerCase());
                  return (
                    <label
                      key={tag}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        borderRadius: 8,
                        padding: "8px 10px",
                        border: "1px solid #e2e8f0",
                        background: checked ? "#f8fafc" : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            onAssignTag(contact.id, tag);
                            return;
                          }
                          onRemoveTag(contact.id, tag);
                        }}
                      />
                      <span
                        aria-hidden
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: getTagColor(tag),
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: getTagColor(tag),
                          fontWeight: checked ? 700 : 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tag}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}

      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          backgroundColor: "#e8edf2",
          backgroundImage:
            "radial-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div
          style={{
            alignSelf: "center",
            background: "#1f2937",
            color: "#f8fafc",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.2)",
          }}
        >
          Estado: {statusLabel}{activityDate ? ` · ${activityDate}` : ""}
        </div>

        {loadingMessages && messages.length === 0 && (
          <div
            style={{
              alignSelf: "center",
              fontSize: 13,
              color: "#475569",
              background: "rgba(255,255,255,0.85)",
              border: "1px solid #d6dde6",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            Cargando mensajes...
          </div>
        )}

        {messagesError && (
          <div
            style={{
              alignSelf: "center",
              maxWidth: 520,
              width: "100%",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "10px 12px",
              color: "#991b1b",
              fontSize: 13,
            }}
          >
            <div>{messagesError}</div>
            <button
              type="button"
              onClick={onRefreshMessages}
              style={{
                marginTop: 8,
                border: "1px solid #fecaca",
                background: "#ffffff",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                cursor: "pointer",
                color: "#7f1d1d",
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {!loadingMessages && messages.length === 0 && !messagesError && (
          <div
            style={{
              alignSelf: "center",
              maxWidth: 520,
              width: "100%",
              background: "rgba(255,255,255,0.9)",
              border: "1px solid #d6dde6",
              borderRadius: 10,
              padding: "10px 12px",
              color: "#475569",
              fontSize: 13,
            }}
          >
            No hay mensajes para este contacto. Escribe para iniciar la conversacion.
          </div>
        )}

        {timeline.map((row) => {
          if (row.type === "day") {
            return (
              <div
                key={row.key}
                style={{
                  alignSelf: "center",
                  background: "rgba(15, 23, 42, 0.12)",
                  color: "#1e293b",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {row.label}
              </div>
            );
          }

          const { message } = row;
          const outbound = message.direction === "outbound";

          return (
            <div
              key={row.key}
              style={{
                alignSelf: outbound ? "flex-end" : "flex-start",
                maxWidth: "min(560px, 86%)",
                background: outbound ? "#dcfce7" : "#ffffff",
                border: outbound ? "1px solid #86efac" : "1px solid #d6dde6",
                borderRadius: 10,
                padding: "10px 12px",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
              }}
            >
              <div style={{ fontSize: 14, color: "#0f172a", whiteSpace: "pre-wrap" }}>
                {message.body}
              </div>

              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 6,
                  fontSize: 11,
                  color: "#64748b",
                }}
              >
                <span>{formatMessageTime(message.created_at)}</span>
                {outbound && <MessageStatusIcon status={message.status} />}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          borderTop: "1px solid #d6dde6",
          background: "#f0f2f5",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button type="button" disabled style={iconButtonStyle} aria-label="Emoji">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <title>Emoji</title>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>

        <button type="button" disabled style={iconButtonStyle} aria-label="Adjuntar archivo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <title>Adjuntar</title>
            <path d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
          </svg>
        </button>

        <input
          type="text"
          value={draft}
          placeholder="Escribe un mensaje"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            border: "1px solid #d6dde6",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 14,
            fontFamily: FONT,
            background: "#ffffff",
            color: "#0f172a",
          }}
        />

        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          style={{
            ...iconButtonStyle,
            color: canSend ? "#0f172a" : "#94a3b8",
            cursor: canSend ? "pointer" : "not-allowed",
          }}
          aria-label="Enviar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <title>Enviar</title>
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: "#64748b",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
