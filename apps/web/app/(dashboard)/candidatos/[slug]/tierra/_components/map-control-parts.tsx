import type { AgentStatus, DatosVizMode, MapTheme } from "./types";

/* ========== VizMode Icon ========== */

export function VizModeIcon({ mode }: { mode: DatosVizMode }) {
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

/* ========== ThemeMode Icon ========== */

export function ThemeModeIcon({ mode }: { mode: MapTheme }) {
  if (mode === "dark") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      </svg>
    );
  }

  if (mode === "voyager") {
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

/* ========== Map Legend ========== */

const STATUS_LEGEND: { status: AgentStatus; label: string; color: string }[] = [
  { status: "connected", label: "Conectado", color: "#0d9488" },
  { status: "idle", label: "Inactivo", color: "#d97706" },
  { status: "inactive", label: "Sin senal", color: "#64748b" },
];

const C = {
  datos: "#2563eb",
  routes: "#6a4c93",
};

type LegendProps = {
  activeLayer: "datos" | "agentes" | null;
  showRoutes: boolean;
};

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
