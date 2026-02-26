/* ========== Static MapLibre paint/layout objects (P2 — hoisted, zero per-render allocation) ========== */

import type {
  FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification,
  HeatmapLayerSpecification, SymbolLayerSpecification, FilterSpecification,
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

/* ─── Heatmap paint (static) ─── */

export const HEATMAP_PAINT: HeatmapLayerSpecification["paint"] = {
  "heatmap-weight": 1,
  "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 3],
  "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 15, 12, 25],
  "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 14, 0.25],
  "heatmap-color": [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(0,0,0,0)", 0.2, "rgba(30,58,95,0.35)", 0.4, "rgba(13,148,136,0.5)",
    0.6, "rgba(217,119,6,0.6)", 0.8, "rgba(180,83,9,0.7)", 1, "rgba(127,29,29,0.8)",
  ],
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

/* ─── Agent paints (static) ─── */

export const AGENT_SELECTED_FILTER: FilterSpecification = ["==", ["get", "is_selected"], 1];
export const AGENT_CONNECTED_FILTER: FilterSpecification = ["==", ["get", "status"], "connected"];
export const AGENT_PULSE_PAINT: CircleLayerSpecification["paint"] = { "circle-radius": 18, "circle-color": STATUS_COLORS.connected, "circle-opacity": 0.12 };
export const AGENT_LABELS_LAYOUT: SymbolLayerSpecification["layout"] = { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.8], "text-allow-overlap": false, "text-font": ["Open Sans Bold"] };
export const AGENT_LABELS_PAINT: SymbolLayerSpecification["paint"] = { "text-color": "#1e293b", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.5 };
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
