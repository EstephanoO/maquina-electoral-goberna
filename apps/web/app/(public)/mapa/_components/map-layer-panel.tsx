"use client";

import { FONT_STACK } from "@/lib/constants";

type LayerItem = {
  id: string;
  label: string;
  description: string;
  available: boolean;
};

const LAYERS: LayerItem[] = [
  {
    id: "division-politica",
    label: "Division Politica",
    description: "Departamentos, provincias y distritos del Peru. Haz click para navegar.",
    available: true,
  },
  {
    id: "locales-votacion",
    label: "Locales de Votacion",
    description: "Ubicacion de locales de votacion a nivel nacional.",
    available: false,
  },
  {
    id: "candidatos-zona",
    label: "Candidatos por Zona",
    description: "Candidatos asignados a cada circunscripcion electoral.",
    available: false,
  },
  {
    id: "resultados",
    label: "Resultados Electorales",
    description: "Resultados historicos por zona geopolitica.",
    available: false,
  },
];

export function MapLayerPanel() {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 10,
        width: 280,
        background: "rgba(255,255,255,0.97)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        overflow: "hidden",
        fontFamily: FONT_STACK,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          background: "var(--goberna-blue-950)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", letterSpacing: 0.5 }}>
            Capas de Datos
          </span>
        </div>
      </div>

      {/* Layer list */}
      <div style={{ padding: "8px 0" }}>
        {LAYERS.map((layer) => (
          <div
            key={layer.id}
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--color-border)",
              opacity: layer.available ? 1 : 0.5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {layer.label}
              </span>
              {layer.available ? (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: "rgba(22,163,74,0.08)",
                    color: "var(--color-success)",
                  }}
                >
                  Activo
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: "rgba(148,163,184,0.12)",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Proximamente
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, lineHeight: 1.5, color: "var(--color-text-secondary)", margin: 0 }}>
              {layer.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
