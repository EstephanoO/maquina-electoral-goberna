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

function VizModeIcon({ mode }: { mode: DatosVizMode }) {
  if (mode === "points") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="8" r="2" />
        <circle cx="8" cy="18" r="2" />
      </svg>
    );
  }

  if (mode === "heatmap") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-4 4-8 4-8z" />
      </svg>
    );
  }

  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10" />
      <path d="M10 20V6" />
      <path d="M16 20V13" />
      <path d="M22 20V4" />
    </svg>
  );
}

function ThemeModeIcon({ mode }: { mode: MapTheme }) {
  if (mode === "dark") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      </svg>
    );
  }

  if (mode === "light") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.05" y2="7.05" />
        <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.05" y2="16.95" />
        <line x1="16.95" y1="7.05" x2="19.07" y2="4.93" />
      </svg>
    );
  }

  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15l3-3 3 2 4-4" />
    </svg>
  );
}

const THEME_MODES: Array<{ id: MapTheme; label: string }> = [
  { id: "dark", label: "Oscuro" },
  { id: "light", label: "Claro" },
  { id: "voyager", label: "Voyager" },
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
  const sectionTitleClass = isDark
    ? "text-slate-300"
    : "text-slate-500";
  const panelStyle = {
    background: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.38)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderColor: isDark ? "rgba(148,163,184,0.25)" : "rgba(226,232,240,0.7)",
    boxShadow: isDark ? "0 8px 32px rgba(2,6,23,0.45)" : "0 2px 24px rgba(0,0,0,0.08)",
  };
  const sectionStyle = {
    background: isDark ? "rgba(15,23,42,0.74)" : "rgba(255,255,255,0.38)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderColor: isDark ? "rgba(148,163,184,0.24)" : "rgba(226,232,240,0.75)",
    boxShadow: isDark ? "0 6px 20px rgba(2,6,23,0.4)" : "0 2px 16px rgba(0,0,0,0.06)",
  };

  return (
    <div className="rounded-2xl p-2 flex flex-col gap-1 border overflow-hidden" style={panelStyle}>
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

      <div className="mt-1 p-1">
        <div className={`text-[10px] font-semibold tracking-wide uppercase px-1 pb-1 ${sectionTitleClass}`}>Tema</div>
        <div className="grid grid-cols-3 gap-1">
          {THEME_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onMapThemeChange(mode.id)}
              className="cursor-pointer rounded-md border px-0 py-1 h-7 flex items-center justify-center transition-all duration-150"
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
              title={mode.label}
              aria-label={mode.label}
            >
              <ThemeModeIcon mode={mode.id} />
            </button>
          ))}
        </div>
      </div>

      {activeLayer === "datos" && (
        <div className="mt-1 p-1">
          <div className={`text-[10px] font-semibold tracking-wide uppercase px-1 pb-1 ${sectionTitleClass}`}>Visualizacion</div>
          <div className="grid grid-cols-3 gap-1">
            {VIZ_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onDatosVizModeChange(mode.id)}
                className="cursor-pointer rounded-md border px-0 py-1 h-7 flex items-center justify-center transition-all duration-150"
                style={{
                  backgroundColor: datosVizMode === mode.id
                    ? C.datos
                    : (isDark ? "rgba(2,6,23,0.5)" : "#ffffff"),
                  color: datosVizMode === mode.id ? "#ffffff" : (isDark ? "#cbd5e1" : "#475569"),
                  borderColor: datosVizMode === mode.id ? C.datos : (isDark ? "#334155" : "#e2e8f0"),
                }}
                title={mode.label}
                aria-label={mode.label}
              >
                <VizModeIcon mode={mode.id} />
              </button>
            ))}
          </div>

          {datosVizMode === "heatmap" && (
            <div className="mt-2 rounded-2xl border p-2" style={sectionStyle}>
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
