"use client";

import { useState } from "react";
import type { CmsContact } from "../../../../lib/services/cms";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type ContactNotesPanelProps = {
  contact: CmsContact;
  onSave: (id: string, notes: { local_votacion: string; domicilio: string; comentarios: string }) => void;
  onClose: () => void;
  saving: boolean;
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 12,
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

  const nombre = contact.nombre || "Sin nombre";
  const isReadOnly = contact.cms_status === "archivado";

  // Context info
  const contextItems: Array<{ label: string; value: string }> = [];
  if (contact.encuestador) contextItems.push({ label: "Entrevistador", value: contact.encuestador });
  if (contact.zona) contextItems.push({ label: "Zona / Ubicacion", value: contact.zona });
  if (contact.candidato_preferido) contextItems.push({ label: "Candidato preferido", value: contact.candidato_preferido });
  contextItems.push({ label: "Agregado", value: formatDateTime(contact.created_at) });
  if (contact.cms_hablado_at) contextItems.push({ label: "Hablado", value: formatDateTime(contact.cms_hablado_at) });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 400,
        height: "100vh",
        background: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-lg)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        animation: "goberna-slide-in .25s ease-out",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
            {nombre}
          </div>
          <div style={{ fontSize: 13, color: "#25D366", fontFamily: "monospace", marginTop: 4, fontWeight: 600 }}>
            {contact.telefono}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: "var(--color-surface)",
            cursor: "pointer",
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
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="local_votacion" style={LABEL_STYLE}>
            Local de Votacion
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
            placeholder="Direccion del contacto"
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
            placeholder="Notas sobre la conversacion..."
            rows={4}
            readOnly={isReadOnly}
            style={{ ...INPUT_STYLE, resize: "vertical", opacity: isReadOnly ? 0.6 : 1 }}
          />
        </div>
      </div>

      {/* Footer */}
      {!isReadOnly && (
        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--color-border)" }}>
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
              width: "100%",
              padding: "12px",
              fontSize: 14,
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
