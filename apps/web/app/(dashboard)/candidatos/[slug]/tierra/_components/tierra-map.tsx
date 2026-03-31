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
import { Layer, Map as MapLibre, Marker, Source } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CameraNudge, TierraMapHandle, TierraMapProps } from "./types";
import {
  HOVER_LAYERS,
  PERU_VIEW, PERU_BOUNDS, PERU_BOUNDS_FLAT, PERU_MAX_BOUNDS, MAP_STYLES, DEFAULT_TILE_TEMPLATE, INTERACTIVE_LAYERS,
  FLY_DURATION,
} from "./constants";
import { prewarmTiles } from "./utils";
import {
  PROMOTE_ID,
  PRIORITY_FILL_PAINT, PRIORITY_DEP_LINE_PAINT, PRIORITY_PROV_LINE_PAINT, PRIORITY_DIST_LINE_PAINT,
  SECTOR_FILL_PAINT, SECTOR_LINE_PAINT,
  BARS_EXTRUSION_PAINT, BARS_LINE_PAINT,
  HAS_POINT_COUNT, NOT_HAS_POINT_COUNT,
  CLUSTER_COUNT_PAINT,
  FORM_POINTS_DARK_GLOW_PAINT,
  AGENT_SELECTED_FILTER, AGENT_CONNECTED_FILTER, AGENT_PULSE_PAINT,
  AGENT_LABELS_PAINT, AGENT_COUNT_PAINT,
  ROUTE_LINE_PAINT, ROUTE_CASING_PAINT,
  ROUTE_WAYPOINT_PAINT, ROUTE_WAYPOINT_START_PAINT, ROUTE_WAYPOINT_START_FILTER, ROUTE_WAYPOINT_MID_FILTER,
  ROUTE_SEQ_PAINT,
} from "./map-paint-constants";
import {
  MAP_DRAG_PAN_OPTIONS, CAMERA_PITCH_MIN, CAMERA_PITCH_MAX,
  clamp, boundsToInitialViewState, applyFluidMapInteractions, expandBounds, boundsToMinZoom,
} from "./map-camera-helpers";
import { useZonePaint, useLayerPaint } from "./hooks/use-zone-paint";

import { useDrillFilters } from "./hooks/use-drill-filters";
import { useAgentsSource, useFormSources, useNewPoints } from "./hooks/use-map-sources";
import { useSurveyorRoutes } from "./hooks/use-surveyor-routes";
import { useAutoFit } from "./hooks/use-auto-fit";
import { useZoneTooltip } from "./hooks/use-zone-tooltip";
import { useFormTooltip } from "./hooks/use-form-tooltip";
import { useMapClick } from "./hooks/use-map-click";
import { useMapResize } from "./hooks/use-map-resize";
import { reverseGeocode } from "@/lib/services/geo";

/* ========== Component (P6 — wrapped with memo) ========== */

