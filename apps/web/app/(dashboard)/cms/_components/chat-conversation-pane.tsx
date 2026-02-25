"use client";

import type { CmsContact } from "@/lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type Props = {
  contact: CmsContact | null;
  sseConnected: boolean;
  onOpenProfile: (contact: CmsContact) => void;
};

const STATUS_LABELS: Record<CmsContact["cms_status"], string> = {
  nuevo: "Nuevo",
  hablado: "Hablado",
  respondieron: "Contesto",
  archivado: "Archivado",
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

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

export function ChatConversationPane({ contact, sseConnected, onOpenProfile }: Props) {
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
  const statusLabel = STATUS_LABELS[contact.cms_status] ?? STATUS_LABELS.nuevo;
  const activityDate = formatDateTime(
    contact.cms_respondieron_at ?? contact.cms_hablado_at ?? contact.created_at,
  );
  const notes = contact.cms_operator_notes;

  const contextLines = [
    contact.zona ? `Zona: ${contact.zona}` : "",
    contact.distrito ? `Distrito: ${contact.distrito}` : "",
    contact.candidato_preferido ? `Candidato preferido: ${contact.candidato_preferido}` : "",
    contact.encuestador ? `Encuestador: ${contact.encuestador}` : "",
  ].filter(Boolean);

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
                {sseConnected ? "Esperando mensajes..." : "Reconectando tiempo real..."}
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
            disabled
            style={iconButtonStyle}
            aria-label="Buscar en la conversacion"
            title="Buscar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <title>Buscar</title>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          <button
            type="button"
            disabled
            style={iconButtonStyle}
            aria-label="Opciones"
            title="Opciones"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <title>Opciones</title>
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      </div>

      <div
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
            fontSize: 13,
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.2)",
          }}
        >
          Conectando al API de mensajeria.
        </div>

        <div
          style={{
            alignSelf: "flex-start",
            maxWidth: "min(540px, 85%)",
            background: "#ffffff",
            border: "1px solid #d6dde6",
            borderRadius: 10,
            padding: "10px 12px",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
            Resumen del contacto
          </div>
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
            Estado actual: <strong>{statusLabel}</strong>
            {activityDate ? ` · ${activityDate}` : ""}
          </div>
          {contextLines.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
              {contextLines.join(" · ")}
            </div>
          )}
        </div>

        {notes?.comentarios?.trim() && (
          <div
            style={{
              alignSelf: "flex-end",
              maxWidth: "min(520px, 85%)",
              background: "#dcfce7",
              border: "1px solid #86efac",
              borderRadius: 10,
              padding: "10px 12px",
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 4 }}>
              Nota del operador
            </div>
            <div style={{ fontSize: 13, color: "#14532d", whiteSpace: "pre-wrap" }}>
              {notes.comentarios}
            </div>
          </div>
        )}
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
          readOnly
          disabled
          value=""
          placeholder="Escribe un mensaje"
          style={{
            flex: 1,
            minWidth: 0,
            border: "1px solid #d6dde6",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 16,
            fontFamily: FONT,
            background: "#ffffff",
            color: "#64748b",
          }}
        />

        <button type="button" disabled style={iconButtonStyle} aria-label="Enviar">
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
  cursor: "default",
};
