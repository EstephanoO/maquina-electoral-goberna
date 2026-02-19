/* ========== Tierra Map — Constants ========== */

import type { FilterSpecification, StyleSpecification } from "maplibre-gl";
import type { AgentStatus, GeoFileConfig } from "./types";

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

export const HIDE_FILTER: FilterSpecification = ["==", "1", "0"];
export const SHOW_ALL_FILTER: FilterSpecification = ["all"];

/* ─── Map viewport config ─── */

export const PERU_VIEW = { longitude: -75.0152, latitude: -9.1899, zoom: 5 } as const;
export const PERU_BOUNDS: [[number, number], [number, number]] = [[-81.4, -18.4], [-68.7, -0.1]];

/* ─── Tile config ─── */

const LIGHT_TILES = "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png";
export const DEFAULT_TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "light-base": { type: "raster", tiles: [LIGHT_TILES], tileSize: 256, attribution: "&copy; CARTO", maxzoom: 19 },
  },
  layers: [{ id: "light-base", type: "raster", source: "light-base" }],
  transition: { duration: 400, delay: 0 },
};

/* ─── Interactive layer IDs (static — never changes at runtime) ─── */

export const INTERACTIVE_LAYERS = [
  "agents-circles", "agents-selected-ring",
  "forms-clusters", "forms-cluster-ring", "forms-points",
  "dep-fill", "prov-fill", "dist-fill",
  "priority-dep-fill", "priority-prov-fill", "priority-dist-fill",
  "sector-fill",
  "geo-dep-fill", "geo-prov-fill", "geo-dist-fill", "geo-sector-fill", "geo-subsector-fill",
] as const;

/* ─── GeoJSON fallback files per campaign ─── */

export const GEOJSON_FILES: Record<string, GeoFileConfig[]> = {
  "giovanna-castagnino": [
    { file: "/geo/nieto_giovanna.geojson", level: "dist" },
    { file: "/geo/bisnieto_giovanna_v1.geojson", level: "sector" },
  ],
  "rocio-rodriguez": [
    { file: "/geo/abuelo_rocio.geojson", level: "dep" },
    { file: "/geo/padre_rocio.geojson", level: "prov" },
    { file: "/geo/hijo_rocio.geojson", level: "dist" },
  ],
};
