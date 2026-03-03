/* ========== Static MapLibre paint/layout objects (P2 — hoisted, zero per-render allocation) ========== */

import type {
  FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification,
  HeatmapLayerSpecification, SymbolLayerSpecification, FillExtrusionLayerSpecification, FilterSpecification,
} from "maplibre-gl";
import {
  STATUS_COLORS, CLUSTER_COLORS, CLUSTER_STEPS, CLUSTER_SIZES, DATA_POINT,
  PRIORITY_FILL, PRIORITY_LINE, SECTOR_FILL, SECTOR_LINE,
} from "./constants";

/* ─── Visibility helpers ─── */

export const VIS_VISIBLE = { visibility: "visible" as const };
export const VIS_NONE = { visibility: "none" as const };

/* ─── Priority zone paints (static) ─── */

export const PRIORITY_FILL_PAINT: FillLayerSpecification["paint"] = { "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 };
export const PRIORITY_DEP_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": PRIORITY_LINE, "line-width": 0.8, "line-opacity": 0.4 };
export const PRIORITY_PROV_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": PRIORITY_LINE, "line-width": 0.6, "line-opacity": 0.4 };
export const PRIORITY_DIST_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": PRIORITY_LINE, "line-width": 0.5, "line-opacity": 0.4 };

/* ─── Sector paints (static) ─── */

export const SECTOR_FILL_PAINT: FillLayerSpecification["paint"] = { "fill-color": SECTOR_FILL, "fill-opacity": 0.8 };
export const SECTOR_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": SECTOR_LINE, "line-width": 0.5, "line-opacity": 0.4 };

/* ─── Heatmap paint (theme-aware + runtime tunable) ─── */

type HeatmapPaintOptions = {
  radius: number;
  opacity: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getHeatmapPaint({ radius, opacity }: HeatmapPaintOptions): HeatmapLayerSpecification["paint"] {
  const r = clamp(radius, 5, 50);
  const o = clamp(opacity, 0, 1);
  return {
    "heatmap-weight": 1,
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 0.9, 10, 1.9, 14, 3.2],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, r * 0.62, 10, r, 14, r * 1.45],
    "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 5, Math.min(1, o), 12, o * 0.92, 16, o * 0.58],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0, "rgba(0,0,0,0)",
      0.2, "rgba(56,189,248,0.22)",
      0.4, "rgba(14,165,233,0.36)",
      0.55, "rgba(16,185,129,0.5)",
      0.7, "rgba(234,179,8,0.62)",
      0.85, "rgba(249,115,22,0.76)",
      1, "rgba(220,38,38,0.85)",
    ],
  };
}

export function getHeatmapDarkPaint({ radius, opacity }: HeatmapPaintOptions): HeatmapLayerSpecification["paint"] {
  const r = clamp(radius, 5, 50);
  const o = clamp(opacity, 0, 1);
  return {
    "heatmap-weight": 1,
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 10, 2.8, 14, 4.8],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, r * 0.78, 10, r * 1.2, 14, r * 1.75],
    "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 5, Math.min(1, o), 11, o * 0.93, 14, o * 0.76, 17, o * 0.52],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0, "rgba(0,0,0,0)",
      0.12, "rgba(52,255,102,0.2)",
      0.28, "rgba(78,255,0,0.42)",
      0.46, "rgba(126,255,0,0.62)",
      0.62, "rgba(188,255,0,0.78)",
      0.78, "rgba(255,220,0,0.9)",
      0.9, "rgba(255,128,0,0.95)",
      1, "rgba(255,24,0,0.99)",
    ],
  };
}

export const HEATMAP_PAINT = getHeatmapPaint({ radius: 26, opacity: 0.8 });
export const HEATMAP_DARK_PAINT = getHeatmapDarkPaint({ radius: 26, opacity: 0.88 });

/* ─── 3D bars paint (static) ─── */

export const BARS_EXTRUSION_PAINT: FillExtrusionLayerSpecification["paint"] = {
  "fill-extrusion-color": [
    "step", ["get", "count"],
    "#38bdf8", 3, "#22d3ee", 8, "#14b8a6", 15, "#f59e0b", 30, "#ef4444",
  ],
  // Composite expression (zoom + feature property). `zoom` must be top-level.
  "fill-extrusion-height": [
    "interpolate",
    ["linear"],
    ["zoom"],
    4, ["*", ["get", "height"], 0.7],
    6, ["*", ["get", "height"], 0.85],
    8, ["*", ["get", "height"], 1.0],
    10, ["*", ["get", "height"], 1.2],
    12, ["*", ["get", "height"], 1.45],
    14, ["*", ["get", "height"], 1.8],
    16, ["*", ["get", "height"], 2.2],
  ],
  "fill-extrusion-base": 0,
  "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 8, 0.62, 12, 0.78, 16, 0.9],
};

