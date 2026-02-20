"use client";

/**
 * TierraMap — Main map component for campaign territory visualization.
 *
 * Architecture: Pure rendering component that composes domain hooks.
 * All data transformation, filtering, and memoization lives in hooks.
 *
 * Performance fixes applied:
 * - handleClick uses refs for volatile deps (agents, selectedAgentId, drillState)
 *   so the callback is stable and MapLibre doesn't re-register it
 * - flyTo effect only fires on selectedAgentId change (not agents array)
 * - interactive layers is a module-level constant
 * - ALL geographic overlays served via Tegola vector tiles (no GeoJSON fallback)
 * - Tile-native masking: data-driven fill-color darkens non-selected zones
 * - Zoom-tiered Redis cache: z0-7=24h, z8-12=6h, z13-16=1h
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Layer, Map as MapLibre, Source } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { TierraMapHandle, TierraMapProps, DrillLevel } from "./types";
import { INITIAL_DRILL } from "./types";
import {
  STATUS_COLORS, CLUSTER_COLORS, CLUSTER_STEPS, CLUSTER_SIZES, DATA_POINT,
  ZONE_FILL, ZONE_HOVER, ZONE_LINE, ZONE_LINE_GHOST, MASK_FILL, HOVER_LAYERS,
  PRIORITY_FILL, PRIORITY_LINE, SECTOR_FILL, SECTOR_LINE,
  PERU_VIEW, PERU_BOUNDS, MAP_STYLE, DEFAULT_TILE_TEMPLATE, INTERACTIVE_LAYERS,
} from "./constants";
import { getBoundsFromFeature } from "./utils";
import { preloadProvincias, preloadDistritos, reverseGeocode } from "@/lib/services/geo";

import { useDrillFilters } from "./hooks/use-drill-filters";
import { useAgentsSource, useFormSources } from "./hooks/use-map-sources";
import { useAutoFit } from "./hooks/use-auto-fit";
import { useZoneTooltip } from "./hooks/use-zone-tooltip";

/* ========== Component ========== */

