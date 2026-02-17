"use client";

import { useRef } from "react";
import type { FormRecord } from "@/lib/services";

/* ========== Types ========== */

type Props = {
  forms: FormRecord[];
  selectedAgentName: string | null;
  primaryColor: string;
  open: boolean;
  onClose: () => void;
  onFlyTo?: (lng: number, lat: number) => void;
};

/* ========== Constants ========== */

const WIDTH = 380;

/* ========== Component ========== */

export function DataPanel({ forms, selectedAgentName, primaryColor, open, onClose, onFlyTo }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll to top when panel opens or content changes
  const prevCount = useRef(forms.length);
  if (forms.length !== prevCount.current) {
    prevCount.current = forms.length;
    listRef.current?.scrollTo(0, 0);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: WIDTH,
        transform: open ? "translateX(0)" : `translateX(${WIDTH}px)`,
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        backgroundColor: "#ffffff",
        borderLeft: "1px solid #e2e8f0",
        boxShadow: open ? "-4px 0 20px rgba(0,0,0,0.08)" : "none",
        display: "flex",
        flexDirection: "column",
        zIndex: 15,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={{ ...S.headerIcon, backgroundColor: `${primaryColor}14`, color: primaryColor }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Datos</title><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div>
            <h3 style={S.title}>{selectedAgentName ? `Datos: ${selectedAgentName}` : "Registros"}</h3>
            <span style={{ ...S.count, color: primaryColor }}>{forms.length} resultados</span>
          </div>
        </div>
        <button type="button" onClick={onClose} style={S.closeBtn} aria-label="Cerrar panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><title>Cerrar</title><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Content */}
      <div ref={listRef} style={S.list}>
        {forms.length === 0 ? (
          <div style={S.empty}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><title>Sin datos</title><circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/></svg>
            <span>Sin datos capturados</span>
          </div>
        ) : (
          forms.slice(0, 150).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                if (onFlyTo && f.x && f.y) {
                  // UTM coords — the parent handles conversion via flyTo
                }
              }}
              style={S.card}
            >
              {/* Row 1: Name + time */}
              <div style={S.cardTop}>
                <span style={S.cardName}>{f.nombre || "Sin nombre"}</span>
                <span style={S.cardTime}>
                  {new Date(f.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {/* Row 2: details */}
              <div style={S.cardDetails}>
                {f.telefono && (
                  <span style={S.cardTag}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><title>Tel</title><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    {f.telefono}
                  </span>
                )}
                {f.encuestador && (
                  <span style={S.cardTag}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><title>Agente</title><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    {f.encuestador}
                  </span>
                )}
                {f.zona && (
                  <span style={S.cardTag}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><title>Zona</title><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {f.zona}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer count */}
      {forms.length > 150 && (
        <div style={S.footer}>
          Mostrando 150 de {forms.length} registros
        </div>
      )}
    </div>
  );
}

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid #f1f5f9",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { margin: 0, fontSize: 13, fontWeight: 700, color: "#1e293b", lineHeight: 1.2 },
  count: { fontSize: 11, fontWeight: 600, lineHeight: 1.2 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    border: "1px solid #e2e8f0",
    backgroundColor: "#f8fafc",
    color: "#94a3b8",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px 12px",
  },
  empty: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 48,
    color: "#94a3b8",
    fontSize: 13,
  },

  card: {
    width: "100%",
    textAlign: "left" as const,
    padding: "10px 12px",
    marginBottom: 4,
    borderRadius: 8,
    border: "1px solid #f1f5f9",
    backgroundColor: "#ffffff",
    cursor: "default",
    transition: "background 0.12s ease, border-color 0.12s ease",
    display: "block",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#1e293b",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  cardTime: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: 500,
    flexShrink: 0,
    marginLeft: 8,
  },
  cardDetails: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  cardTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: "#64748b",
    backgroundColor: "#f8fafc",
    padding: "2px 7px",
    borderRadius: 5,
    border: "1px solid #f1f5f9",
  },

  footer: {
    padding: "8px 16px",
    fontSize: 10,
    color: "#94a3b8",
    textAlign: "center" as const,
    borderTop: "1px solid #f1f5f9",
    flexShrink: 0,
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
};