export const BARS_LINE_PAINT: LineLayerSpecification["paint"] = {
  "line-color": "rgba(241,245,249,0.35)",
  "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.2, 10, 0.5, 14, 1],
  "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 10, 0.55, 14, 0.78],
};

/* ─── Cluster filters (static) ─── */

export const HAS_POINT_COUNT: FilterSpecification = ["has", "point_count"];
export const NOT_HAS_POINT_COUNT: FilterSpecification = ["!", ["has", "point_count"]];

/* ─── Cluster paints (static) ─── */

export const CLUSTER_RING_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": ["step", ["get", "point_count"], CLUSTER_COLORS[0], CLUSTER_STEPS[0], CLUSTER_COLORS[1], CLUSTER_STEPS[1], CLUSTER_COLORS[2], CLUSTER_STEPS[2], CLUSTER_COLORS[3], CLUSTER_STEPS[3], CLUSTER_COLORS[4]],
  "circle-radius": ["step", ["get", "point_count"], CLUSTER_SIZES[0] + 3, CLUSTER_STEPS[0], CLUSTER_SIZES[1] + 3, CLUSTER_STEPS[1], CLUSTER_SIZES[2] + 3, CLUSTER_STEPS[2], CLUSTER_SIZES[3] + 3, CLUSTER_STEPS[3], CLUSTER_SIZES[4] + 3],
  "circle-opacity": 0.1,
};

export const CLUSTER_CIRCLE_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": ["step", ["get", "point_count"], CLUSTER_COLORS[0], CLUSTER_STEPS[0], CLUSTER_COLORS[1], CLUSTER_STEPS[1], CLUSTER_COLORS[2], CLUSTER_STEPS[2], CLUSTER_COLORS[3], CLUSTER_STEPS[3], CLUSTER_COLORS[4]],
  "circle-radius": ["step", ["get", "point_count"], CLUSTER_SIZES[0], CLUSTER_STEPS[0], CLUSTER_SIZES[1], CLUSTER_STEPS[1], CLUSTER_SIZES[2], CLUSTER_STEPS[2], CLUSTER_SIZES[3], CLUSTER_STEPS[3], CLUSTER_SIZES[4]],
  "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-stroke-opacity": 0.7,
};

export const CLUSTER_RING_DARK_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": ["step", ["get", "point_count"], "#34d399", CLUSTER_STEPS[0], "#10b981", CLUSTER_STEPS[1], "#f59e0b", CLUSTER_STEPS[2], "#f97316", CLUSTER_STEPS[3], "#ef4444"],
  "circle-radius": ["step", ["get", "point_count"], CLUSTER_SIZES[0] + 4, CLUSTER_STEPS[0], CLUSTER_SIZES[1] + 4, CLUSTER_STEPS[1], CLUSTER_SIZES[2] + 4, CLUSTER_STEPS[2], CLUSTER_SIZES[3] + 4, CLUSTER_STEPS[3], CLUSTER_SIZES[4] + 4],
  "circle-opacity": 0.24,
  "circle-blur": 0.25,
};

export const CLUSTER_CIRCLE_DARK_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": ["step", ["get", "point_count"], "#34f5a4", CLUSTER_STEPS[0], "#22c55e", CLUSTER_STEPS[1], "#fbbf24", CLUSTER_STEPS[2], "#fb923c", CLUSTER_STEPS[3], "#f87171"],
  "circle-radius": ["step", ["get", "point_count"], CLUSTER_SIZES[0], CLUSTER_STEPS[0], CLUSTER_SIZES[1], CLUSTER_STEPS[1], CLUSTER_SIZES[2], CLUSTER_STEPS[2], CLUSTER_SIZES[3], CLUSTER_STEPS[3], CLUSTER_SIZES[4]],
  "circle-stroke-width": 1.5,
  "circle-stroke-color": "rgba(241,245,249,0.95)",
  "circle-stroke-opacity": 0.85,
};

/* ─── Cluster count text (static) ─── */

export const CLUSTER_COUNT_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": "{point_count_abbreviated}",
  "text-size": ["step", ["get", "point_count"], 9, CLUSTER_STEPS[0], 10, CLUSTER_STEPS[1], 11, CLUSTER_STEPS[2], 12, CLUSTER_STEPS[3], 14],
  "text-font": ["Open Sans Bold"], "text-allow-overlap": true,
};
export const CLUSTER_COUNT_PAINT: SymbolLayerSpecification["paint"] = { "text-color": "#ffffff" };

