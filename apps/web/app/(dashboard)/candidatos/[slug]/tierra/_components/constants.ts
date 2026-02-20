/* ========== Tierra Map — Constants ========== */

import type { FilterSpecification, StyleSpecification } from "maplibre-gl";
import type { AgentStatus } from "./types";

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

/* ─── Spotlight system ───
 *
 * "Dark glass" approach: a background layer covers the ENTIRE map (base tiles,
 * ocean, labels — everything) with a dark semi-transparent overlay.  Selected
 * zone polygons are painted BRIGHT on top, creating a "hole of light" effect.
 * Non-selected zones stay fully transparent so the dark glass shows through.
 *
 * All transitions are GPU-native via MapLibre paint-property transitions.
 * Zero React re-renders — the dim overlay opacity is toggled imperatively
 * via map.setPaintProperty() from a useEffect that watches drillState.level.
 */

/** Spotlight: selected zone fill — fully transparent so streets/base map show through */
export const SPOT_FILL = "transparent";
/** Spotlight: hovered zone fill — very subtle tint, streets still visible */
export const SPOT_HOVER = "rgba(255, 255, 255, 0.12)";
/** Level 0: idle zone fill (no spotlight active) — near-transparent, streets visible */
export const ZONE_FILL = "rgba(148, 163, 184, 0.04)";
/** Level 0: hovered zone fill (no spotlight active) — subtle highlight, streets visible */
export const ZONE_HOVER = "rgba(148, 163, 184, 0.12)";

export const ZONE_LINE = "#334155";
export const ZONE_LINE_GHOST = "#94a3b8";

/* ─── Fill layers that support feature-state hover ─── */

export const HOVER_LAYERS: Record<string, string> = {
  "dep-fill": "departamentos",
  "prov-fill": "provincias",
  "dist-fill": "distritos",
} as const;

/* ─── Dim overlay ─── */

/** Dark glass opacity when spotlight is active (drill level > 0) */
export const DIM_OPACITY = 0.52;
/** Dim overlay layer ID — injected into MAP_STYLE, toggled imperatively */
export const DIM_LAYER_ID = "dim-overlay";

/* ─── Priority zone colors (red — must stand out against dark glass) ─── */

export const PRIORITY_FILL = "rgba(239, 68, 68, 0.45)";
export const PRIORITY_LINE = "#dc2626";
export const SECTOR_FILL = "rgba(220, 38, 38, 0.2)";
export const SECTOR_LINE = "#1e293b";

/* ─── Reusable MapLibre filter constants ─── */

export const HIDE_FILTER: FilterSpecification = ["==", "1", "0"];
export const SHOW_ALL_FILTER: FilterSpecification = ["all"];

/* ─── Map viewport config ─── */

export const PERU_VIEW = { longitude: -75.0152, latitude: -9.1899, zoom: 5 } as const;
export const PERU_BOUNDS: [[number, number], [number, number]] = [[-81.4, -18.4], [-68.7, -0.1]];

/* ─── Tile config ─── */

const LIGHT_TILES = "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png";
export const DEFAULT_TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

/**
 * Base map style with dim-overlay baked in.
 *
 * Layer order:
 *   1. light-base (CARTO raster tiles)
 *   2. dim-overlay (black background layer, starts at opacity 0)
 *   3. … vector tile layers added by React <Layer> components render on top
 *
 * The dim-overlay starts invisible (opacity: 0).  When drill level > 0,
 * we imperatively set its opacity to DIM_OPACITY via map.setPaintProperty().
 * MapLibre handles the GPU transition via the `transition` config.
 */
export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "light-base": { type: "raster", tiles: [LIGHT_TILES], tileSize: 256, attribution: "&copy; CARTO", maxzoom: 19 },
  },
  layers: [
    { id: "light-base", type: "raster", source: "light-base" },
    {
      id: DIM_LAYER_ID,
      type: "background",
      paint: {
        "background-color": "#0f172a",
        "background-opacity": 0,
        "background-opacity-transition": { duration: 500, delay: 0 },
      },
    },
  ],
  transition: { duration: 400, delay: 0 },
};

/* ─── Interactive layer IDs (static — never changes at runtime) ─── */

export const INTERACTIVE_LAYERS = [
  "agents-circles", "agents-selected-ring",
  "forms-clusters", "forms-cluster-ring", "forms-points",
  "dep-fill", "prov-fill", "dist-fill",
  "priority-dep-fill", "priority-prov-fill", "priority-dist-fill",
  "sector-fill",
] as const;
