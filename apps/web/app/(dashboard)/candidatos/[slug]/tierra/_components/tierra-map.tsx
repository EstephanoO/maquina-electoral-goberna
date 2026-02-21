"use client";

/**
 * TierraMap — Main map component for campaign territory visualization.
 *
 * Architecture: Pure rendering component that composes domain hooks.
 * All data transformation, filtering, and memoization lives in hooks.
 *
 * Best practices applied (@vis.gl/react-maplibre patterns):
 *
 * [P1] Always-mounted Sources — visibility controlled via layout `visibility`
 *      property. Never conditionally render {show && <Source>} — this destroys
 *      WebGL buffers and forces full data re-parse on re-mount.
 *
 * [P2] Hoisted paint/layout — All static paint/layout/filter objects live as
 *      module-level constants (zero per-render allocation). Dynamic objects use
 *      useMemo with minimal deps. This prevents react-maplibre from running
 *      style diffing on unchanged layers.
 *
 * [P3] Stable callbacks with refs — High-frequency handlers (onClick, onMouseMove)
 *      read volatile data from refs instead of closing over state. Empty deps
 *      array = stable function identity = MapLibre doesn't re-register listeners.
 *
 * [P4] Feature-state hover — Uses MapLibre's setFeatureState API for hover effects
 *      instead of React state. Zero React re-renders during mouse movement.
 *      Combined with rAF-batched tooltip positioning (useZoneTooltip hook).
 *
 * [P5] Memoized Source props — tiles array, promoteId object, and GeoJSON data
 *      are useMemo'd. New reference = Source rebuild in react-maplibre.
 *
 * [P6] memo(forwardRef) — Prevents cascade re-renders from parent (SSE updates,
 *      timer ticks, panel state changes).
 *
 * [P7] interactiveLayerIds as module constant — Changing this prop re-registers
 *      all mouse event listeners. Must be referentially stable.
 *
 * Additional architecture:
 * - ALL geographic overlays served via Tegola vector tiles (no GeoJSON fallback)
 * - Tile-native masking: data-driven fill-color darkens non-selected zones
 * - flyTo effect only fires on selectedAgentId change (not agents array)
 * - Cluster expansion zoom via native GeoJSONSource.getClusterExpansionZoom()
 * - ResizeObserver for container resize → map.resize() + re-fit
 */

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, Source } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { GeoJSONSource, FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification, HeatmapLayerSpecification, SymbolLayerSpecification, FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TierraMapHandle, TierraMapProps, DrillLevel } from "./types";
import { INITIAL_DRILL } from "./types";
import {
  STATUS_COLORS, CLUSTER_COLORS, CLUSTER_STEPS, CLUSTER_SIZES, DATA_POINT,
  ZONE_FILL, ZONE_HOVER, ZONE_LINE, ZONE_LINE_GHOST, MASK_FILL, HOVER_LAYERS,
  MASK_COLOR, MASK_OPACITY_ACTIVE, MASK_OPACITY_HOVER, MASK_OPACITY_DIM,
  PRIORITY_FILL, PRIORITY_LINE, SECTOR_FILL, SECTOR_LINE,
  PERU_VIEW, PERU_BOUNDS, PERU_BOUNDS_FLAT, MAP_STYLE, DEFAULT_TILE_TEMPLATE, INTERACTIVE_LAYERS,
  FLY_DURATION, RESIZE_FLY_DURATION,
} from "./constants";
import { getBoundsFromFeature } from "./utils";
import { preloadProvincias, preloadDistritos, reverseGeocode, getDepartamentos, getProvincias, getDistritos } from "@/lib/services/geo";

import { useDrillFilters } from "./hooks/use-drill-filters";
import { useAgentsSource, useFormSources } from "./hooks/use-map-sources";
import { useAutoFit } from "./hooks/use-auto-fit";
import { useZoneTooltip } from "./hooks/use-zone-tooltip";

/* ========== Tile pre-warming (background fetch of low-zoom tiles) ========== */

/**
 * Convert lng/lat to slippy-map tile coordinates at a given zoom.
 * Standard Web Mercator formula.
 */
function lngLatToTile(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return [Math.max(0, Math.min(x, n - 1)), Math.max(0, Math.min(y, n - 1))];
}

/**
 * Pre-fetch tiles for Peru at low zoom levels (z3–z8) in the background.
 * Uses low-priority fetch so it doesn't compete with visible tile requests.
 * Tiles are cached by the browser HTTP cache, making zoom-out transitions instant.
 */
