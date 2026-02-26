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
 * [P2] Hoisted paint/layout — All static paint/layout/filter objects live in
 *      map-paint-constants.ts (zero per-render allocation). Dynamic objects use
 *      useMemo with minimal deps.
 *
 * [P3] Stable callbacks with refs — High-frequency handlers (onClick, onMouseMove)
 *      read volatile data from refs instead of closing over state.
 *
 * [P4] Feature-state hover — Uses MapLibre's setFeatureState API for hover effects
 *      instead of React state. Zero React re-renders during mouse movement.
 *
 * [P5] Memoized Source props — tiles array, promoteId object, and GeoJSON data
 *      are useMemo'd. New reference = Source rebuild in react-maplibre.
 *
 * [P6] memo(forwardRef) — Prevents cascade re-renders from parent.
 *
 * [P7] interactiveLayerIds as module constant — Must be referentially stable.
 */

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, Source } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { FillLayerSpecification, LineLayerSpecification, CircleLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TierraMapHandle, TierraMapProps } from "./types";
import {
  STATUS_COLORS, ZONE_FILL, ZONE_HOVER, ZONE_LINE, ZONE_LINE_GHOST, MASK_FILL, HOVER_LAYERS,
  PERU_VIEW, PERU_BOUNDS, PERU_BOUNDS_FLAT, PERU_MAX_BOUNDS, MAP_STYLE, DEFAULT_TILE_TEMPLATE, INTERACTIVE_LAYERS,
  FLY_DURATION,
} from "./constants";
import { prewarmTiles } from "./utils";
import {
  VIS_VISIBLE, VIS_NONE, PROMOTE_ID,
  PRIORITY_FILL_PAINT, PRIORITY_DEP_LINE_PAINT, PRIORITY_PROV_LINE_PAINT, PRIORITY_DIST_LINE_PAINT,
  SECTOR_FILL_PAINT, SECTOR_LINE_PAINT,
  HAS_POINT_COUNT, NOT_HAS_POINT_COUNT,
  CLUSTER_RING_PAINT, CLUSTER_CIRCLE_PAINT, CLUSTER_COUNT_LAYOUT, CLUSTER_COUNT_PAINT,
  FORM_POINTS_PAINT,
  AGENT_SELECTED_FILTER, AGENT_CONNECTED_FILTER, AGENT_PULSE_PAINT,
  AGENT_LABELS_LAYOUT, AGENT_LABELS_PAINT, AGENT_COUNT_LAYOUT, AGENT_COUNT_PAINT,
  ROUTE_LINE_PAINT, ROUTE_LINE_LAYOUT, ROUTE_CASING_PAINT,
  ROUTE_WAYPOINT_PAINT, ROUTE_WAYPOINT_START_PAINT, ROUTE_WAYPOINT_START_FILTER, ROUTE_WAYPOINT_MID_FILTER,
  ROUTE_SEQ_LAYOUT, ROUTE_SEQ_PAINT,
} from "./map-paint-constants";

import { useDrillFilters } from "./hooks/use-drill-filters";
import { useAgentsSource, useFormSources } from "./hooks/use-map-sources";
import { useSurveyorRoutes } from "./hooks/use-surveyor-routes";
import { useAutoFit } from "./hooks/use-auto-fit";
import { useZoneTooltip } from "./hooks/use-zone-tooltip";
import { useFormTooltip } from "./hooks/use-form-tooltip";
import { useMapClick } from "./hooks/use-map-click";
import { useMapResize } from "./hooks/use-map-resize";
import { reverseGeocode } from "@/lib/services/geo";

/* ========== Component (P6 — wrapped with memo) ========== */