/* ─── Form points paint (static) ─── */

export const FORM_POINTS_PAINT: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 10, 4, 14, 5.5, 18, 8],
  "circle-color": DATA_POINT,
  "circle-opacity": 0.8,
  "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 14, 2],
  "circle-stroke-color": "#ffffff", "circle-stroke-opacity": 0.85,
};

export const FORM_POINTS_DARK_GLOW_PAINT: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 6, 10, 10, 14, 14, 18, 18],
  "circle-color": ["coalesce", ["get", "point_glow"], "rgba(52,245,164,0.45)"],
  "circle-opacity": 0.7,
  "circle-blur": 0.85,
};

export const FORM_POINTS_DARK_PAINT: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.8, 10, 4.4, 14, 6.2, 18, 8.6],
  "circle-color": ["coalesce", ["get", "point_color"], "#34f5a4"],
  "circle-opacity": 0.95,
  "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 14, 1.6],
  "circle-stroke-color": "rgba(241,245,249,0.9)",
  "circle-stroke-opacity": 0.9,
};

/* ─── Agent paints (static) ─── */

export const AGENT_SELECTED_FILTER: FilterSpecification = ["==", ["get", "is_selected"], 1];
export const AGENT_CONNECTED_FILTER: FilterSpecification = ["==", ["get", "status"], "connected"];
export const AGENT_PULSE_PAINT: CircleLayerSpecification["paint"] = { "circle-radius": 18, "circle-color": STATUS_COLORS.connected, "circle-opacity": 0.12 };
export const AGENT_LABELS_LAYOUT: SymbolLayerSpecification["layout"] = { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.8], "text-allow-overlap": false, "text-font": ["Open Sans Bold"] };
export const AGENT_LABELS_PAINT: SymbolLayerSpecification["paint"] = { "text-color": "#f8fafc", "text-halo-color": "rgba(15,23,42,0.9)", "text-halo-width": 1.6 };
export const AGENT_COUNT_LAYOUT: SymbolLayerSpecification["layout"] = { "text-field": ["to-string", ["get", "forms_count"]], "text-size": 9, "text-allow-overlap": true, "text-font": ["Open Sans Bold"] };
export const AGENT_COUNT_PAINT: SymbolLayerSpecification["paint"] = { "text-color": "#ffffff" };

/* ─── Surveyor route paints (static) ─── */

export const ROUTE_LINE_PAINT: LineLayerSpecification["paint"] = {
  "line-color": ["get", "color"],
  "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 10, 2.5, 14, 3.5],
  "line-opacity": 0.75,
};

export const ROUTE_LINE_LAYOUT: LineLayerSpecification["layout"] = {
  "line-cap": "round",
  "line-join": "round",
};

export const ROUTE_CASING_PAINT: LineLayerSpecification["paint"] = {
  "line-color": "#ffffff",
  "line-width": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 10, 5, 14, 7],
  "line-opacity": 0.4,
};

export const ROUTE_WAYPOINT_PAINT: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 10, 3.5, 14, 5],
  "circle-color": ["get", "color"],
  "circle-stroke-width": 1.5,
  "circle-stroke-color": "#ffffff",
  "circle-opacity": 0.9,
  "circle-stroke-opacity": 0.8,
};

export const ROUTE_WAYPOINT_START_PAINT: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 6, 14, 8],
  "circle-color": ["get", "color"],
  "circle-stroke-width": 2.5,
  "circle-stroke-color": "#ffffff",
  "circle-opacity": 1,
  "circle-stroke-opacity": 1,
};

export const ROUTE_SEQ_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": ["to-string", ["get", "seq"]],
  "text-size": ["interpolate", ["linear"], ["zoom"], 8, 0, 10, 8, 14, 10],
  "text-font": ["Open Sans Bold"],
  "text-allow-overlap": true,
};

export const ROUTE_SEQ_PAINT: SymbolLayerSpecification["paint"] = {
  "text-color": "#ffffff",
  "text-halo-color": ["get", "color"],
  "text-halo-width": 1,
};

/** Filter: first waypoint only */
export const ROUTE_WAYPOINT_START_FILTER: FilterSpecification = ["==", ["get", "is_first"], 1];
/** Filter: last waypoint only */
export const ROUTE_WAYPOINT_END_FILTER: FilterSpecification = ["==", ["get", "is_last"], 1];
/** Filter: not first waypoint (mid + last) */
export const ROUTE_WAYPOINT_MID_FILTER: FilterSpecification = ["==", ["get", "is_first"], 0];

/* ─── Source promoteId (P5 — static) ─── */

export const PROMOTE_ID = { departamentos: "coddep", provincias: "codprov_full", distritos: "ubigeo" };