function prewarmTiles(templateUrl: string) {
  const PERU_SW: [number, number] = [-81.4, -18.4];
  const PERU_NE: [number, number] = [-68.7, -0.1];

  const urls: string[] = [];
  for (let z = 3; z <= 8; z++) {
    const [x0, y0] = lngLatToTile(PERU_SW[0], PERU_NE[1], z); // NW corner
    const [x1, y1] = lngLatToTile(PERU_NE[0], PERU_SW[1], z); // SE corner
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        urls.push(templateUrl.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
      }
    }
  }

  // Fetch in small batches to avoid network congestion
  let i = 0;
  const BATCH = 6;
  function fetchBatch() {
    const batch = urls.slice(i, i + BATCH);
    if (!batch.length) return;
    i += BATCH;
    Promise.all(batch.map((u) => fetch(u, { priority: "low" } as RequestInit).catch(() => {}))).then(() => {
      // Small delay between batches to not starve interactive requests
      setTimeout(fetchBatch, 50);
    });
  }
  fetchBatch();
}

/* ========== Static paint/layout objects (P2 — hoisted, zero per-render allocation) ========== */

// ── Visibility helpers ──
const VIS_VISIBLE = { visibility: "visible" as const };
const VIS_NONE = { visibility: "none" as const };

// ── Priority zone paints (static — never depend on props) ──
const PRIORITY_FILL_PAINT: FillLayerSpecification["paint"] = { "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 };
const PRIORITY_DEP_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": PRIORITY_LINE, "line-width": 0.8, "line-opacity": 0.4 };
const PRIORITY_PROV_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": PRIORITY_LINE, "line-width": 0.6, "line-opacity": 0.4 };
const PRIORITY_DIST_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": PRIORITY_LINE, "line-width": 0.5, "line-opacity": 0.4 };

// ── Sector paints (static) ──
const SECTOR_FILL_PAINT: FillLayerSpecification["paint"] = { "fill-color": SECTOR_FILL, "fill-opacity": 0.8 };
const SECTOR_LINE_PAINT: LineLayerSpecification["paint"] = { "line-color": SECTOR_LINE, "line-width": 0.5, "line-opacity": 0.4 };

// ── Heatmap paint (static) ──
const HEATMAP_PAINT: HeatmapLayerSpecification["paint"] = {
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

// ── Cluster filters (static) ──
const HAS_POINT_COUNT: FilterSpecification = ["has", "point_count"];
const NOT_HAS_POINT_COUNT: FilterSpecification = ["!", ["has", "point_count"]];

// ── Cluster ring paint (static) ──
const CLUSTER_RING_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": ["step", ["get", "point_count"], CLUSTER_COLORS[0], CLUSTER_STEPS[0], CLUSTER_COLORS[1], CLUSTER_STEPS[1], CLUSTER_COLORS[2], CLUSTER_STEPS[2], CLUSTER_COLORS[3], CLUSTER_STEPS[3], CLUSTER_COLORS[4]],
  "circle-radius": ["step", ["get", "point_count"], CLUSTER_SIZES[0] + 3, CLUSTER_STEPS[0], CLUSTER_SIZES[1] + 3, CLUSTER_STEPS[1], CLUSTER_SIZES[2] + 3, CLUSTER_STEPS[2], CLUSTER_SIZES[3] + 3, CLUSTER_STEPS[3], CLUSTER_SIZES[4] + 3],
  "circle-opacity": 0.1,
};

// ── Cluster circle paint (static) ──
const CLUSTER_CIRCLE_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": ["step", ["get", "point_count"], CLUSTER_COLORS[0], CLUSTER_STEPS[0], CLUSTER_COLORS[1], CLUSTER_STEPS[1], CLUSTER_COLORS[2], CLUSTER_STEPS[2], CLUSTER_COLORS[3], CLUSTER_STEPS[3], CLUSTER_COLORS[4]],
  "circle-radius": ["step", ["get", "point_count"], CLUSTER_SIZES[0], CLUSTER_STEPS[0], CLUSTER_SIZES[1], CLUSTER_STEPS[1], CLUSTER_SIZES[2], CLUSTER_STEPS[2], CLUSTER_SIZES[3], CLUSTER_STEPS[3], CLUSTER_SIZES[4]],
  "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-stroke-opacity": 0.7,
};

// ── Cluster count layout (static) ──
const CLUSTER_COUNT_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": "{point_count_abbreviated}",
  "text-size": ["step", ["get", "point_count"], 9, CLUSTER_STEPS[0], 10, CLUSTER_STEPS[1], 11, CLUSTER_STEPS[2], 12, CLUSTER_STEPS[3], 14],
  "text-font": ["Open Sans Bold"], "text-allow-overlap": true,
};
const CLUSTER_COUNT_PAINT: SymbolLayerSpecification["paint"] = { "text-color": "#ffffff" };

