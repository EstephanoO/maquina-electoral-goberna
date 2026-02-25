"use client";

import { useState, useEffect } from "react";
import type { CmsContact } from "@/lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";
const PANEL_WIDTH = 400;

type ContactNotesPanelProps = {
  contact: CmsContact;
  onSave: (id: string, notes: { local_votacion: string; domicilio: string; comentarios: string }) => void;
  onClose: () => void;
  saving: boolean;
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: FONT,
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("es-PE", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return "—";
  }
}

// ── Status badge for panel header ─────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  nuevo: { label: "NUEVO", bg: "#dbeafe", color: "#1d4ed8" },
  hablado: { label: "HABLADO", bg: "#d1fae5", color: "#065f46" },
  respondieron: { label: "CONTESTÓ", bg: "#ede9fe", color: "#5b21b6" },
  archivado: { label: "ARCHIVADO", bg: "#f3f4f6", color: "#6b7280" },
};

export function ContactNotesPanel({ contact, onSave, onClose, saving }: ContactNotesPanelProps) {
  const [localVotacion, setLocalVotacion] = useState(
    (contact.cms_operator_notes?.local_votacion as string) || "",
  );
  const [domicilio, setDomicilio] = useState(
    (contact.cms_operator_notes?.domicilio as string) || "",
  );
  const [comentarios, setComentarios] = useState(
    (contact.cms_operator_notes?.comentarios as string) || "",
  );

  // Re-sync local state when the contact prop changes (e.g. SSE update)
  useEffect(() => {
    setLocalVotacion((contact.cms_operator_notes?.local_votacion as string) || "");
    setDomicilio((contact.cms_operator_notes?.domicilio as string) || "");
    setComentarios((contact.cms_operator_notes?.comentarios as string) || "");
  }, [contact.id, contact.cms_operator_notes]);

  const nombre = contact.nombre || "Sin nombre";
  const isReadOnly = contact.cms_status === "archivado";
  const statusCfg = STATUS_LABELS[contact.cms_status] ?? STATUS_LABELS.nuevo;

  // Context info
  const contextItems: Array<{ label: string; value: string }> = [];
  if (contact.encuestador) contextItems.push({ label: "Entrevistador", value: contact.encuestador });
  if (contact.zona) contextItems.push({ label: "Zona / Ubicación", value: contact.zona });
  if (contact.candidato_preferido) contextItems.push({ label: "Candidato preferido", value: contact.candidato_preferido });
  contextItems.push({ label: "Agregado", value: formatDateTime(contact.created_at) });
  if (contact.cms_hablado_at) contextItems.push({ label: "Hablado", value: formatDateTime(contact.cms_hablado_at) });
  if (contact.cms_respondieron_at) contextItems.push({ label: "Contestó", value: formatDateTime(contact.cms_respondieron_at) });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: `min(${PANEL_WIDTH}px, 100vw)`,
        height: "100vh",
        background: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border)",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        animation: "goberna-slide-in .2s ease-out",
      }}
    >
      <style>{`@keyframes goberna-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {nombre}
            </div>
            <span
              style={{
                display: "inline-block",
                padding: "2px 7px",
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.04em",
                borderRadius: 4,
                background: statusCfg.bg,
                color: statusCfg.color,
                flexShrink: 0,
              }}
            >
              {statusCfg.label}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#25D366", fontFamily: "monospace", fontWeight: 600 }}>
            {contact.telefono}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-surface)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round">
            <title>Cerrar</title>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {/* Context card */}
        {contextItems.length > 0 && (
          <div
            style={{
              marginBottom: 20,
              padding: 14,
              background: "var(--goberna-blue-50)",
              borderRadius: 8,
              border: "1px solid var(--goberna-blue-200, #bfdbfe)",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--goberna-blue-900)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Contexto del contacto
            </div>
            {contextItems.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 0",
                  borderBottom: "1px solid rgba(0,0,0,0.04)",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 600 }}>
                  {item.label}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-primary)", fontWeight: 500, textAlign: "right", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Editable notes */}
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          {isReadOnly ? "Notas del operador" : "Editar notas"}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="local_votacion" style={LABEL_STYLE}>
            Local de Votación
          </label>
          <input
            id="local_votacion"
            type="text"
            value={localVotacion}
            onChange={(e) => setLocalVotacion(e.target.value)}
            placeholder="Ej: IE San Juan"
            readOnly={isReadOnly}
            style={{ ...INPUT_STYLE, opacity: isReadOnly ? 0.6 : 1 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="domicilio" style={LABEL_STYLE}>
            Domicilio
          </label>
          <input
            id="domicilio"
            type="text"
            value={domicilio}
            onChange={(e) => setDomicilio(e.target.value)}
            placeholder="Dirección del contacto"
            readOnly={isReadOnly}
            style={{ ...INPUT_STYLE, opacity: isReadOnly ? 0.6 : 1 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="comentarios" style={LABEL_STYLE}>
            Comentarios
          </label>
          <textarea
            id="comentarios"
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Notas sobre la conversación..."
            rows={4}
            readOnly={isReadOnly}
            style={{ ...INPUT_STYLE, resize: "vertical", opacity: isReadOnly ? 0.6 : 1 }}
          />
        </div>
      </div>

      {/* Footer */}
      {!isReadOnly && (
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-border)", display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: FONT,
              color: "var(--color-text-secondary)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave(contact.id, {
                local_votacion: localVotacion,
                domicilio,
                comentarios,
              })
            }
            style={{
              flex: 2,
              padding: "10px",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: FONT,
              color: "#fff",
              background: saving ? "#93c5fd" : "var(--goberna-blue-900)",
              border: "none",
              borderRadius: 8,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      )}
    </div>
  );
}
