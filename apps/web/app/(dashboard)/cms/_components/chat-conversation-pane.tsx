"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CmsContact, CmsTwilioMessage } from "@/lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type Props = {
  contact: CmsContact | null;
  sseConnected: boolean;
  messages: CmsTwilioMessage[];
  loadingMessages: boolean;
  messagesError: string | null;
  draft: string;
  sending: boolean;
  onOpenProfile: (contact: CmsContact) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRefreshMessages: () => void;
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

function buildWhatsAppUrl(phone: string, nombre: string): string {
  const normalized = formatPhone(phone).replace("+", "");
  const text = encodeURIComponent(`Hola ${nombre}`);
  return `https://wa.me/${normalized}?text=${text}`;
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

type TimelineRow =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; message: CmsTwilioMessage };

export function ChatConversationPane({
  contact,
  sseConnected,
  messages,
  loadingMessages,
  messagesError,
  draft,
  sending,
  onOpenProfile,
  onDraftChange,
  onSend,
  onRefreshMessages,
}: Props) {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          height: 72,
          padding: "0 16px",
          borderBottom: "1px solid #d6dde6",
          background: "#f0f2f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
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

          <div style={{ minWidth: 0 }}>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "#64748b",
                marginTop: 1,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: sseConnected ? "#16a34a" : "#f59e0b",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sseConnected ? "Tiempo real conectado" : "Reconectando tiempo real..."}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {contact.telefono && (
            <a
              href={buildWhatsAppUrl(contact.telefono, name)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
                color: "#047857",
                background: "#d1fae5",
                border: "1px solid #a7f3d0",
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <title>Abrir WhatsApp</title>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
              </svg>
              {formatPhone(contact.telefono)}
            </a>
          )}

          <button
            type="button"
            style={iconButtonStyle}
            aria-label="Recargar mensajes"
            title="Recargar mensajes"
            onClick={onRefreshMessages}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <title>Recargar</title>
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

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
          const statusText = MESSAGE_STATUS_LABELS[message.status] ?? message.status;

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
                  gap: 8,
                  fontSize: 11,
                  color: "#64748b",
                }}
              >
                <span>{formatMessageTime(message.created_at)}</span>
                {outbound && <span>{statusText}</span>}
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