// ── Form points paint (static) ──
const FORM_POINTS_PAINT: CircleLayerSpecification["paint"] = {
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 10, 4, 14, 5.5, 18, 8],
  "circle-color": DATA_POINT,
  "circle-opacity": ["case", ["==", ["get", "is_filtered"], 1], 0.8, 0.2],
  "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 14, 2],
  "circle-stroke-color": "#ffffff", "circle-stroke-opacity": 0.85,
};

// ── Agent paints (static for most — selected ring depends on primaryColor) ──
const AGENT_SELECTED_FILTER: FilterSpecification = ["==", ["get", "is_selected"], 1];
const AGENT_CONNECTED_FILTER: FilterSpecification = ["==", ["get", "status"], "connected"];
const AGENT_PULSE_PAINT: CircleLayerSpecification["paint"] = { "circle-radius": 18, "circle-color": STATUS_COLORS.connected, "circle-opacity": 0.12 };
const AGENT_LABELS_LAYOUT: SymbolLayerSpecification["layout"] = { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.8], "text-allow-overlap": false, "text-font": ["Open Sans Bold"] };
const AGENT_LABELS_PAINT: SymbolLayerSpecification["paint"] = { "text-color": "#1e293b", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.5 };
const AGENT_COUNT_LAYOUT: SymbolLayerSpecification["layout"] = { "text-field": ["to-string", ["get", "forms_count"]], "text-size": 9, "text-allow-overlap": true, "text-font": ["Open Sans Bold"] };
const AGENT_COUNT_PAINT: SymbolLayerSpecification["paint"] = { "text-color": "#ffffff" };

// ── Source promoteId (P5 — static, never changes) ──
const PROMOTE_ID = { departamentos: "coddep", provincias: "codprov_full", distritos: "ubigeo" };

/* ========== Component (P6 — wrapped with memo) ========== */