export const TierraMap = forwardRef<TierraMapHandle, TierraMapProps>(function TierraMap(
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

  // ─── Imperative handle ───
  useImperativeHandle(ref, () => ({
    flyToPoint(lng: number, lat: number, zoom = 17) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1200, essential: true });
    },
    getDrillState() { return drillStateRef.current; },
  }), []);

  // ─── Init ───
  useEffect(() => {
    if (typeof window !== "undefined") setTileUrl(`${window.location.origin}${DEFAULT_TILE_TEMPLATE}`);
    setReady(true);
  }, []);

  // ─── Map load ───
  const handleLoad = useCallback(() => {
    mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 20, duration: 0 });

    const map = mapRef.current?.getMap();
    if (map) {
      const onMoveStart = () => {
        isZoomingRef.current = true;
        if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
      };
      const onMoveEnd = () => {
        zoomEndTimer.current = setTimeout(() => { isZoomingRef.current = false; }, 300);
      };
      map.on("movestart", onMoveStart);
      map.on("zoomstart", onMoveStart);
      map.on("moveend", onMoveEnd);
      map.on("zoomend", onMoveEnd);
    }
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
          mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: 800 });
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
          mapRef.current?.flyTo({ center: [lng, lat], zoom: targetZoom, duration: 600, essential: true });
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
          if (agent) mapRef.current?.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: 800 });
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
        mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: 800 });
      }
      return;
    }

    if (isDep) {
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? "");
      const name = String(f.properties?.departamento ?? f.properties?.departamen ?? f.properties?.DEPARTAMEN ?? coddep);
      if (coddep) {
        preloadProvincias(coddep);
        const bounds = getBoundsFromFeature(f);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
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
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
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
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
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
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
      }
      return;
    }

    if (isSubsector) {
      const bounds = getBoundsFromFeature(f);
      if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
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
      if (agent) mapRef.current.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: 800 });
    }
  }, [selectedAgentId, agents]);

  // ─── Resize: recalibrate + re-fit when panels change container size ───
  // Uses a callback ref because the container div is not rendered during
  // the loading state (early return), so a useEffect([]) would miss it.
  const roRef = useRef<ResizeObserver | null>(null);
  const roTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roPrevSize = useRef({ w: 0, h: 0 });

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous observer
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

        // Re-fit if size changed meaningfully (panel opened/closed)
        if (dw > 50 || dh > 50) {
          // Use Peru bounds as fallback — tile-based rendering handles the rest
          map.fitBounds(PERU_BOUNDS, { padding: 30, duration: 400 });
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
        onLoad={handleLoad}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={INTERACTIVE_LAYERS as unknown as string[]}
      >
        {/* ── Tegola vector tiles ── */}
        <Source id="peru" type="vector" tiles={[tileUrl]} minzoom={0} maxzoom={14} promoteId={{ departamentos: "coddep", provincias: "codprov_full", distritos: "ubigeo" }}>

          {/* DEPARTAMENTOS — tile-native masking: all deps always visible, non-selected darkened at level 1+ */}
          <Layer id="dep-fill" type="fill" source-layer="departamentos" filter={filters.depFillFilter}
            paint={{
              "fill-color": drillState.level === 0
                ? ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL]
                : drillState.depCode
                  ? ["case", ["==", ["get", "coddep"], drillState.depCode], ZONE_FILL, MASK_FILL]
                  : ZONE_FILL,
              "fill-opacity": 1,
            }} />
          <Layer id="dep-line" type="line" source-layer="departamentos" filter={filters.depLineFilter}
            paint={{ "line-color": drillState.level === 0 ? ZONE_LINE : ZONE_LINE_GHOST, "line-width": drillState.level === 0 ? 1.2 : 0.6, "line-opacity": drillState.level === 0 ? 0.7 : 0.3 }} />

          {/* PROVINCIAS — tile-native masking: all provs in dep visible, non-selected darkened at level 2+ */}
          <Layer id="prov-fill" type="fill" source-layer="provincias" filter={filters.provFillFilter}
            paint={{
              "fill-color": drillState.level === 1
                ? ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL]
                : drillState.provCode
                  ? ["case", ["==", ["get", "codprov_full"], drillState.provCode], ZONE_FILL, MASK_FILL]
                  : ZONE_FILL,
              "fill-opacity": 1,
            }} />
          <Layer id="prov-line" type="line" source-layer="provincias" filter={filters.provLineFilter}
            paint={{ "line-color": drillState.level === 1 ? ZONE_LINE : ZONE_LINE_GHOST, "line-width": drillState.level === 1 ? 1 : 0.5, "line-opacity": drillState.level === 1 ? 0.7 : 0.2 }} />

          {/* DISTRITOS — tile-native masking: all dists in prov visible, non-selected darkened at level 3+ */}
          <Layer id="dist-fill" type="fill" source-layer="distritos" filter={filters.distFillFilter}
            paint={{
              "fill-color": drillState.level === 2
                ? ["case", ["boolean", ["feature-state", "hover"], false], ZONE_HOVER, ZONE_FILL]
                : drillState.distCode
                  ? ["case", ["==", ["get", "ubigeo"], drillState.distCode], ZONE_FILL, MASK_FILL]
                  : ZONE_FILL,
              "fill-opacity": 1,
            }} />
          <Layer id="dist-line" type="line" source-layer="distritos" filter={filters.distLineFilter}
            paint={{ "line-color": ZONE_LINE, "line-width": drillState.level >= 3 ? 1.2 : 0.8, "line-opacity": 0.6 }} />

          {/* PRIORITY ZONES */}
          <Layer id="priority-dep-fill" type="fill" source-layer="priority_departamentos" filter={filters.priorityDepFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
          <Layer id="priority-dep-line" type="line" source-layer="priority_departamentos" filter={filters.priorityDepFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.8, "line-opacity": 0.4 }} />
          <Layer id="priority-prov-fill" type="fill" source-layer="priority_provincias" filter={filters.priorityProvFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
          <Layer id="priority-prov-line" type="line" source-layer="priority_provincias" filter={filters.priorityProvFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.6, "line-opacity": 0.4 }} />
          <Layer id="priority-dist-fill" type="fill" source-layer="priority_distritos" filter={filters.priorityDistFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
          <Layer id="priority-dist-line" type="line" source-layer="priority_distritos" filter={filters.priorityDistFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />

          {/* SECTORS */}
          <Layer id="sector-fill" type="fill" source-layer="campaign_sectors" filter={filters.sectorFilter}
            paint={{ "fill-color": SECTOR_FILL, "fill-opacity": 0.8 }} />
          <Layer id="sector-line" type="line" source-layer="campaign_sectors" filter={filters.sectorFilter}
            paint={{ "line-color": SECTOR_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />
        </Source>

        {/* ── Heatmap ── */}
        {showHeatmap && (
          <Source id="forms-heat" type="geojson" data={formsHeatGeoJson}>
            <Layer id="forms-heatmap" type="heatmap" paint={{
              "heatmap-weight": 1,
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1, 12, 3],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 15, 12, 25],
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 14, 0.25],
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)", 0.2, "rgba(30,58,95,0.35)", 0.4, "rgba(13,148,136,0.5)",
                0.6, "rgba(217,119,6,0.6)", 0.8, "rgba(180,83,9,0.7)", 1, "rgba(127,29,29,0.8)",
              ],
            }} />
          </Source>
        )}

        {/* ── Clustered form data ── */}
        {showDatos && (
          <Source id="forms-clustered" type="geojson" data={formsGeoJson} cluster clusterRadius={40} clusterMaxZoom={16}>
            <Layer id="forms-cluster-ring" type="circle" filter={["has", "point_count"]} paint={{
              "circle-color": ["step", ["get", "point_count"], CLUSTER_COLORS[0], CLUSTER_STEPS[0], CLUSTER_COLORS[1], CLUSTER_STEPS[1], CLUSTER_COLORS[2], CLUSTER_STEPS[2], CLUSTER_COLORS[3], CLUSTER_STEPS[3], CLUSTER_COLORS[4]],
              "circle-radius": ["step", ["get", "point_count"], CLUSTER_SIZES[0] + 3, CLUSTER_STEPS[0], CLUSTER_SIZES[1] + 3, CLUSTER_STEPS[1], CLUSTER_SIZES[2] + 3, CLUSTER_STEPS[2], CLUSTER_SIZES[3] + 3, CLUSTER_STEPS[3], CLUSTER_SIZES[4] + 3],
              "circle-opacity": 0.1,
            }} />
            <Layer id="forms-clusters" type="circle" filter={["has", "point_count"]} paint={{
              "circle-color": ["step", ["get", "point_count"], CLUSTER_COLORS[0], CLUSTER_STEPS[0], CLUSTER_COLORS[1], CLUSTER_STEPS[1], CLUSTER_COLORS[2], CLUSTER_STEPS[2], CLUSTER_COLORS[3], CLUSTER_STEPS[3], CLUSTER_COLORS[4]],
              "circle-radius": ["step", ["get", "point_count"], CLUSTER_SIZES[0], CLUSTER_STEPS[0], CLUSTER_SIZES[1], CLUSTER_STEPS[1], CLUSTER_SIZES[2], CLUSTER_STEPS[2], CLUSTER_SIZES[3], CLUSTER_STEPS[3], CLUSTER_SIZES[4]],
              "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-stroke-opacity": 0.7,
            }} />
            <Layer id="forms-cluster-count" type="symbol" filter={["has", "point_count"]} layout={{
              "text-field": "{point_count_abbreviated}",
              "text-size": ["step", ["get", "point_count"], 9, CLUSTER_STEPS[0], 10, CLUSTER_STEPS[1], 11, CLUSTER_STEPS[2], 12, CLUSTER_STEPS[3], 14],
              "text-font": ["Open Sans Bold"], "text-allow-overlap": true,
            }} paint={{ "text-color": "#ffffff" }} />
            <Layer id="forms-points" type="circle" filter={["!", ["has", "point_count"]]} paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 10, 4, 14, 5.5, 18, 8],
              "circle-color": DATA_POINT,
              "circle-opacity": ["case", ["==", ["get", "is_filtered"], 1], 0.8, 0.2],
              "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 14, 2],
              "circle-stroke-color": "#ffffff", "circle-stroke-opacity": 0.85,
            }} />
          </Source>
        )}

        {/* ── Agent markers ── */}
        {showTracking && (
          <Source id="agents" type="geojson" data={agentsGeoJson}>
            <Layer id="agents-selected-ring" type="circle" filter={["==", ["get", "is_selected"], 1]} paint={{ "circle-radius": 24, "circle-color": primaryColor, "circle-opacity": 0.2 }} />
            <Layer id="agents-pulse" type="circle" filter={["==", ["get", "status"], "connected"]} paint={{ "circle-radius": 18, "circle-color": STATUS_COLORS.connected, "circle-opacity": 0.12 }} />
            <Layer id="agents-circles" type="circle" paint={{
              "circle-radius": ["case", ["==", ["get", "is_selected"], 1], 12, 9],
              "circle-color": ["match", ["get", "status"], "connected", STATUS_COLORS.connected, "idle", STATUS_COLORS.idle, "inactive", STATUS_COLORS.inactive, primaryColor],
              "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff",
            }} />
            <Layer id="agents-labels" type="symbol" minzoom={10} layout={{ "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.8], "text-allow-overlap": false, "text-font": ["Open Sans Bold"] }} paint={{ "text-color": "#1e293b", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.5 }} />
            <Layer id="agents-count" type="symbol" minzoom={8} layout={{ "text-field": ["to-string", ["get", "forms_count"]], "text-size": 9, "text-allow-overlap": true, "text-font": ["Open Sans Bold"] }} paint={{ "text-color": "#ffffff" }} />
          </Source>
        )}
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
});