export const TierraMap = memo(forwardRef<TierraMapHandle, TierraMapProps>(function TierraMap(
  { campaignId, slug, primaryColor, agents, forms, selectedAgentId, onSelectAgent, showTracking, showDatos, datosVizMode, heatmapRadius, heatmapOpacity, mapTheme, showRoutes, drillState, onDrillChange, onMapDoubleClick, lockedBounds, lockedDrillLevel },
  ref,
) {
  const mapRef = useRef<MapRef | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [barsZoom, setBarsZoom] = useState<number>(
    lockedBounds ? boundsToInitialViewState(lockedBounds).zoom : PERU_VIEW.zoom,
  );
  const skipNextFitRef = useRef(false);
  const skipLoadFitRef = useRef(false);
  const isZoomingRef = useRef(false);
  const zoomEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Set to true before any flyTo that should auto-drill.
   * NEVER set when lockedBounds is active — the map must not drift via reverse-geocode.
   */
  const pendingDrillRef = useRef(false);
  /**
   * When true, useAutoFit and handleLoad never touch the camera.
   * Pre-seeded from lockedBounds so it's active before the first render.
   */
  const disableAutoFitRef = useRef(!!lockedBounds);

  // ─── Refs for volatile values (stable callbacks read these) ───
  const drillStateRef = useRef(drillState);
  drillStateRef.current = drillState;
  const selectedAgentIdRef = useRef(selectedAgentId);
  selectedAgentIdRef.current = selectedAgentId;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // ─── Hooks ───
  const filters = useDrillFilters(drillState, campaignId, lockedDrillLevel);
  const agentsGeoJson = useAgentsSource(agents, selectedAgentId);
  const { formsGeoJson, barsGeoJson } = useFormSources(forms, selectedAgentId, barsZoom);
  const newPoints = useNewPoints(forms);
  const { routesGeoJson, waypointsGeoJson } = useSurveyorRoutes(forms, selectedAgentId);

  useAutoFit(mapRef, drillState, skipNextFitRef, disableAutoFitRef);
  const { tooltipRef, onMouseMove: tooltipMouseMove, onMouseLeave: tooltipMouseLeave } = useZoneTooltip(isZoomingRef, {
    forms,
    agents,
  });
  const { formTooltipRef, onFormMouseMove, onFormMouseLeave, showPinnedTooltip } = useFormTooltip(isZoomingRef, mapRef);
  const handleClick = useMapClick(mapRef, drillStateRef, selectedAgentIdRef, agentsRef, skipNextFitRef, pendingDrillRef, onDrillChange, onSelectAgent, lockedDrillLevel ?? null, lockedBounds ?? null);
  const containerRef = useMapResize(mapRef, drillStateRef);

  // ─── P5: Memoize tiles array (new array = new Source in react-maplibre) ───
  const tilesArray = useMemo(() => tileUrl ? [tileUrl] : [], [tileUrl]);

  // ─── P2: Memoized paint objects (extracted to hooks/use-zone-paint.ts) ───
  const { depFillPaint, depLinePaint, provFillPaint, provLinePaint, distFillPaint, distLinePaint } = useZonePaint(drillState, mapTheme);
  const {
    clusterRingPaint, clusterCirclePaint, formPointsPaint, heatmapPaint,
    agentSelectedRingPaint, agentCirclesPaint,
    pointsVisibility, pointsGlowVisibility, heatmapVisibility, barsVisibility,
    trackingVisibility, routesVisibility,
    routeLineLayoutWithVis, routeSeqLayoutWithVis, clusterCountLayoutWithVis,
    agentLabelsLayoutWithVis, agentCountLayoutWithVis,
  } = useLayerPaint(mapTheme, primaryColor, showDatos, datosVizMode, showTracking, showRoutes, heatmapRadius, heatmapOpacity);

  const nudgeCamera = useCallback((delta: CameraNudge) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const panX = delta.panX ?? 0;
    const panY = delta.panY ?? 0;
    const hasPan = panX !== 0 || panY !== 0;
    const hasTransform = !!(delta.zoomDelta || delta.bearingDelta || delta.pitchDelta);

    if (hasPan && !hasTransform) {
      map.panBy([panX, panY], { duration: 220, essential: true });
      return;
    }

    const currentZoom = map.getZoom();
    const currentBearing = map.getBearing();
    const currentPitch = map.getPitch();
    const currentCenter = map.getCenter();
    const centerPx = map.project(currentCenter);
    const nextCenter = hasPan
      ? map.unproject([centerPx.x + panX, centerPx.y + panY])
      : currentCenter;

    map.easeTo({
      center: nextCenter,
      zoom: currentZoom + (delta.zoomDelta ?? 0),
      bearing: currentBearing + (delta.bearingDelta ?? 0),
      pitch: clamp(currentPitch + (delta.pitchDelta ?? 0), CAMERA_PITCH_MIN, CAMERA_PITCH_MAX),
      duration: 260,
      essential: true,
    });
  }, []);

  const resetCameraOrientation = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({ bearing: 0, pitch: 0, duration: 320, essential: true });
  }, []);

  const resetCameraPosition = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({
      center: [PERU_VIEW.longitude, PERU_VIEW.latitude],
      zoom: PERU_VIEW.zoom,
      bearing: 0,
      pitch: 0,
      duration: 520,
      essential: true,
    });
  }, []);

  // ─── Imperative handle ───
  useImperativeHandle(ref, () => ({
    flyToPoint(lng: number, lat: number, zoom = 17, withDrill = true) {
      skipNextFitRef.current = true;
      skipLoadFitRef.current = true;
      pendingDrillRef.current = withDrill;
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: FLY_DURATION, essential: true });
    },
    getDrillState() { return drillStateRef.current; },
    showPinnedTooltip,
    nudgeCamera,
    resetCameraOrientation,
    resetCameraPosition,
    fitToBounds(bounds: [[number, number], [number, number]], padding = 40) {
      skipNextFitRef.current = true;
      skipLoadFitRef.current = true;
      pendingDrillRef.current = false;
      mapRef.current?.fitBounds(bounds, { padding, duration: FLY_DURATION, essential: true });
    },
    disableAutoFit() {
      disableAutoFitRef.current = true;
      pendingDrillRef.current = false;
    },
  }), [showPinnedTooltip, nudgeCamera, resetCameraOrientation, resetCameraPosition]);

  // ─── Init (SSR guard) ───
  useEffect(() => {
    setTileUrl(`${window.location.origin}${DEFAULT_TILE_TEMPLATE}`);
    setReady(true);
  }, []);

  // ─── Map load ───
  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    applyFluidMapInteractions(map);

    const skipInitialFit = skipLoadFitRef.current;
    skipLoadFitRef.current = false;

    if (!skipInitialFit) {
      if (lockedBounds) {
        // Hard-pin the camera to the locked district — duration:0 = instant, no animation.
        // This is the final revalidator: even if initialViewState drifted slightly due to
        // MapLibre's internal projection math, this corrects it with zero flash.
        map.fitBounds(lockedBounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 0 });
      } else if (!disableAutoFitRef.current) {
        // Normal mode: start at Peru overview.
        map.fitBounds(PERU_BOUNDS, { padding: 20, duration: 0 });
      }
    }

    if (tileUrl) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => prewarmTiles(tileUrl), { timeout: 3000 });
      } else {
        setTimeout(() => prewarmTiles(tileUrl), 1000);
      }
    }
  }, [tileUrl, lockedBounds]);

  // ─── Zoom tracking via react-maplibre callbacks ───
  const handleMoveStart = useCallback(() => {
    isZoomingRef.current = true;
    if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
  }, []);

  const handleMoveEnd = useCallback(() => {
    zoomEndTimer.current = setTimeout(() => { isZoomingRef.current = false; }, 300);
    if (mapRef.current && showDatos && datosVizMode === "bars3d") {
      setBarsZoom(mapRef.current.getZoom());
    }

    // After cluster flyTo lands, reverse-geocode the map center and drill
    // to the appropriate level based on how far we zoomed in.
    // Skip entirely in locked-bounds mode — we never want reverse-geocode to drift the drill.
    if (!lockedBounds && pendingDrillRef.current && mapRef.current) {
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
  }, [onDrillChange, showDatos, datosVizMode, lockedBounds]);

  // Live zoom updates while camera moves in bars mode (for smooth split/merge behavior).
  const handleMove = useCallback((evt: { viewState?: { zoom?: number } }) => {
    if (!showDatos || datosVizMode !== "bars3d") return;
    const z = evt.viewState?.zoom;
    if (typeof z !== "number") return;
    setBarsZoom((prev) => (Math.abs(prev - z) >= 0.1 ? z : prev));
  }, [showDatos, datosVizMode]);

  const handleDoubleClick = useCallback(() => {
    onMapDoubleClick?.();
  }, [onMapDoubleClick]);

  const handleMapDoubleClickWithDrill = useCallback((e: MapLayerMouseEvent) => {
    const currentDrill = drillStateRef.current;
    const f = e.features?.[0];
    const layerId = f?.layer?.id;

    if (!f || !layerId) {
      handleDoubleClick();
      return;
    }

    const isDep = layerId === "dep-fill" || layerId.startsWith("priority-dep");
    const isProv = layerId === "prov-fill" || layerId.startsWith("priority-prov");
    const isDist = layerId === "dist-fill" || layerId.startsWith("priority-dist");
    const isSector = layerId.startsWith("sector");

    let shouldUndrill = false;

    if (isSector && currentDrill.level >= 4) {
      const sectorNum = f.properties?.sector != null
        ? Number(f.properties.sector)
        : f.properties?.SECTOR != null
          ? Number(f.properties.SECTOR)
          : null;
      shouldUndrill = sectorNum != null && currentDrill.sector === sectorNum;
    } else if (isDist && currentDrill.level >= 3) {
      const ubigeo = String(f.properties?.ubigeo ?? f.properties?.UBIGEO ?? "");
      shouldUndrill = !!ubigeo && currentDrill.distCode === ubigeo;
    } else if (isProv && currentDrill.level >= 2) {
      const codprovFull = String(
        f.properties?.codprov_full ?? ((f.properties?.CODDEP ?? "") + (f.properties?.CODPROV ?? "")),
      );
      shouldUndrill = !!codprovFull && currentDrill.provCode === codprovFull;
    } else if (isDep && currentDrill.level >= 1) {
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? "");
      shouldUndrill = !!coddep && currentDrill.depCode === coddep;
    }

    if (shouldUndrill) {
      const newLevel = Math.max(0, currentDrill.level - 1) as 0 | 1 | 2 | 3 | 4;
      const newState = { ...currentDrill, level: newLevel };
      if (newLevel < 4) { newState.sector = null; newState.sectorName = null; }
      if (newLevel < 3) { newState.distCode = null; newState.distName = null; }
      if (newLevel < 2) { newState.provCode = null; newState.provName = null; }
      if (newLevel < 1) { newState.depCode = null; newState.depName = null; }
      onDrillChange(newState);

      skipNextFitRef.current = true;
      pendingDrillRef.current = false;
      if (newLevel === 0) {
        mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: FLY_DURATION });
      }
    }

    handleDoubleClick();
  }, [handleDoubleClick, onDrillChange]);

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
      mapRef.current.getCanvas().style.cursor = features?.length ? "pointer" : "grab";
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
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "grab";
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
        pendingDrillRef.current = false;
        mapRef.current.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: FLY_DURATION });
      }
    }
  }, [selectedAgentId, agents]);

  // ─── 3D mode camera pitch ───
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const targetPitch = showDatos && datosVizMode === "bars3d" ? 48 : 0;
    if (Math.abs(map.getPitch() - targetPitch) < 1) return;
    map.easeTo({ pitch: targetPitch, duration: targetPitch > 0 ? 480 : 320, essential: true });
  }, [showDatos, datosVizMode]);

  useEffect(() => {
    if (!showDatos || datosVizMode !== "bars3d") return;
    const z = mapRef.current?.getZoom();
    if (typeof z === "number") setBarsZoom(z);
  }, [showDatos, datosVizMode]);



  // ─── Cleanup ───
  useEffect(() => () => {
    if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
  }, []);

  // ─── Loading ───
  if (!ready || !tileUrl) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: mapTheme === "dark" ? "#090D15" : "#e5e7eb",
        }}
      >
        <span style={{ color: "#64748b", fontSize: 13 }}>Cargando mapa...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, backgroundColor: mapTheme === "dark" ? "#090D15" : "#e5e7eb" }}>
      <MapLibre
        ref={mapRef}
        initialViewState={lockedBounds ? boundsToInitialViewState(lockedBounds) : PERU_VIEW}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLES[mapTheme]}
        dragPan={MAP_DRAG_PAN_OPTIONS}
        dragRotate
        pitchWithRotate
        touchPitch
        touchZoomRotate={{ around: "center" }}
        scrollZoom
        doubleClickZoom={false}
        minPitch={0}
        maxPitch={60}
        clickTolerance={4}
        minZoom={lockedBounds ? Math.max(boundsToMinZoom(lockedBounds) - 1, 4) : 1}
        maxBounds={lockedBounds ? expandBounds(lockedBounds, 0.5) : PERU_MAX_BOUNDS}
        maxTileCacheZoomLevels={10}
        fadeDuration={0}
        onLoad={handleLoad}
        onMove={handleMove}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        onClick={handleClick}
        onDblClick={handleMapDoubleClickWithDrill}
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
          <Layer id="forms-cluster-ring" type="circle" filter={HAS_POINT_COUNT} layout={pointsVisibility} paint={clusterRingPaint} />
          <Layer id="forms-clusters" type="circle" filter={HAS_POINT_COUNT} layout={pointsVisibility} paint={clusterCirclePaint} />
          <Layer id="forms-cluster-count" type="symbol" filter={HAS_POINT_COUNT} layout={clusterCountLayoutWithVis} paint={CLUSTER_COUNT_PAINT} />
          <Layer id="forms-points-glow" type="circle" filter={NOT_HAS_POINT_COUNT} layout={pointsGlowVisibility} paint={FORM_POINTS_DARK_GLOW_PAINT} />
          <Layer id="forms-points" type="circle" filter={NOT_HAS_POINT_COUNT} layout={pointsVisibility} paint={formPointsPaint} />
        </Source>
        <Source id="forms-heatmap" type="geojson" data={formsGeoJson}>
          <Layer id="forms-heatmap-layer" type="heatmap" layout={heatmapVisibility} paint={heatmapPaint} />
        </Source>
        <Source id="forms-bars" type="geojson" data={barsGeoJson}>
          <Layer id="forms-bars-3d" type="fill-extrusion" layout={barsVisibility} paint={BARS_EXTRUSION_PAINT} />
          <Layer id="forms-bars-outline" type="line" layout={barsVisibility} paint={BARS_LINE_PAINT} />
        </Source>

        {/* ── Agent markers — always mounted, visibility controlled via layout ── */}
        <Source id="agents" type="geojson" data={agentsGeoJson}>
          <Layer id="agents-selected-ring" type="circle" filter={AGENT_SELECTED_FILTER} layout={trackingVisibility} paint={agentSelectedRingPaint} />
          <Layer id="agents-pulse" type="circle" filter={AGENT_CONNECTED_FILTER} layout={trackingVisibility} paint={AGENT_PULSE_PAINT} />
          <Layer id="agents-circles" type="circle" layout={trackingVisibility} paint={agentCirclesPaint} />
          <Layer id="agents-labels" type="symbol" minzoom={10} layout={agentLabelsLayoutWithVis} paint={AGENT_LABELS_PAINT} />
          <Layer id="agents-count" type="symbol" minzoom={8} layout={agentCountLayoutWithVis} paint={AGENT_COUNT_PAINT} />
        </Source>

        {/* ── New-point sonar — expanding rings over each new point × 3 pulses ── */}
        {showDatos && datosVizMode === "points" && newPoints.map((p) => (
          <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
            <div className="tierra-new-point" style={{ "--ring-color": p.color } as React.CSSProperties}>
              <div className="tierra-new-point-dot" />
              <div className="tierra-new-point-ring" />
              <div className="tierra-new-point-ring" />
            </div>
          </Marker>
        ))}

      </MapLibre>

      {/* ── Zone tooltip ── */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute", top: 0, left: 0, pointerEvents: "none",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)",
          padding: "10px 14px",
          borderRadius: 10,
          zIndex: 20, opacity: 0, willChange: "transform",
          transform: "translate(0px, 0px)", transition: "opacity 100ms ease-out",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      />

      {/* ── Form / agent tooltip ── */}
      <div
        ref={formTooltipRef}
        style={{
          position: "absolute", top: 0, left: 0, pointerEvents: "none",
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderRadius: 10, padding: "8px 12px", minWidth: 130, maxWidth: 210,
          boxShadow: "0 4px 20px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06)",
          border: "1px solid rgba(226,232,240,0.8)",
          zIndex: 21, opacity: 0, willChange: "transform",
          transform: "translate(0px, 0px)", transition: "opacity 120ms ease-out",
        }}
      />
    </div>
  );
}));
