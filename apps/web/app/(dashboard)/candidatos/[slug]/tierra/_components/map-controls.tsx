"use client";

import type { AgentStatus } from "./types";

/* ========== Types ========== */

type ActiveLayer = "datos" | "agentes" | null;

type Props = {
  activeLayer: ActiveLayer;
  onLayerChange: (layer: ActiveLayer) => void;
  showRoutes: boolean;
  onRoutesToggle: () => void;
  agentCount: number;
  formCount: number;
  routeSurveyorCount?: number;
};

type LegendProps = {
  activeLayer: ActiveLayer;
  showRoutes: boolean;
};

/* ========== Professional colors ========== */
const C = {
  datos: "#2563eb",
  agents: "#0d9488",
  routes: "#6a4c93",
};

/* ========== Layer Controls ========== */

export function MapControls({ activeLayer, onLayerChange, showRoutes, onRoutesToggle, agentCount, formCount, routeSurveyorCount }: Props) {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-[10px] p-2 flex flex-col gap-0.5 border border-slate-200 shadow-sm">
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
        active={showRoutes}
        onClick={onRoutesToggle}
        label="Rutas"
        count={routeSurveyorCount}
        activeColor={C.routes}
      />
    </div>
  );
}

function LayerBtn({ active, onClick, label, count, activeColor }: { active: boolean; onClick: () => void; label: string; count?: number; activeColor: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-[7px] py-1.5 px-2.5 rounded-md border text-[11px] font-semibold cursor-pointer transition-all duration-150 min-w-[110px]"
      style={{
        backgroundColor: active ? activeColor : "#f8fafc",
        color: active ? "#fff" : "#475569",
        borderColor: active ? activeColor : "#e2e8f0",
      }}
    >
      <span
        className="w-[7px] h-[7px] rounded-full shrink-0"
        style={{ backgroundColor: active ? "#fff" : activeColor, opacity: active ? 0.9 : 0.4 }}
      />
      <span>{label}</span>
      {count != null && <span className="ml-auto text-[10px] font-bold" style={{ opacity: active ? 1 : 0.5 }}>{count}</span>}
    </button>
  );
}

/* ========== Legend ========== */

const STATUS_LEGEND: { status: AgentStatus; label: string; color: string }[] = [
  { status: "connected", label: "Conectado", color: "#0d9488" },
  { status: "idle", label: "Inactivo", color: "#d97706" },
  { status: "inactive", label: "Sin senal", color: "#64748b" },
];

export function MapLegend({ activeLayer, showRoutes }: LegendProps) {
  if (!activeLayer && !showRoutes) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-md py-[5px] px-3 flex gap-3 border border-slate-200 shadow-sm">
      {activeLayer === "datos" && (
        <div className="flex items-center gap-[5px]">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: C.datos }} />
          <span className="text-[10px] text-slate-600 font-medium">Dato</span>
        </div>
      )}
      {activeLayer === "agentes" && STATUS_LEGEND.map((s) => (
        <div key={s.status} className="flex items-center gap-[5px]">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
          <span className="text-[10px] text-slate-600 font-medium">{s.label}</span>
        </div>
      ))}
      {showRoutes && (
        <div className="flex items-center gap-[5px]">
          <span className="w-4 h-[2px] rounded-full" style={{ backgroundColor: C.routes }} />
          <span className="text-[10px] text-slate-600 font-medium">Ruta</span>
        </div>
      )}
    </div>
  );
}

/* ========== Export type ========== */

export type { ActiveLayer };
