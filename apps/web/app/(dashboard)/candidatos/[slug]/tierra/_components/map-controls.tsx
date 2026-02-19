"use client";

import type { AgentStatus } from "./types";

/* ========== Types ========== */

type ActiveLayer = "datos" | "agentes" | "densidad" | null;

type Props = {
  activeLayer: ActiveLayer;
  showTable: boolean;
  onLayerChange: (layer: ActiveLayer) => void;
  onToggleTable: () => void;
  agentCount: number;
  formCount: number;
  primaryColor: string;
};

type LegendProps = {
  activeLayer: ActiveLayer;
};

/* ========== Professional colors ========== */
const C = {
  datos: "#2563eb",
  agents: "#0d9488",
  heat: "#b45309",
};

/* ========== Layer Controls ========== */

export function MapControls({ activeLayer, showTable, onLayerChange, onToggleTable, agentCount, formCount, primaryColor }: Props) {
  return (
    <div style={S.root}>
      <LayerBtn
        active={activeLayer === "datos"}
        onClick={() => onLayerChange(activeLayer === "datos" ? null : "datos")}
        label="Datos"
        count={formCount}
        activeColor={C.datos}
      />
      <LayerBtn
        active={activeLayer === "agentes"}
        onClick={() => onLayerChange(activeLayer === "agentes" ? null : "agentes")}
        label="Agentes"
        count={agentCount}
        activeColor={C.agents}
      />
      <LayerBtn
        active={activeLayer === "densidad"}
        onClick={() => onLayerChange(activeLayer === "densidad" ? null : "densidad")}
        label="Densidad"
        activeColor={C.heat}
      />
      <div style={S.divider} />
      <button
        type="button"
        onClick={onToggleTable}
        style={{
          ...S.btn,
          backgroundColor: showTable ? primaryColor : "#f8fafc",
          color: showTable ? "#fff" : "#475569",
          borderColor: showTable ? primaryColor : "#e2e8f0",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
          <path d="M9 3v18" />
        </svg>
        <span>Ver tabla</span>
      </button>
    </div>
  );
}

function LayerBtn({ active, onClick, label, count, activeColor }: { active: boolean; onClick: () => void; label: string; count?: number; activeColor: string }) {
  return (
    <button type="button" onClick={onClick} style={{ ...S.btn, backgroundColor: active ? activeColor : "#f8fafc", color: active ? "#fff" : "#475569", borderColor: active ? activeColor : "#e2e8f0" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: active ? "#fff" : activeColor, opacity: active ? 0.9 : 0.4, flexShrink: 0 }} />
      <span>{label}</span>
      {count != null && <span style={{ ...S.count, opacity: active ? 1 : 0.5 }}>{count}</span>}
    </button>
  );
}

/* ========== Legend ========== */

const STATUS_LEGEND: { status: AgentStatus; label: string; color: string }[] = [
  { status: "connected", label: "Conectado", color: "#0d9488" },
  { status: "idle", label: "Inactivo", color: "#d97706" },
  { status: "inactive", label: "Sin senal", color: "#64748b" },
];

export function MapLegend({ activeLayer }: LegendProps) {
  if (!activeLayer) return null;
  return (
    <div style={S.legend}>
      {activeLayer === "datos" && (
        <div style={S.legendItem}>
          <span style={{ ...S.legendDot, backgroundColor: C.datos }} />
          <span style={S.legendLabel}>Dato</span>
        </div>
      )}
      {activeLayer === "agentes" && STATUS_LEGEND.map((s) => (
        <div key={s.status} style={S.legendItem}>
          <span style={{ ...S.legendDot, backgroundColor: s.color }} />
          <span style={S.legendLabel}>{s.label}</span>
        </div>
      ))}
      {activeLayer === "densidad" && (
        <div style={S.legendItem}>
          <div style={S.heatGradient} />
          <span style={S.legendLabel}>Densidad</span>
        </div>
      )}
    </div>
  );
}

/* ========== Export type ========== */

export type { ActiveLayer };

/* ========== Styles ========== */

const S: Record<string, React.CSSProperties> = {
  root: { backgroundColor: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 3, border: "1px solid #e2e8f0", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" },
  btn: { display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 6, border: "1px solid", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease", minWidth: 110 },
  count: { marginLeft: "auto", fontSize: 10, fontWeight: 700 },
  divider: { height: 1, backgroundColor: "#e2e8f0", margin: "1px 0" },
  legend: { backgroundColor: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", borderRadius: 6, padding: "5px 12px", display: "flex", gap: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: "50%" },
  legendLabel: { fontSize: 10, color: "#475569", fontWeight: 500 },
  heatGradient: { width: 28, height: 8, borderRadius: 4, background: "linear-gradient(to right, rgba(30,58,95,0.5), rgba(13,148,136,0.6), rgba(217,119,6,0.7), rgba(127,29,29,0.8))" },
};
