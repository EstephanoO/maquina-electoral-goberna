/* ========== Tierra Map — Constants ========== */

import type { FilterSpecification, StyleSpecification } from "maplibre-gl";
import type { AgentStatus, LogEntry } from "./types";

/* ─── Agent status colors ─── */

export const STATUS_COLORS: Record<AgentStatus, string> = {
  connected: "#0d9488",
  idle: "#d97706",
  inactive: "#64748b",
};

/* ─── Cluster styling ─── */

export const CLUSTER_COLORS = ["#93c5fd", "#3b82f6", "#2563eb", "#1d4ed8", "#1e3a5f"] as const;
export const CLUSTER_STEPS = [5, 15, 50, 150] as const;
export const CLUSTER_SIZES = [12, 16, 20, 26, 32] as const;
export const DATA_POINT = "#2563eb";

/* ─── Non-priority zone colors (neutral grey, outline-only feel) ─── */

export const ZONE_FILL = "rgba(148, 163, 184, 0.06)";
export const ZONE_HOVER = "rgba(148, 163, 184, 0.18)";
export const ZONE_LINE = "#334155";
export const ZONE_LINE_GHOST = "#94a3b8";

/* ─── Mask system — opacity-based for instant GPU transitions ─── */

/** Opacity values for the mask overlay (data-driven per feature) */
export const MASK_OPACITY_ACTIVE = 0.06;   // selected zone — near transparent (matches ZONE_FILL alpha)
export const MASK_OPACITY_HOVER = 0.14;    // hovered zone — subtle highlight
export const MASK_OPACITY_DIM = 0.45;      // non-selected zones — darkened
export const MASK_COLOR = "#0f172a";       // slate-900 — neutral dark mask base

/* ─── Fill layers that support feature-state hover ─── */

export const HOVER_LAYERS: Record<string, string> = {
  "dep-fill": "departamentos",
  "prov-fill": "provincias",
  "dist-fill": "distritos",
} as const;

/* ─── Mask overlay (darkens areas outside selected zone) ─── */

export const MASK_FILL = "rgba(0, 0, 0, 0.45)";

/* ─── Priority zone colors (red — must stand out) ─── */

export const PRIORITY_FILL = "rgba(239, 68, 68, 0.35)";
export const PRIORITY_LINE = "#991b1b";
export const SECTOR_FILL = "rgba(220, 38, 38, 0.13)";
export const SECTOR_LINE = "#0a0a0a";

/* ─── Reusable MapLibre filter constants ─── */

/** Always-false filter (expression syntax required by MapLibre GL v5+) */
export const HIDE_FILTER: FilterSpecification = ["==", ["literal", false], true];
/** Always-true filter — shows all features */
export const SHOW_ALL_FILTER: FilterSpecification = ["literal", true];

/* ─── Animation timing ─── */

/** Drill navigation fly duration — short enough to feel snappy, long enough to orient */
export const FLY_DURATION = 600;
/** Resize re-fit duration — faster since it's a correction, not navigation */
export const RESIZE_FLY_DURATION = 300;

/* ─── Map viewport config ─── */

export const PERU_VIEW = { longitude: -75.0152, latitude: -9.1899, zoom: 5 } as const;
export const PERU_BOUNDS: [[number, number], [number, number]] = [[-81.4, -18.4], [-68.7, -0.1]];
/** Flat [west, south, east, north] for Source bounds prop — tells MapLibre to skip tiles outside Peru */
export const PERU_BOUNDS_FLAT: [number, number, number, number] = [-81.4, -18.4, -68.7, -0.1];
/** Pan limit — Peru + generous margin. Prevents scrolling to Africa/Asia. */
export const PERU_MAX_BOUNDS: [[number, number], [number, number]] = [[-90, -25], [-60, 5]];

/* ─── Tile config ─── */

const LIGHT_TILES = "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png";
export const DEFAULT_TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

/**
 * MAP_STYLE — clean basemap without any text labels.
 * Only the CARTO light_nolabels raster for roads/terrain.
 * All geographic names come from Tegola tile properties shown via tooltips.
 */
export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "light-base": { type: "raster", tiles: [LIGHT_TILES], tileSize: 256, attribution: "&copy; CARTO", maxzoom: 19 },
  },
  layers: [
    /** Background layer — visible while raster tiles load. Color matches CARTO light_nolabels
     *  basemap background (#e6e5e3). Without this, unloaded tiles show as pure white squares. */
    { id: "background", type: "background", paint: { "background-color": "#e6e5e3" } },
    { id: "light-base", type: "raster", source: "light-base" },
  ],
  /** Instant paint transitions — mask/fill changes must sync with flyTo, not lag behind */
  transition: { duration: 0, delay: 0 },
};

/* ─── Interactive layer IDs (static — never changes at runtime) ─── */

export const INTERACTIVE_LAYERS = [
  "agents-circles", "agents-selected-ring",
  "forms-clusters", "forms-cluster-ring", "forms-points",
  "dep-fill", "prov-fill", "dist-fill",
  "sector-fill",
] as const;

/* ─── Agent status config (unified across sidebar, tab, etc.) ─── */

export const STATUS_CFG: Record<AgentStatus, { label: string; color: string; short: string }> = {
  connected: { label: "Conectado", color: "#22c55e", short: "ON" },
  idle: { label: "Inactivo", color: "#eab308", short: "IDLE" },
  inactive: { label: "Sin señal", color: "#94a3b8", short: "OFF" },
};

/* ─── Log entry icon config ─── */

export const LOG_ICON_BG: Record<LogEntry["type"], string> = {
  form_submitted: "#2563eb",
  form_new: "#1d4ed8",
  agent_connected: "#0d9488",
  agent_disconnected: "#64748b",
};

export const LOG_ICON_LABEL: Record<LogEntry["type"], string> = {
  form_submitted: "^",
  form_new: "+",
  agent_connected: ">",
  agent_disconnected: "x",
};