export const TierraMap = memo(forwardRef<TierraMapHandle, TierraMapProps>(function TierraMap(
  { campaignId, slug, primaryColor, agents, forms, selectedAgentId, onSelectAgent, showTracking, showDatos, showHeatmap, drillState, onDrillChange },
  ref,
) {
  const mapRef = useRef<MapRef | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const skipNextFitRef = useRef(false);
  const isZoomingRef = useRef(false);
  const zoomEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Refs for volatile values (stable callbacks read these) ───
  const drillStateRef = useRef(drillState);
  drillStateRef.current = drillState;
  const selectedAgentIdRef = useRef(selectedAgentId);
  selectedAgentIdRef.current = selectedAgentId;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // ─── Hooks ───
  const filters = useDrillFilters(drillState, campaignId);
  const agentsGeoJson = useAgentsSource(agents, selectedAgentId);
  const { formsGeoJson, formsHeatGeoJson } = useFormSources(forms, selectedAgentId);

  useAutoFit(mapRef, drillState, skipNextFitRef);
  const { tooltipRef, onMouseMove: tooltipMouseMove, onMouseLeave: tooltipMouseLeave } = useZoneTooltip(isZoomingRef);

  // ─── P5: Memoize tiles array (new array = new Source in react-maplibre) ───
  const tilesArray = useMemo(() => tileUrl ? [tileUrl] : [], [tileUrl]);

  // ─── P2: Memoize dynamic paint objects that depend on drillState ───
  //
  // Mask system: uses a fixed dark fill-color (MASK_COLOR) with data-driven
  // fill-opacity. This is faster than interpolating RGBA colors because the
  // GPU only varies one float (opacity) per feature instead of four (r,g,b,a).
  // With transition.duration=0 in the style, changes are instant — no desfase
  // between the mask and the flyTo animation.

  const depFillPaint = useMemo((): FillLayerSpecification["paint"] => {
    if (drillState.level === 0) {
      // Active level: hover-aware, transparent base
      return {
        "fill-color": ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL],
        "fill-opacity": 1,
      };
    }
    // Mask mode: darken all except selected dep
    return {
      "fill-color": MASK_COLOR,
      "fill-opacity": drillState.depCode
        ? ["case",
            ["==", ["get", "coddep"], drillState.depCode], MASK_OPACITY_ACTIVE,
            MASK_OPACITY_DIM,
          ]
        : MASK_OPACITY_ACTIVE,
    };
  }, [drillState.level, drillState.depCode]);

  const depLinePaint = useMemo((): LineLayerSpecification["paint"] => ({
    "line-color": drillState.level === 0 ? ZONE_LINE : ZONE_LINE_GHOST,
    "line-width": drillState.level === 0 ? 1.2 : 0.6,
    "line-opacity": drillState.level === 0 ? 0.7 : 0.3,
  }), [drillState.level]);

  const provFillPaint = useMemo((): FillLayerSpecification["paint"] => {
    if (drillState.level === 1) {
      // Active level: hover-aware, transparent base
      return {
        "fill-color": ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL],
        "fill-opacity": 1,
      };
    }
    // Mask mode: darken all except selected prov
    return {
      "fill-color": MASK_COLOR,
      "fill-opacity": drillState.provCode
        ? ["case",
            ["==", ["get", "codprov_full"], drillState.provCode], MASK_OPACITY_ACTIVE,
            MASK_OPACITY_DIM,
          ]
        : MASK_OPACITY_ACTIVE,
    };
  }, [drillState.level, drillState.provCode]);

  const provLinePaint = useMemo((): LineLayerSpecification["paint"] => ({
    "line-color": drillState.level === 1 ? ZONE_LINE : ZONE_LINE_GHOST,
    "line-width": drillState.level === 1 ? 1 : 0.5,
    "line-opacity": drillState.level === 1 ? 0.7 : 0.2,
  }), [drillState.level]);

  const distFillPaint = useMemo((): FillLayerSpecification["paint"] => {
    if (drillState.level === 2) {
      // Active level: hover-aware, transparent base
      return {
        "fill-color": ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL],
        "fill-opacity": 1,
      };
    }
    // Mask mode: darken all except selected dist
    return {
      "fill-color": MASK_COLOR,
      "fill-opacity": drillState.distCode
        ? ["case",
            ["==", ["get", "ubigeo"], drillState.distCode], MASK_OPACITY_ACTIVE,
            MASK_OPACITY_DIM,
          ]
        : MASK_OPACITY_ACTIVE,
    };
  }, [drillState.level, drillState.distCode]);

  const distLinePaint = useMemo((): LineLayerSpecification["paint"] => ({
    "line-color": ZONE_LINE,
    "line-width": drillState.level >= 3 ? 1.2 : 0.8,
    "line-opacity": 0.6,
  }), [drillState.level]);

  // ─── P2: Agent paint objects that depend on primaryColor ───
  const agentSelectedRingPaint = useMemo((): CircleLayerSpecification["paint"] => ({
    "circle-radius": 24, "circle-color": primaryColor, "circle-opacity": 0.2,
  }), [primaryColor]);

  const agentCirclesPaint = useMemo((): CircleLayerSpecification["paint"] => ({
    "circle-radius": ["case", ["==", ["get", "is_selected"], 1], 12, 9],
    "circle-color": ["match", ["get", "status"], "connected", STATUS_COLORS.connected, "idle", STATUS_COLORS.idle, "inactive", STATUS_COLORS.inactive, primaryColor],
    "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff",
  }), [primaryColor]);

  // ─── P1: Visibility layout objects for always-mounted Sources ───
  const heatmapVisibility = useMemo(() => showHeatmap ? VIS_VISIBLE : VIS_NONE, [showHeatmap]);
  const datosVisibility = useMemo(() => showDatos ? VIS_VISIBLE : VIS_NONE, [showDatos]);
  const trackingVisibility = useMemo(() => showTracking ? VIS_VISIBLE : VIS_NONE, [showTracking]);

  // ─── Cluster count layout merged with visibility ───
  const clusterCountLayoutWithVis = useMemo(() => ({
    ...CLUSTER_COUNT_LAYOUT,
    ...(showDatos ? {} : { visibility: "none" as const }),
  }), [showDatos]);
  const agentLabelsLayoutWithVis = useMemo(() => ({
    ...AGENT_LABELS_LAYOUT,
    ...(showTracking ? {} : { visibility: "none" as const }),
  }), [showTracking]);
  const agentCountLayoutWithVis = useMemo(() => ({
    ...AGENT_COUNT_LAYOUT,
    ...(showTracking ? {} : { visibility: "none" as const }),
  }), [showTracking]);

  // ─── Imperative handle ───
  useImperativeHandle(ref, () => ({
    flyToPoint(lng: number, lat: number, zoom = 17) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: FLY_DURATION, essential: true });
    },
    getDrillState() { return drillStateRef.current; },
  }), []);

  // ─── Init (SSR guard: window.location only available client-side) ───
  useEffect(() => {
    setTileUrl(`${window.location.origin}${DEFAULT_TILE_TEMPLATE}`);
    setReady(true);
  }, []);

  // ─── Map load ───
  const handleLoad = useCallback(() => {
    mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 20, duration: 0 });

    // Pre-warm low-zoom tiles so zoom-out transitions are instant.
    // These tiles cover all of Peru at z3-z8 and will be cached by the
    // browser HTTP cache + MapLibre internal tile cache, eliminating the
    // "loading by squares" effect when navigating back from a drill-down.
    if (tileUrl) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => prewarmTiles(tileUrl), { timeout: 3000 });
      } else {
        setTimeout(() => prewarmTiles(tileUrl), 1000);
      }
    }
  }, [tileUrl]);

  // ─── Zoom tracking via react-maplibre callbacks (not native map.on) ───
  // Using the declarative onMoveStart/onMoveEnd props keeps event registration
  // managed by react-maplibre and avoids orphaned listeners on unmount.
  const handleMoveStart = useCallback(() => {
    isZoomingRef.current = true;
    if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
  }, []);

  const handleMoveEnd = useCallback(() => {
    zoomEndTimer.current = setTimeout(() => { isZoomingRef.current = false; }, 300);
  }, []);

  // ─── Click handler (stable — reads from refs) ───
  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const currentDrill = drillStateRef.current;
    const currentSelectedAgent = selectedAgentIdRef.current;
    const currentAgents = agentsRef.current;
    const features = e.features;

    if (!features?.length) {
      // Empty space → go back one level
      if (currentDrill.level > 0) {
        const newLevel = (currentDrill.level - 1) as DrillLevel;
        const newState = { ...currentDrill, level: newLevel };
        if (newLevel < 4) { newState.sector = null; newState.sectorName = null; }
        if (newLevel < 3) { newState.distCode = null; newState.distName = null; }
        if (newLevel < 2) { newState.provCode = null; newState.provName = null; }
        if (newLevel < 1) { newState.depCode = null; newState.depName = null; }
        onDrillChange(newState);
        if (newLevel === 0) {
          mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: FLY_DURATION });
        }
      }
      return;
    }

    const f = features[0];
    const layerId = f.layer?.id;

    // Cluster → expand + auto-drill to distrito via reverse geocode
    if (layerId === "forms-clusters" || layerId === "forms-cluster-ring") {
      const clusterId = f.properties?.cluster_id;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      const [lng, lat] = coords;

      if (clusterId != null && mapRef.current) {
        const map = mapRef.current.getMap();
        const source = map.getSource("forms-clustered") as GeoJSONSource | undefined;

        const flyToZoom = (targetZoom: number) => {
          mapRef.current?.flyTo({ center: [lng, lat], zoom: targetZoom, duration: FLY_DURATION, essential: true });
        };

        if (source && typeof source.getClusterExpansionZoom === "function") {
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            flyToZoom(Math.min(zoom + 0.5, 18));
          }).catch(() => {
            flyToZoom(Math.min((mapRef.current?.getZoom() ?? 10) + 2, 18));
          });
        } else {
          flyToZoom(Math.min((mapRef.current?.getZoom() ?? 10) + 2, 18));
        }

        // Auto-drill to distrito: reverse geocode the cluster center
        skipNextFitRef.current = true;
        reverseGeocode(lng, lat).then((res) => {
          if (!res.ok || !res.result) return;
          const r = res.result;
          onDrillChange({
            level: 3,
            depCode: r.coddep,
            depName: r.departamento,
            provCode: r.codprov_full,
            provName: r.provincia,
            distCode: r.ubigeo,
            distName: r.distrito,
            sector: null,
            sectorName: null,
          });
        }).catch(() => { /* ignore — drill stays at current level */ });
      }
      return;
    }

    // Agent → toggle selection
    if (layerId === "agents-circles" || layerId === "agents-selected-ring") {
      const agentId = f.properties?.agent_id;
      if (agentId) {
        if (currentSelectedAgent === agentId) { onSelectAgent(null); }
        else {
          onSelectAgent(agentId);
          const agent = currentAgents.find((a) => a.id === agentId);
          if (agent) mapRef.current?.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: FLY_DURATION });
        }
      }
      return;
    }

    // Drill navigation
    const isDep = layerId === "dep-fill" || layerId?.startsWith("priority-dep");
    const isProv = layerId === "prov-fill" || layerId?.startsWith("priority-prov");
    const isDist = layerId === "dist-fill" || layerId?.startsWith("priority-dist");
    const isSector = layerId?.startsWith("sector");
    const isSubsector = false; // subsectors now handled within sector click via tile properties

    // Ghost layer click → go back
    const clickedLevel = isDep ? 0 : isProv ? 1 : isDist ? 2 : isSector ? 3 : isSubsector ? 4 : -1;
    if (clickedLevel >= 0 && clickedLevel < currentDrill.level) {
      const newLevel = (currentDrill.level - 1) as DrillLevel;
      const newState = { ...currentDrill, level: newLevel };
      if (newLevel < 4) { newState.sector = null; newState.sectorName = null; }
      if (newLevel < 3) { newState.distCode = null; newState.distName = null; }
      if (newLevel < 2) { newState.provCode = null; newState.provName = null; }
      if (newLevel < 1) { newState.depCode = null; newState.depName = null; }
      onDrillChange(newState);
      if (newLevel === 0) {
        mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: FLY_DURATION });
      }
      return;
    }

    if (isDep) {
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? "");
      const name = String(f.properties?.departamento ?? f.properties?.departamen ?? f.properties?.DEPARTAMEN ?? coddep);
      if (coddep) {
        preloadProvincias(coddep);
        const bounds = getBoundsFromFeature(f);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
        skipNextFitRef.current = true;
        onDrillChange({ ...INITIAL_DRILL, level: 1, depCode: coddep, depName: name });
      }
      return;
    }

    if (isProv) {
      const codprovFull = String(f.properties?.codprov_full ?? ((f.properties?.CODDEP ?? "") + (f.properties?.CODPROV ?? "")));
      const name = String(f.properties?.provincia ?? f.properties?.PROVINCIA ?? codprovFull);
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? currentDrill.depCode ?? "");
      if (codprovFull) {
        preloadDistritos(codprovFull);
        const bounds = getBoundsFromFeature(f);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
        skipNextFitRef.current = true;
        onDrillChange({ ...currentDrill, level: 2, provCode: codprovFull, provName: name, depCode: coddep, distCode: null, distName: null, sector: null, sectorName: null });
      }
      return;
    }

    if (isDist) {
      const ubigeo = String(f.properties?.ubigeo ?? f.properties?.UBIGEO ?? "");
      const name = String(f.properties?.distrito ?? f.properties?.DISTRITO ?? ubigeo);
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? currentDrill.depCode ?? "");
      const depName = String(f.properties?.departamento ?? f.properties?.DEPARTAMEN ?? currentDrill.depName ?? "");
      const codprovFull = String(f.properties?.codprov_full ?? (((f.properties?.CODDEP ?? "") + (f.properties?.CODPROV ?? "")) || (currentDrill.provCode ?? "")));
      const provName = String(f.properties?.provincia ?? f.properties?.PROVINCIA ?? currentDrill.provName ?? "");
      if (ubigeo) {
        const bounds = getBoundsFromFeature(f);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
        skipNextFitRef.current = true;
        onDrillChange({ level: 3, depCode: coddep, depName, provCode: codprovFull, provName, distCode: ubigeo, distName: name, sector: null, sectorName: null });
      }
      return;
    }

    if (isSector) {
      const sectorNum = f.properties?.sector != null ? Number(f.properties.sector) :
        f.properties?.SECTOR != null ? Number(f.properties.SECTOR) : null;
      if (sectorNum != null) {
        const bounds = getBoundsFromFeature(f);
        onDrillChange({ ...currentDrill, level: 4, sector: sectorNum, sectorName: `Sector ${sectorNum}` });
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
      }
      return;
    }

    if (isSubsector) {
      const bounds = getBoundsFromFeature(f);
      if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
    }
  }, [onDrillChange, onSelectAgent]); // stable — reads volatile values from refs

  // ─── Feature-state hover tracking (zero React re-renders) ───
  const hoveredRef = useRef<{ source: string; sourceLayer: string; id: string | number } | null>(null);

  const clearHover = useCallback(() => {
    const prev = hoveredRef.current;
    if (prev && mapRef.current) {
      const map = mapRef.current.getMap();
      try { map.setFeatureState({ source: prev.source, sourceLayer: prev.sourceLayer, id: prev.id }, { hover: false }); } catch { /* layer may not exist yet */ }
    }
    hoveredRef.current = null;
  }, []);

  // ─── Mouse handlers (cursor + zone name tooltip + hover state) ───
  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const features = e.features;
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = features?.length ? "pointer" : "";
    }

    // Feature-state hover for zone fill layers
    const f = features?.[0];
    const layerId = f?.layer?.id ?? "";
    const sourceLayer = HOVER_LAYERS[layerId];

    if (sourceLayer && f?.id != null) {
      const prev = hoveredRef.current;
      // Only update if different feature
      if (!prev || prev.id !== f.id || prev.sourceLayer !== sourceLayer) {
        clearHover();
        const map = mapRef.current?.getMap();
        if (map) {
          try { map.setFeatureState({ source: "peru", sourceLayer, id: f.id }, { hover: true }); } catch { /* ignore */ }
          hoveredRef.current = { source: "peru", sourceLayer, id: f.id };
        }
      }
    } else {
      clearHover();
    }

    tooltipMouseMove(e);
  }, [tooltipMouseMove, clearHover]);

  const handleMouseLeave = useCallback(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
    clearHover();
    tooltipMouseLeave();
  }, [tooltipMouseLeave, clearHover]);

  // ─── FlyTo on agent selection (NOT on agents array change) ───
  const prevSelectedRef = useRef(selectedAgentId);
  useEffect(() => {
    // Only fly when the selection actually changes, not when agents array updates
    if (selectedAgentId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedAgentId;

    if (selectedAgentId && mapRef.current) {
      const agent = agents.find((a) => a.id === selectedAgentId);
      if (agent) mapRef.current.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: FLY_DURATION });
    }
  }, [selectedAgentId, agents]);

  // ─── Resize: recalibrate + re-fit when panels change container size ───
  const roRef = useRef<ResizeObserver | null>(null);
  const roTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roPrevSize = useRef({ w: 0, h: 0 });

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (roTimerRef.current) {
      clearTimeout(roTimerRef.current);
      roTimerRef.current = null;
    }
    if (!node) return;

    roPrevSize.current = { w: node.clientWidth, h: node.clientHeight };

    roRef.current = new ResizeObserver(() => {
      if (roTimerRef.current) clearTimeout(roTimerRef.current);
      roTimerRef.current = setTimeout(() => {
        const map = mapRef.current;
        if (!map || !node) return;
        const w = node.clientWidth;
        const h = node.clientHeight;
        const dw = Math.abs(w - roPrevSize.current.w);
        const dh = Math.abs(h - roPrevSize.current.h);
        roPrevSize.current = { w, h };

        map.resize();

        // Re-fit to current drill level bounds (not always Peru)
        if (dw > 50 || dh > 50) {
          const drill = drillStateRef.current;
          if (drill.level === 0) {
            map.fitBounds(PERU_BOUNDS, { padding: 30, duration: RESIZE_FLY_DURATION });
          } else if (drill.level >= 3 && drill.provCode && drill.distCode) {
            getDistritos(drill.provCode).then((r) => {
              if (!r.ok || !r.distritos || !mapRef.current) return;
              const d = r.distritos.find((x) => x.ubigeo === drill.distCode);
              if (d) mapRef.current.fitBounds(d.bounds, { padding: 40, duration: RESIZE_FLY_DURATION });
            }).catch(() => {});
          } else if (drill.level === 2 && drill.depCode && drill.provCode) {
            getProvincias(drill.depCode).then((r) => {
              if (!r.ok || !r.provincias || !mapRef.current) return;
              const p = r.provincias.find((x) => x.codprov_full === drill.provCode);
              if (p) mapRef.current.fitBounds(p.bounds, { padding: 40, duration: RESIZE_FLY_DURATION });
            }).catch(() => {});
          } else if (drill.level === 1 && drill.depCode) {
            getDepartamentos().then((r) => {
              if (!r.ok || !r.departamentos || !mapRef.current) return;
              const dep = r.departamentos.find((x) => x.coddep === drill.depCode);
              if (dep) mapRef.current.fitBounds(dep.bounds, { padding: 40, duration: RESIZE_FLY_DURATION });
            }).catch(() => {});
          } else {
            map.fitBounds(PERU_BOUNDS, { padding: 30, duration: RESIZE_FLY_DURATION });
          }
        }
      }, 350);
    });
    roRef.current.observe(node);
  }, []);

  // ─── Cleanup ───
  useEffect(() => () => {
    if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
  }, []);

  // ─── Loading ───
  if (!ready || !tileUrl) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" }}>
        <span style={{ color: "#64748b", fontSize: 13 }}>Cargando mapa...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <MapLibre
        ref={mapRef}
        initialViewState={PERU_VIEW}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        maxTileCacheZoomLevels={10}
        onLoad={handleLoad}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={INTERACTIVE_LAYERS as unknown as string[]}
      >
        {/* ── Tegola vector tiles ── */}
        <Source id="peru" type="vector" tiles={tilesArray} minzoom={0} maxzoom={14} bounds={PERU_BOUNDS_FLAT} promoteId={PROMOTE_ID}>

          {/* DEPARTAMENTOS */}
          <Layer id="dep-fill" type="fill" source-layer="departamentos" filter={filters.depFillFilter} paint={depFillPaint} />
          <Layer id="dep-line" type="line" source-layer="departamentos" filter={filters.depLineFilter} paint={depLinePaint} />

          {/* PROVINCIAS */}
          <Layer id="prov-fill" type="fill" source-layer="provincias" filter={filters.provFillFilter} paint={provFillPaint} />
          <Layer id="prov-line" type="line" source-layer="provincias" filter={filters.provLineFilter} paint={provLinePaint} />

          {/* DISTRITOS */}
          <Layer id="dist-fill" type="fill" source-layer="distritos" filter={filters.distFillFilter} paint={distFillPaint} />
          <Layer id="dist-line" type="line" source-layer="distritos" filter={filters.distLineFilter} paint={distLinePaint} />

          {/* PRIORITY ZONES */}
          <Layer id="priority-dep-fill" type="fill" source-layer="priority_departamentos" filter={filters.priorityDepFilter} paint={PRIORITY_FILL_PAINT} />
          <Layer id="priority-dep-line" type="line" source-layer="priority_departamentos" filter={filters.priorityDepFilter} paint={PRIORITY_DEP_LINE_PAINT} />
          <Layer id="priority-prov-fill" type="fill" source-layer="priority_provincias" filter={filters.priorityProvFilter} paint={PRIORITY_FILL_PAINT} />
          <Layer id="priority-prov-line" type="line" source-layer="priority_provincias" filter={filters.priorityProvFilter} paint={PRIORITY_PROV_LINE_PAINT} />
          <Layer id="priority-dist-fill" type="fill" source-layer="priority_distritos" filter={filters.priorityDistFilter} paint={PRIORITY_FILL_PAINT} />
          <Layer id="priority-dist-line" type="line" source-layer="priority_distritos" filter={filters.priorityDistFilter} paint={PRIORITY_DIST_LINE_PAINT} />

          {/* SECTORS */}
          <Layer id="sector-fill" type="fill" source-layer="campaign_sectors" filter={filters.sectorFilter} paint={SECTOR_FILL_PAINT} />
          <Layer id="sector-line" type="line" source-layer="campaign_sectors" filter={filters.sectorFilter} paint={SECTOR_LINE_PAINT} />
        </Source>

        {/* ── P1: Heatmap — always mounted, visibility controlled via layout ── */}
        <Source id="forms-heat" type="geojson" data={formsHeatGeoJson}>
          <Layer id="forms-heatmap" type="heatmap" layout={heatmapVisibility} paint={HEATMAP_PAINT} />
        </Source>

        {/* ── P1: Clustered form data — always mounted, visibility controlled via layout ── */}
        <Source id="forms-clustered" type="geojson" data={formsGeoJson} cluster clusterRadius={40} clusterMaxZoom={16}>
          <Layer id="forms-cluster-ring" type="circle" filter={HAS_POINT_COUNT} layout={datosVisibility} paint={CLUSTER_RING_PAINT} />
          <Layer id="forms-clusters" type="circle" filter={HAS_POINT_COUNT} layout={datosVisibility} paint={CLUSTER_CIRCLE_PAINT} />
          <Layer id="forms-cluster-count" type="symbol" filter={HAS_POINT_COUNT} layout={clusterCountLayoutWithVis} paint={CLUSTER_COUNT_PAINT} />
          <Layer id="forms-points" type="circle" filter={NOT_HAS_POINT_COUNT} layout={datosVisibility} paint={FORM_POINTS_PAINT} />
        </Source>

        {/* ── P1: Agent markers — always mounted, visibility controlled via layout ── */}
        <Source id="agents" type="geojson" data={agentsGeoJson}>
          <Layer id="agents-selected-ring" type="circle" filter={AGENT_SELECTED_FILTER} layout={trackingVisibility} paint={agentSelectedRingPaint} />
          <Layer id="agents-pulse" type="circle" filter={AGENT_CONNECTED_FILTER} layout={trackingVisibility} paint={AGENT_PULSE_PAINT} />
          <Layer id="agents-circles" type="circle" layout={trackingVisibility} paint={agentCirclesPaint} />
          <Layer id="agents-labels" type="symbol" minzoom={10} layout={agentLabelsLayoutWithVis} paint={AGENT_LABELS_PAINT} />
          <Layer id="agents-count" type="symbol" minzoom={8} layout={agentCountLayoutWithVis} paint={AGENT_COUNT_PAINT} />
        </Source>
      </MapLibre>

      {/* ── Zone name tooltip — persistent div, positioned via CSS transform (GPU-composited) ── */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          backgroundColor: "rgba(15, 23, 42, 0.88)",
          color: "#f8fafc",
          fontSize: 12,
          fontWeight: 600,
          padding: "5px 10px",
          borderRadius: 6,
          whiteSpace: "nowrap",
          zIndex: 20,
          opacity: 0,
          willChange: "transform",
          transform: "translate(0px, 0px)",
          transition: "opacity 120ms ease-out",
        }}
      />
    </div>
  );
}));
