"use client";

import { useState, useRef, useEffect } from "react";
import type { DatosVizMode, MapTheme } from "./types";
import { VizModeIcon, ThemeModeIcon } from "./map-control-parts";

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
  { id: "voyager", label: "Claro" },
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

      <CollapsibleSection title="Tema" isDark={isDark}>
        <div className="grid grid-cols-3 gap-1">
          {THEME_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onMapThemeChange(mode.id)}
              className="cursor-pointer rounded-md border px-0 py-1 h-7 flex items-center justify-center transition-all duration-150"
              style={{
                backgroundColor: mapTheme === mode.id
                  ? (isDark ? "#090D15" : "#07091D")
                  : (isDark ? "rgba(9,13,21,0.55)" : "#ffffff"),
                color: mapTheme === mode.id
                  ? "#ffffff"
                  : (isDark ? "#cbd5e1" : "#475569"),
                borderColor: mapTheme === mode.id
                  ? (isDark ? "#334155" : "#07091D")
                  : (isDark ? "#334155" : "#e2e8f0"),
              }}
              title={mode.label}
              aria-label={mode.label}
            >
              <ThemeModeIcon mode={mode.id} />
            </button>
          ))}
        </div>
      </CollapsibleSection>

      {activeLayer === "datos" && (
        <CollapsibleSection title="Visualizacion" isDark={isDark} defaultOpen>
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
                    : (isDark ? "rgba(9,13,21,0.5)" : "#ffffff"),
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
                      ? "border-slate-600 bg-[#090D15] text-slate-100 focus:border-blue-400"
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
                      ? "border-slate-600 bg-[#090D15] text-slate-100 focus:border-blue-400"
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
        </CollapsibleSection>
      )}
    </div>
  );
}

/* ========== Collapsible Section ========== */

function CollapsibleSection({
  title,
  isDark,
  defaultOpen = false,
  children,
}: {
  title: string;
  isDark: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(
    defaultOpen ? undefined : 0,
  );

  useEffect(() => {
    if (!innerRef.current) return;
    if (open) {
      setHeight(innerRef.current.scrollHeight);
      const id = setTimeout(() => setHeight(undefined), 200);
      return () => clearTimeout(id);
    }
    // collapse: set explicit height first so transition works
    setHeight(innerRef.current.scrollHeight);
    requestAnimationFrame(() => setHeight(0));
  }, [open]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide cursor-pointer rounded-md transition-colors"
        style={{ color: isDark ? "#94a3b8" : "#64748b" }}
      >
        {title}
        <svg
          width={10}
          height={10}
          viewBox="0 0 10 10"
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-[height] duration-200 ease-in-out"
        style={{ height: height === undefined ? "auto" : height }}
      >
        <div ref={innerRef} className="px-1 pb-1">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ========== Layer Button ========== */

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

/* Re-export MapLegend from extracted parts */
export { MapLegend } from "./map-control-parts";

/* ========== Export type ========== */

export type { ActiveLayer };
