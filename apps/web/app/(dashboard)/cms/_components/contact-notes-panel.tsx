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

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 380,
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
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", fontFamily: "monospace", marginTop: 4 }}>
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

      {/* Form */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="local_votacion"
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            Local de Votacion
          </label>
          <input
            id="local_votacion"
            type="text"
            value={localVotacion}
            onChange={(e) => setLocalVotacion(e.target.value)}
            placeholder="Ej: IE San Juan"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: FONT,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="domicilio"
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            Domicilio
          </label>
          <input
            id="domicilio"
            type="text"
            value={domicilio}
            onChange={(e) => setDomicilio(e.target.value)}
            placeholder="Direccion del contacto"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: FONT,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="comentarios"
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            Comentarios
          </label>
          <textarea
            id="comentarios"
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Notas sobre la conversacion..."
            rows={4}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: FONT,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: "var(--color-surface)",
              color: "var(--color-text-primary)",
              resize: "vertical",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Footer */}
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
    </div>
  );
}
