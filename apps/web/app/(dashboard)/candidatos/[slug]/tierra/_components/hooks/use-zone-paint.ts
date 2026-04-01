/**
 * use-zone-paint.ts — Memoized MapLibre paint objects for zone layers.
 *
 * Extracted from tierra-map.tsx to reduce its size. These paint objects
 * depend on drillState, mapTheme, and primaryColor and must be referentially
 * stable (new object = layer repaint in react-maplibre).
 */

import { useMemo } from "react";
import type { CircleLayerSpecification, FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";
import type { DrillState, DatosVizMode, MapTheme } from "../types";
import {
  ZONE_FILL, ZONE_HOVER, ZONE_LINE, ZONE_LINE_GHOST, MASK_FILL,
  STATUS_COLORS,
} from "../constants";
import {
  VIS_VISIBLE, VIS_NONE,
  getHeatmapPaint, getHeatmapDarkPaint,
  CLUSTER_RING_PAINT, CLUSTER_CIRCLE_PAINT,
  CLUSTER_RING_DARK_PAINT, CLUSTER_CIRCLE_DARK_PAINT,
  CLUSTER_COUNT_LAYOUT, AGENT_LABELS_LAYOUT, AGENT_COUNT_LAYOUT,
  ROUTE_LINE_LAYOUT, ROUTE_SEQ_LAYOUT,
  FORM_POINTS_PAINT, FORM_POINTS_DARK_PAINT,
  AGENT_SELECTED_FILTER, AGENT_CONNECTED_FILTER,
} from "../map-paint-constants";

/* ═══════════════════════════════════════════════
 *  Zone palette (dep / prov / dist fills & lines)
 * ═══════════════════════════════════════════════ */

type ZonePalette = {
  fill: string; hover: string; line: string; ghost: string; mask: string;
};

function buildZonePalette(mapTheme: MapTheme): ZonePalette {
  if (mapTheme === "dark") {
    return {
      fill: "rgba(148, 163, 184, 0.2)",
      hover: "rgba(148, 163, 184, 0.42)",
      line: "#e2e8f0",
      ghost: "#94a3b8",
      mask: "rgba(2, 6, 23, 0.54)",
    };
  }
  return { fill: ZONE_FILL, hover: ZONE_HOVER, line: ZONE_LINE, ghost: ZONE_LINE_GHOST, mask: MASK_FILL };
}

/* ═══════════════════════════════════════════════
 *  Hook: useZonePaint
 * ═══════════════════════════════════════════════ */

type ElectoralItem = { ubigeo: string; pct: number };

export function useZonePaint(
  drillState: DrillState,
  mapTheme: MapTheme,
  electoralData?: ElectoralItem[] | null,
) {
  const zonePalette = useMemo(() => buildZonePalette(mapTheme), [mapTheme]);

  const depFillPaint = useMemo((): FillLayerSpecification["paint"] => ({
    "fill-color": drillState.level === 0
      ? ["case", ["boolean", ["feature-state", "hover"], false], zonePalette.hover, zonePalette.fill]
      : drillState.depCode
        ? ["case", ["==", ["get", "coddep"], drillState.depCode], zonePalette.fill, zonePalette.mask]
        : zonePalette.fill,
    "fill-opacity": 1,
  }), [drillState.level, drillState.depCode, zonePalette]);

  const depLinePaint = useMemo((): LineLayerSpecification["paint"] => ({
    "line-color": drillState.level === 0 ? zonePalette.line : zonePalette.ghost,
    "line-width": drillState.level === 0 ? (mapTheme === "dark" ? 1.2 : 1.7) : (mapTheme === "dark" ? 0.6 : 0.9),
    "line-opacity": drillState.level === 0 ? (mapTheme === "dark" ? 0.82 : 0.95) : (mapTheme === "dark" ? 0.45 : 0.62),
  }), [drillState.level, mapTheme, zonePalette]);

  const provFillPaint = useMemo((): FillLayerSpecification["paint"] => ({
    "fill-color": drillState.level === 1
      ? ["case", ["boolean", ["feature-state", "hover"], false], zonePalette.hover, zonePalette.fill]
      : drillState.provCode
        ? ["case", ["==", ["get", "codprov_full"], drillState.provCode], zonePalette.fill, zonePalette.mask]
        : zonePalette.fill,
    "fill-opacity": 1,
  }), [drillState.level, drillState.provCode, zonePalette]);

  const provLinePaint = useMemo((): LineLayerSpecification["paint"] => ({
    "line-color": drillState.level === 1 ? zonePalette.line : zonePalette.ghost,
    "line-width": drillState.level === 1 ? (mapTheme === "dark" ? 1 : 1.4) : (mapTheme === "dark" ? 0.5 : 0.8),
    "line-opacity": drillState.level === 1 ? (mapTheme === "dark" ? 0.8 : 0.92) : (mapTheme === "dark" ? 0.38 : 0.56),
  }), [drillState.level, mapTheme, zonePalette]);

  const distFillPaint = useMemo((): FillLayerSpecification["paint"] => {
    // Build electoral gradient paint when data is available and we're at province level (level 2)
    if (electoralData?.length && drillState.level === 2) {
      // pct range across all districts
      const pcts = electoralData.map((d) => d.pct);
      const minPct = Math.min(...pcts);
      const maxPct = Math.max(...pcts);
      const range = maxPct - minPct || 1;

      // Build a match expression: ["match", ["get","ubigeo"], ubigeo1, color1, ubigeo2, color2, ..., fallback]
      // Color: interpolate from light blue (#bfdbfe) to deep blue (#1e3a8a) based on pct
      const matchArgs: unknown[] = [["get", "ubigeo"]];
      for (const d of electoralData) {
        const t = (d.pct - minPct) / range; // 0=min, 1=max
        // Interpolate between #dbeafe (low) → #1e40af (high)
        const r = Math.round(219 + (30 - 219) * t);
        const g = Math.round(190 + (64 - 190) * t);
        const b = Math.round(254 + (175 - 254) * t);
        matchArgs.push(d.ubigeo, `rgb(${r},${g},${b})`);
      }
      matchArgs.push(zonePalette.fill); // fallback

      return {
        "fill-color": ["case",
          ["boolean", ["feature-state", "hover"], false],
          zonePalette.hover,
          ["match", ...matchArgs] as unknown as string,
        ],
        "fill-opacity": 1,
      };
    }

    return {
      "fill-color": drillState.level === 2
        ? ["case", ["boolean", ["feature-state", "hover"], false], zonePalette.hover, zonePalette.fill]
        : drillState.distCode
          ? ["case", ["==", ["get", "ubigeo"], drillState.distCode], zonePalette.fill, zonePalette.mask]
          : zonePalette.fill,
      "fill-opacity": 1,
    };
  }, [drillState.level, drillState.distCode, zonePalette, electoralData]);

  const distLinePaint = useMemo((): LineLayerSpecification["paint"] => ({
    "line-color": zonePalette.line,
    "line-width": drillState.level >= 3 ? (mapTheme === "dark" ? 1.2 : 1.6) : (mapTheme === "dark" ? 0.8 : 1.15),
    "line-opacity": mapTheme === "dark" ? 0.78 : 0.88,
  }), [drillState.level, mapTheme, zonePalette]);

  return { depFillPaint, depLinePaint, provFillPaint, provLinePaint, distFillPaint, distLinePaint };
}

/* ═══════════════════════════════════════════════
 *  Hook: useLayerPaint
 *  Memoized paint/layout objects for data + agent layers
 * ═══════════════════════════════════════════════ */

export function useLayerPaint(
  mapTheme: MapTheme,
  primaryColor: string,
  showDatos: boolean,
  datosVizMode: DatosVizMode,
  showTracking: boolean,
  showRoutes: boolean,
  heatmapRadius: number,
  heatmapOpacity: number,
) {
  const clusterRingPaint = useMemo(
    () => (mapTheme === "dark" ? CLUSTER_RING_DARK_PAINT : CLUSTER_RING_PAINT),
    [mapTheme],
  );
  const clusterCirclePaint = useMemo(
    () => (mapTheme === "dark" ? CLUSTER_CIRCLE_DARK_PAINT : CLUSTER_CIRCLE_PAINT),
    [mapTheme],
  );
  const formPointsPaint = useMemo(
    () => (mapTheme === "dark" ? FORM_POINTS_DARK_PAINT : FORM_POINTS_PAINT),
    [mapTheme],
  );
  const heatmapPaint = useMemo(
    () => (
      mapTheme === "dark"
        ? getHeatmapDarkPaint({ radius: heatmapRadius, opacity: heatmapOpacity })
        : getHeatmapPaint({ radius: heatmapRadius, opacity: heatmapOpacity })
    ),
    [mapTheme, heatmapRadius, heatmapOpacity],
  );

  // Agent paint objects
  const agentSelectedRingPaint = useMemo((): CircleLayerSpecification["paint"] => ({
    "circle-radius": 24, "circle-color": primaryColor, "circle-opacity": 0.2,
  }), [primaryColor]);

  const agentCirclesPaint = useMemo((): CircleLayerSpecification["paint"] => ({
    "circle-radius": ["case", ["==", ["get", "is_selected"], 1], 12, 9],
    "circle-color": ["match", ["get", "status"], "connected", STATUS_COLORS.connected, "idle", STATUS_COLORS.idle, "inactive", STATUS_COLORS.inactive, primaryColor],
    "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff",
    "circle-opacity": 1,
    "circle-stroke-opacity": 1,
  }), [primaryColor]);

  // Visibility toggles
  const pointsVisibility = useMemo(() => showDatos && datosVizMode === "points" ? VIS_VISIBLE : VIS_NONE, [showDatos, datosVizMode]);
  const pointsGlowVisibility = useMemo(() => showDatos && datosVizMode === "points" && mapTheme === "dark" ? VIS_VISIBLE : VIS_NONE, [showDatos, datosVizMode, mapTheme]);
  const heatmapVisibility = useMemo(() => showDatos && datosVizMode === "heatmap" ? VIS_VISIBLE : VIS_NONE, [showDatos, datosVizMode]);
  const barsVisibility = useMemo(() => showDatos && datosVizMode === "bars3d" ? VIS_VISIBLE : VIS_NONE, [showDatos, datosVizMode]);
  const trackingVisibility = useMemo(() => showTracking ? VIS_VISIBLE : VIS_NONE, [showTracking]);
  const routesVisibility = useMemo(() => showRoutes ? VIS_VISIBLE : VIS_NONE, [showRoutes]);

  // Merged layout objects
  const routeLineLayoutWithVis = useMemo(() => ({
    ...ROUTE_LINE_LAYOUT,
    ...(showRoutes ? {} : { visibility: "none" as const }),
  }), [showRoutes]);
  const routeSeqLayoutWithVis = useMemo(() => ({
    ...ROUTE_SEQ_LAYOUT,
    ...(showRoutes ? {} : { visibility: "none" as const }),
  }), [showRoutes]);
  const clusterCountLayoutWithVis = useMemo(() => ({
    ...CLUSTER_COUNT_LAYOUT,
    ...(showDatos && datosVizMode === "points" ? {} : { visibility: "none" as const }),
  }), [showDatos, datosVizMode]);
  const agentLabelsLayoutWithVis = useMemo(() => ({
    ...AGENT_LABELS_LAYOUT,
    ...(showTracking ? {} : { visibility: "none" as const }),
  }), [showTracking]);
  const agentCountLayoutWithVis = useMemo(() => ({
    ...AGENT_COUNT_LAYOUT,
    ...(showTracking ? {} : { visibility: "none" as const }),
  }), [showTracking]);

  return {
    clusterRingPaint, clusterCirclePaint, formPointsPaint, heatmapPaint,
    agentSelectedRingPaint, agentCirclesPaint,
    pointsVisibility, pointsGlowVisibility, heatmapVisibility, barsVisibility,
    trackingVisibility, routesVisibility,
    routeLineLayoutWithVis, routeSeqLayoutWithVis, clusterCountLayoutWithVis,
    agentLabelsLayoutWithVis, agentCountLayoutWithVis,
  };
}
