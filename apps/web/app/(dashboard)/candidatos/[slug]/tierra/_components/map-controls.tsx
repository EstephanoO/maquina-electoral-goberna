"use client";

import type { AgentStatus } from "./types";
import type { DatosVizMode } from "./types";
import type { MapTheme } from "./types";

/* ========== Types ========== */

type ActiveLayer = "datos" | "agentes" | null;

type Props = {
  activeLayer: ActiveLayer;
  onLayerChange: (layer: ActiveLayer) => void;
  showRoutes: boolean;
  onRoutesToggle: () => void;
  datosVizMode: DatosVizMode;
  onDatosVizModeChange: (mode: DatosVizMode) => void;
  heatmapRadius: number;
  heatmapOpacity: number;
  onHeatmapRadiusChange: (radius: number) => void;
  onHeatmapOpacityChange: (opacity: number) => void;
  mapTheme: MapTheme;
  onMapThemeChange: (theme: MapTheme) => void;
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

const VIZ_MODES: Array<{ id: DatosVizMode; label: string }> = [
  { id: "points", label: "Puntos" },
  { id: "heatmap", label: "Calor" },
  { id: "bars3d", label: "Barras 3D" },
];

const THEME_MODES: Array<{ id: MapTheme; label: string }> = [
  { id: "dark", label: "Oscuro" },
  { id: "light", label: "Claro" },
];

export function MapControls({
  activeLayer,
  onLayerChange,
  showRoutes,
  onRoutesToggle,
  datosVizMode,
  onDatosVizModeChange,
  heatmapRadius,
  heatmapOpacity,
  onHeatmapRadiusChange,
  onHeatmapOpacityChange,
  mapTheme,
  onMapThemeChange,
  agentCount,
  formCount,
  routeSurveyorCount,
}: Props) {
  const isDark = mapTheme === "dark";
  const panelClass = isDark
    ? "bg-slate-950/88 border-slate-700 shadow-[0_10px_28px_rgba(2,6,23,0.55)]"
    : "bg-white/95 border-slate-200 shadow-sm";
  const sectionClass = isDark
    ? "border-slate-700 bg-slate-900/85"
    : "border-slate-200 bg-slate-50";
  const sectionTitleClass = isDark
    ? "text-slate-300"
    : "text-slate-500";

  return (
    <div className={`backdrop-blur-sm rounded-[10px] p-2 flex flex-col gap-1 border ${panelClass}`}>
      <LayerBtn
        active={activeLayer === "datos"}
        onClick={() => onLayerChange(activeLayer === "datos" ? null : "datos")}
        label="Datos"
        count={formCount}
        activeColor={C.datos}
        mapTheme={mapTheme}
      />
      <LayerBtn
        active={activeLayer === "agentes"}
        onClick={() => onLayerChange(activeLayer === "agentes" ? null : "agentes")}
        label="Agentes"
        count={agentCount}
        activeColor={C.agents}
        mapTheme={mapTheme}
      />
      <LayerBtn
        active={showRoutes}
        onClick={onRoutesToggle}
        label="Rutas"
        count={routeSurveyorCount}
        activeColor={C.routes}
        mapTheme={mapTheme}
      />

      <div className={`mt-1 rounded-md border p-1.5 ${sectionClass}`}>
        <div className={`text-[10px] font-semibold tracking-wide uppercase px-1 pb-1 ${sectionTitleClass}`}>Tema</div>
        <div className="grid grid-cols-2 gap-1">
          {THEME_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onMapThemeChange(mode.id)}
              className="cursor-pointer rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150"
              style={{
                backgroundColor: mapTheme === mode.id
                  ? (isDark ? "#0f172a" : "#0f172a")
                  : (isDark ? "rgba(2,6,23,0.55)" : "#ffffff"),
                color: mapTheme === mode.id
                  ? "#ffffff"
                  : (isDark ? "#cbd5e1" : "#475569"),
                borderColor: mapTheme === mode.id
                  ? (isDark ? "#334155" : "#0f172a")
                  : (isDark ? "#334155" : "#e2e8f0"),
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {activeLayer === "datos" && (
        <div className={`mt-1 rounded-md border p-1.5 ${sectionClass}`}>
          <div className={`text-[10px] font-semibold tracking-wide uppercase px-1 pb-1 ${sectionTitleClass}`}>Visualizacion</div>
          <div className="grid grid-cols-3 gap-1">
            {VIZ_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onDatosVizModeChange(mode.id)}
                className="cursor-pointer rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150"
                style={{
                  backgroundColor: datosVizMode === mode.id
                    ? C.datos
                    : (isDark ? "rgba(2,6,23,0.5)" : "#ffffff"),
                  color: datosVizMode === mode.id ? "#ffffff" : (isDark ? "#cbd5e1" : "#475569"),
                  borderColor: datosVizMode === mode.id ? C.datos : (isDark ? "#334155" : "#e2e8f0"),
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {datosVizMode === "heatmap" && (
            <div className={`mt-2 rounded-md border p-2 ${isDark ? "border-slate-700 bg-slate-950/85" : "border-slate-200 bg-white"}`}>
              <div className={`text-[10px] font-semibold tracking-wide uppercase mb-2 ${sectionTitleClass}`}>Heatmap</div>

              <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 mb-2">
                <label className={`text-[10px] font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`} htmlFor="heatmap-radius">
                  Radio
                </label>
                <input
                  id="heatmap-radius"
                  type="number"
                  min={5}
                  max={50}
                  value={heatmapRadius}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next)) onHeatmapRadiusChange(Math.max(5, Math.min(50, next)));
                  }}
                  className={`w-[58px] rounded border px-1.5 py-0.5 text-[10px] font-semibold outline-none ${
                    isDark
                      ? "border-slate-600 bg-slate-900 text-slate-100 focus:border-blue-400"
                      : "border-slate-300 bg-white text-slate-700 focus:border-blue-500"
                  }`}
                />
              </div>

              <input
                type="range"
                min={5}
                max={50}
                step={1}
                value={heatmapRadius}
                onChange={(e) => onHeatmapRadiusChange(Number(e.target.value))}
                className="w-full accent-blue-600"
              />

              <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 mt-2 mb-2">
                <label className={`text-[10px] font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`} htmlFor="heatmap-opacity">
                  Opacidad
                </label>
                <input
                  id="heatmap-opacity"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={heatmapOpacity}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next)) onHeatmapOpacityChange(Math.max(0, Math.min(1, next)));
                  }}
                  className={`w-[58px] rounded border px-1.5 py-0.5 text-[10px] font-semibold outline-none ${
                    isDark
                      ? "border-slate-600 bg-slate-900 text-slate-100 focus:border-blue-400"
                      : "border-slate-300 bg-white text-slate-700 focus:border-blue-500"
                  }`}
                />
              </div>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={heatmapOpacity}
                onChange={(e) => onHeatmapOpacityChange(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LayerBtn({ active, onClick, label, count, activeColor, mapTheme }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  activeColor: string;
  mapTheme: MapTheme;
}) {
  const isDark = mapTheme === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-[7px] py-1.5 px-2.5 rounded-md border text-[11px] font-semibold cursor-pointer transition-all duration-150 min-w-[110px]"
      style={{
        backgroundColor: active ? activeColor : (isDark ? "rgba(15,23,42,0.82)" : "#f8fafc"),
        color: active ? "#fff" : (isDark ? "#cbd5e1" : "#475569"),
        borderColor: active ? activeColor : (isDark ? "#334155" : "#e2e8f0"),
      }}
    >
      <span
        className="w-[7px] h-[7px] rounded-full shrink-0"
        style={{ backgroundColor: active ? "#fff" : activeColor, opacity: active ? 0.9 : 0.4 }}
      />
      <span>{label}</span>
      {count != null && <span className="ml-auto text-[10px] font-bold" style={{ opacity: active ? 1 : (isDark ? 0.7 : 0.5) }}>{count}</span>}
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
