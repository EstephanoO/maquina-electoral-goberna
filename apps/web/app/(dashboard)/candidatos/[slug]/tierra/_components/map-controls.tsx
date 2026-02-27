"use client";

import type { AgentStatus } from "./types";
import type { ScreenTier } from "./hooks/use-breakpoint";

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
  tier?: ScreenTier;
};

type LegendProps = {
  activeLayer: ActiveLayer;
  showRoutes: boolean;
  tier?: ScreenTier;
};

/* ========== Professional colors ========== */
const C = {
  datos: "#2563eb",
  agents: "#0d9488",
  routes: "#6a4c93",
};

/* ========== Layer Controls ========== */

export function MapControls({ activeLayer, onLayerChange, agentCount, formCount, tier = "desktop" }: Props) {
  const isTV = tier === "tv";
  return (
    <div className={`bg-white/95 backdrop-blur-sm rounded-[10px] flex flex-col border border-slate-200 shadow-sm ${isTV ? "p-2.5 gap-1" : "p-2 gap-0.5"}`}>
      <LayerBtn
        active={activeLayer === "datos"}
        onClick={() => onLayerChange(activeLayer === "datos" ? null : "datos")}
        label="Datos"
        count={formCount}
        activeColor={C.datos}
        isTV={isTV}
      />
      <LayerBtn
        active={activeLayer === "agentes"}
        onClick={() => onLayerChange(activeLayer === "agentes" ? null : "agentes")}
        label="Agentes"
        count={agentCount}
        activeColor={C.agents}
        isTV={isTV}
      />
    </div>
  );
}

function LayerBtn({ active, onClick, label, count, activeColor, isTV = false }: { active: boolean; onClick: () => void; label: string; count?: number; activeColor: string; isTV?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center rounded-md border font-semibold cursor-pointer transition-all duration-150 ${
        isTV ? "gap-2 py-2 px-3 text-[14px] min-w-[140px]" : "gap-[7px] py-1.5 px-2.5 text-[11px] min-w-[110px]"
      }`}
      style={{
        backgroundColor: active ? activeColor : "#f8fafc",
        color: active ? "#fff" : "#475569",
        borderColor: active ? activeColor : "#e2e8f0",
      }}
    >
      <span
        className={`rounded-full shrink-0 ${isTV ? "w-[9px] h-[9px]" : "w-[7px] h-[7px]"}`}
        style={{ backgroundColor: active ? "#fff" : activeColor, opacity: active ? 0.9 : 0.4 }}
      />
      <span>{label}</span>
      {count != null && <span className={`ml-auto font-bold ${isTV ? "text-[12px]" : "text-[10px]"}`} style={{ opacity: active ? 1 : 0.5 }}>{count}</span>}
    </button>
  );
}

/* ========== Legend ========== */

const STATUS_LEGEND: { status: AgentStatus; label: string; color: string }[] = [
  { status: "connected", label: "Conectado", color: "#0d9488" },
  { status: "idle", label: "Inactivo", color: "#d97706" },
  { status: "inactive", label: "Sin senal", color: "#64748b" },
];

export function MapLegend({ activeLayer, showRoutes, tier = "desktop" }: LegendProps) {
  if (!activeLayer && !showRoutes) return null;
  const isTV = tier === "tv";
  const dotCls = isTV ? "w-2.5 h-2.5" : "w-2 h-2";
  const txtCls = isTV ? "text-[13px]" : "text-[10px]";
  return (
    <div className={`bg-white/95 backdrop-blur-sm rounded-md flex border border-slate-200 shadow-sm ${isTV ? "py-1.5 px-4 gap-4" : "py-[5px] px-3 gap-3"}`}>
      {activeLayer === "datos" && (
        <div className="flex items-center gap-[5px]">
          <span className={`${dotCls} rounded-full`} style={{ backgroundColor: C.datos }} />
          <span className={`${txtCls} text-slate-600 font-medium`}>Dato</span>
        </div>
      )}
      {activeLayer === "agentes" && STATUS_LEGEND.map((s) => (
        <div key={s.status} className="flex items-center gap-[5px]">
          <span className={`${dotCls} rounded-full`} style={{ backgroundColor: s.color }} />
          <span className={`${txtCls} text-slate-600 font-medium`}>{s.label}</span>
        </div>
      ))}
      {showRoutes && (
        <div className="flex items-center gap-[5px]">
          <span className={`${isTV ? "w-5" : "w-4"} h-[2px] rounded-full`} style={{ backgroundColor: C.routes }} />
          <span className={`${txtCls} text-slate-600 font-medium`}>Ruta</span>
        </div>
      )}
    </div>
  );
}

/* ========== Export type ========== */

export type { ActiveLayer };