export const TierraMap = memo(forwardRef<TierraMapHandle, TierraMapProps>(function TierraMap(
  { campaignId, slug, primaryColor, agents, forms, selectedAgentId, onSelectAgent, showTracking, showDatos, showRoutes, drillState, onDrillChange },
  ref,
) {
  const mapRef = useRef<MapRef | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const skipNextFitRef = useRef(false);
  const isZoomingRef = useRef(false);
  const zoomEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set to true before any flyTo that should auto-drill — moveEnd will reverse-geocode the map center */
  const pendingDrillRef = useRef(false);

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
  const { formsGeoJson } = useFormSources(forms, selectedAgentId);
  const { routesGeoJson, waypointsGeoJson } = useSurveyorRoutes(forms, selectedAgentId);

  useAutoFit(mapRef, drillState, skipNextFitRef);
  const { tooltipRef, onMouseMove: tooltipMouseMove, onMouseLeave: tooltipMouseLeave } = useZoneTooltip(isZoomingRef);
  const { formTooltipRef, onFormMouseMove, onFormMouseLeave } = useFormTooltip(isZoomingRef, mapRef);
  const handleClick = useMapClick(mapRef, drillStateRef, selectedAgentIdRef, agentsRef, skipNextFitRef, pendingDrillRef, onDrillChange, onSelectAgent);
  const containerRef = useMapResize(mapRef, drillStateRef);

  // ─── P5: Memoize tiles array (new array = new Source in react-maplibre) ───
  const tilesArray = useMemo(() => tileUrl ? [tileUrl] : [], [tileUrl]);

  // ─── P2: Memoize dynamic paint objects that depend on drillState ───

  const depFillPaint = useMemo((): FillLayerSpecification["paint"] => ({
    "fill-color": drillState.level === 0
      ? ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL]
      : drillState.depCode
        ? ["case", ["==", ["get", "coddep"], drillState.depCode], ZONE_FILL, MASK_FILL]
        : ZONE_FILL,
    "fill-opacity": 1,
  }), [drillState.level, drillState.depCode]);

  const depLinePaint = useMemo((): LineLayerSpecification["paint"] => ({
    "line-color": drillState.level === 0 ? ZONE_LINE : ZONE_LINE_GHOST,
    "line-width": drillState.level === 0 ? 1.2 : 0.6,
    "line-opacity": drillState.level === 0 ? 0.7 : 0.3,
  }), [drillState.level]);

  const provFillPaint = useMemo((): FillLayerSpecification["paint"] => ({
    "fill-color": drillState.level === 1
      ? ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL]
      : drillState.provCode
        ? ["case", ["==", ["get", "codprov_full"], drillState.provCode], ZONE_FILL, MASK_FILL]
        : ZONE_FILL,
    "fill-opacity": 1,
  }), [drillState.level, drillState.provCode]);

  const provLinePaint = useMemo((): LineLayerSpecification["paint"] => ({
    "line-color": drillState.level === 1 ? ZONE_LINE : ZONE_LINE_GHOST,
    "line-width": drillState.level === 1 ? 1 : 0.5,
    "line-opacity": drillState.level === 1 ? 0.7 : 0.2,
  }), [drillState.level]);

  const distFillPaint = useMemo((): FillLayerSpecification["paint"] => ({
    "fill-color": drillState.level === 2
      ? ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL]
      : drillState.distCode
        ? ["case", ["==", ["get", "ubigeo"], drillState.distCode], ZONE_FILL, MASK_FILL]
        : ZONE_FILL,
    "fill-opacity": 1,
  }), [drillState.level, drillState.distCode]);

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
    "circle-opacity": 1,
    "circle-stroke-opacity": 1,
  }), [primaryColor]);

  // ─── P1: Visibility layout objects for always-mounted Sources ───
  const datosVisibility = useMemo(() => showDatos ? VIS_VISIBLE : VIS_NONE, [showDatos]);
  const trackingVisibility = useMemo(() => showTracking ? VIS_VISIBLE : VIS_NONE, [showTracking]);
  const routesVisibility = useMemo(() => showRoutes ? VIS_VISIBLE : VIS_NONE, [showRoutes]);

  // ─── Route line layout merged with visibility ───
  const routeLineLayoutWithVis = useMemo(() => ({
    ...ROUTE_LINE_LAYOUT,
    ...(showRoutes ? {} : { visibility: "none" as const }),
  }), [showRoutes]);
  const routeSeqLayoutWithVis = useMemo(() => ({
    ...ROUTE_SEQ_LAYOUT,
    ...(showRoutes ? {} : { visibility: "none" as const }),
  }), [showRoutes]);

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
      skipNextFitRef.current = true;
      pendingDrillRef.current = true;
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: FLY_DURATION, essential: true });
    },
    getDrillState() { return drillStateRef.current; },
  }), []);

  // ─── Init (SSR guard) ───
  useEffect(() => {
    setTileUrl(`${window.location.origin}${DEFAULT_TILE_TEMPLATE}`);
    setReady(true);
  }, []);

  // ─── Map load ───
  const handleLoad = useCallback(() => {
    mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 20, duration: 0 });

    // Sandwich top: add label layer above all data layers.
    // The "carto-labels" source is pre-defined in MAP_STYLE so tiles start
    // downloading immediately on map init — no late mount delay.
    const map = mapRef.current?.getMap();
    if (map && !map.getLayer("carto-labels")) {
      map.addLayer({ id: "carto-labels", type: "raster", source: "carto-labels" });
    }

    if (tileUrl) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => prewarmTiles(tileUrl), { timeout: 3000 });
      } else {
        setTimeout(() => prewarmTiles(tileUrl), 1000);
      }
    }
  }, [tileUrl]);

  // ─── Zoom tracking via react-maplibre callbacks ───
  const handleMoveStart = useCallback(() => {
    isZoomingRef.current = true;
    if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
  }, []);

  const handleMoveEnd = useCallback(() => {
    zoomEndTimer.current = setTimeout(() => { isZoomingRef.current = false; }, 300);

    // After cluster flyTo lands, reverse-geocode the map center and drill
    // to the appropriate level based on how far we zoomed in.
    if (pendingDrillRef.current && mapRef.current) {
      pendingDrillRef.current = false;
      const center = mapRef.current.getCenter();
      const zoom = mapRef.current.getZoom();
      reverseGeocode(center.lng, center.lat).then((res) => {
        if (!res.ok || !res.result) return;
        const r = res.result;
        skipNextFitRef.current = true;

        // Progressive drill: pick level based on resulting zoom
        if (zoom < 7) {
          // Departamento level
          onDrillChange({
            level: 1, depCode: r.coddep, depName: r.departamento,
            provCode: null, provName: null,
            distCode: null, distName: null, sector: null, sectorName: null,
          });
        } else if (zoom < 9.5) {
          // Provincia level
          onDrillChange({
            level: 2, depCode: r.coddep, depName: r.departamento,
            provCode: r.codprov_full, provName: r.provincia,
            distCode: null, distName: null, sector: null, sectorName: null,
          });
        } else {
          // Distrito level
          onDrillChange({
            level: 3, depCode: r.coddep, depName: r.departamento,
            provCode: r.codprov_full, provName: r.provincia,
            distCode: r.ubigeo, distName: r.distrito, sector: null, sectorName: null,
          });
        }
      }).catch(() => {});
    }
  }, [onDrillChange]);

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

    const f = features?.[0];
    const layerId = f?.layer?.id ?? "";
    const sourceLayer = HOVER_LAYERS[layerId];

    if (sourceLayer && f?.id != null) {
      const prev = hoveredRef.current;
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
    onFormMouseMove(e);
  }, [tooltipMouseMove, onFormMouseMove, clearHover]);

  const handleMouseLeave = useCallback(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
    clearHover();
    tooltipMouseLeave();
    onFormMouseLeave();
  }, [tooltipMouseLeave, onFormMouseLeave, clearHover]);

  // ─── FlyTo on agent selection (NOT on agents array change) ───
  const prevSelectedRef = useRef(selectedAgentId);
  useEffect(() => {
    if (selectedAgentId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedAgentId;
    if (selectedAgentId && mapRef.current) {
      const agent = agents.find((a) => a.id === selectedAgentId);
      if (agent) {
        skipNextFitRef.current = true;
        pendingDrillRef.current = true;
        mapRef.current.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: FLY_DURATION });
      }
    }
  }, [selectedAgentId, agents]);

  // ─── Keep carto-labels on top after React reconciles data layers ───
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && map.getLayer("carto-labels")) {
      map.moveLayer("carto-labels");          // no 2nd arg → moves to top
    }
  });

  // ─── Cleanup ───
  useEffect(() => () => {
    if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
  }, []);

  // ─── Loading ───
  if (!ready || !tileUrl) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#e6e5e3" }}>
        <span style={{ color: "#64748b", fontSize: 13 }}>Cargando mapa...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, backgroundColor: "#e6e5e3" }}>
      <MapLibre
        ref={mapRef}
        initialViewState={PERU_VIEW}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        minZoom={1}
        maxBounds={PERU_MAX_BOUNDS}
        maxTileCacheZoomLevels={10}
        fadeDuration={0}
        onLoad={handleLoad}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={INTERACTIVE_LAYERS as unknown as string[]}
      >
        {/* ── Tegola vector tiles ── */}
        <Source id="peru" type="vector" tiles={tilesArray} minzoom={3} maxzoom={14} bounds={PERU_BOUNDS_FLAT} promoteId={PROMOTE_ID}>
          <Layer id="dep-fill" type="fill" source-layer="departamentos" filter={filters.depFillFilter} paint={depFillPaint} />
          <Layer id="dep-line" type="line" source-layer="departamentos" filter={filters.depLineFilter} paint={depLinePaint} />
          <Layer id="prov-fill" type="fill" source-layer="provincias" filter={filters.provFillFilter} paint={provFillPaint} />
          <Layer id="prov-line" type="line" source-layer="provincias" filter={filters.provLineFilter} paint={provLinePaint} />
          <Layer id="dist-fill" type="fill" source-layer="distritos" filter={filters.distFillFilter} paint={distFillPaint} />
          <Layer id="dist-line" type="line" source-layer="distritos" filter={filters.distLineFilter} paint={distLinePaint} />
          <Layer id="priority-dep-fill" type="fill" source-layer="priority_departamentos" filter={filters.priorityDepFilter} paint={PRIORITY_FILL_PAINT} />
          <Layer id="priority-dep-line" type="line" source-layer="priority_departamentos" filter={filters.priorityDepFilter} paint={PRIORITY_DEP_LINE_PAINT} />
          <Layer id="priority-prov-fill" type="fill" source-layer="priority_provincias" filter={filters.priorityProvFilter} paint={PRIORITY_FILL_PAINT} />
          <Layer id="priority-prov-line" type="line" source-layer="priority_provincias" filter={filters.priorityProvFilter} paint={PRIORITY_PROV_LINE_PAINT} />
          <Layer id="priority-dist-fill" type="fill" source-layer="priority_distritos" filter={filters.priorityDistFilter} paint={PRIORITY_FILL_PAINT} />
          <Layer id="priority-dist-line" type="line" source-layer="priority_distritos" filter={filters.priorityDistFilter} paint={PRIORITY_DIST_LINE_PAINT} />
          <Layer id="sector-fill" type="fill" source-layer="campaign_sectors" filter={filters.sectorFilter} paint={SECTOR_FILL_PAINT} />
          <Layer id="sector-line" type="line" source-layer="campaign_sectors" filter={filters.sectorFilter} paint={SECTOR_LINE_PAINT} />
        </Source>

        {/* ── Surveyor routes — always mounted, visibility controlled via layout ── */}
        <Source id="surveyor-routes" type="geojson" data={routesGeoJson}>
          <Layer id="routes-casing" type="line" layout={routeLineLayoutWithVis} paint={ROUTE_CASING_PAINT} />
          <Layer id="routes-line" type="line" layout={routeLineLayoutWithVis} paint={ROUTE_LINE_PAINT} />
        </Source>
        <Source id="surveyor-waypoints" type="geojson" data={waypointsGeoJson}>
          <Layer id="routes-waypoints-mid" type="circle" filter={ROUTE_WAYPOINT_MID_FILTER} layout={routesVisibility} paint={ROUTE_WAYPOINT_PAINT} />
          <Layer id="routes-waypoints-start" type="circle" filter={ROUTE_WAYPOINT_START_FILTER} layout={routesVisibility} paint={ROUTE_WAYPOINT_START_PAINT} />
          <Layer id="routes-seq" type="symbol" minzoom={10} layout={routeSeqLayoutWithVis} paint={ROUTE_SEQ_PAINT} />
        </Source>

        {/* ── Clustered form data — always mounted, visibility controlled via layout ── */}
        <Source id="forms-clustered" type="geojson" data={formsGeoJson} cluster clusterRadius={40} clusterMaxZoom={16}>
          <Layer id="forms-cluster-ring" type="circle" filter={HAS_POINT_COUNT} layout={datosVisibility} paint={CLUSTER_RING_PAINT} />
          <Layer id="forms-clusters" type="circle" filter={HAS_POINT_COUNT} layout={datosVisibility} paint={CLUSTER_CIRCLE_PAINT} />
          <Layer id="forms-cluster-count" type="symbol" filter={HAS_POINT_COUNT} layout={clusterCountLayoutWithVis} paint={CLUSTER_COUNT_PAINT} />
          <Layer id="forms-points" type="circle" filter={NOT_HAS_POINT_COUNT} layout={datosVisibility} paint={FORM_POINTS_PAINT} />
        </Source>

        {/* ── Agent markers — always mounted, visibility controlled via layout ── */}
        <Source id="agents" type="geojson" data={agentsGeoJson}>
          <Layer id="agents-selected-ring" type="circle" filter={AGENT_SELECTED_FILTER} layout={trackingVisibility} paint={agentSelectedRingPaint} />
          <Layer id="agents-pulse" type="circle" filter={AGENT_CONNECTED_FILTER} layout={trackingVisibility} paint={AGENT_PULSE_PAINT} />
          <Layer id="agents-circles" type="circle" layout={trackingVisibility} paint={agentCirclesPaint} />
          <Layer id="agents-labels" type="symbol" minzoom={10} layout={agentLabelsLayoutWithVis} paint={AGENT_LABELS_PAINT} />
          <Layer id="agents-count" type="symbol" minzoom={8} layout={agentCountLayoutWithVis} paint={AGENT_COUNT_PAINT} />
        </Source>

      </MapLibre>

      {/* ── Zone name tooltip ── */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute", top: 0, left: 0, pointerEvents: "none",
          backgroundColor: "rgba(15, 23, 42, 0.88)", color: "#f8fafc",
          fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 6,
          whiteSpace: "nowrap", zIndex: 20, opacity: 0, willChange: "transform",
          transform: "translate(0px, 0px)", transition: "opacity 120ms ease-out",
        }}
      />

      {/* ── Form point tooltip (glassmorphism) ── */}
      <div
        ref={formTooltipRef}
        style={{
          position: "absolute", top: 0, left: 0, pointerEvents: "none",
          background: "rgba(255, 255, 255, 0.72)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderRadius: 12, padding: "8px 12px", minWidth: 140, maxWidth: 200,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
          border: "1px solid rgba(255,255,255,0.5)",
          zIndex: 21, opacity: 0, willChange: "transform",
          transform: "translate(0px, 0px)", transition: "opacity 150ms ease-out",
        }}
      />
    </div>
  );
}));
