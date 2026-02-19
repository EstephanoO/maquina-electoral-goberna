"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, Source } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { FilterSpecification, StyleSpecification, MapGeoJSONFeature, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type DrillLevel, type DrillState, INITIAL_DRILL } from "./zone-breadcrumb";
import {
  getProvincias,
  getDistritos,
  preloadProvincias,
  preloadDistritos,
  type GeoBounds,
} from "@/lib/services/geo";

/* ========== Types ========== */

export type AgentStatus = "connected" | "idle" | "inactive";

export type EnrichedAgent = {
  id: string;
  name: string;
  status: AgentStatus;
  lastSeen: Date;
  forms_count: number;
  lat: number;
  lng: number;
};

export type FormPoint = {
  id: string;
  lat: number;
  lng: number;
  nombre: string;
  created_at: string;
  agent_id?: string;
};

export type TierraMapHandle = {
  flyToPoint: (lng: number, lat: number, zoom?: number) => void;
  getDrillState: () => DrillState;
};

type Props = {
  campaignId: string;
  slug: string;
  primaryColor: string;
  agents: EnrichedAgent[];
  forms: FormPoint[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  showTracking: boolean;
  showDatos: boolean;
  showHeatmap: boolean;
  /** Drill state is lifted to parent for breadcrumb */
  drillState: DrillState;
  onDrillChange: (state: DrillState) => void;
};

/* ========== GeoJSON fallback config per campaign ========== */
// Until priority zones are imported into PostGIS, load from local GeoJSON files.
// Each entry maps a slug to GeoJSON files per administrative level.

type GeoLevel = "dep" | "prov" | "dist" | "sector" | "subsector";
type GeoFileConfig = { file: string; level: GeoLevel };

const GEOJSON_FILES: Record<string, GeoFileConfig[]> = {
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

/* ========== Color Palette ========== */

const STATUS_COLORS: Record<AgentStatus, string> = {
  connected: "#0d9488",
  idle: "#d97706",
  inactive: "#64748b",
};

const CLUSTER_COLORS = ["#93c5fd", "#3b82f6", "#2563eb", "#1d4ed8", "#1e3a5f"];
const CLUSTER_STEPS = [5, 15, 50, 150];
const CLUSTER_SIZES = [12, 16, 20, 26, 32];
const DATA_POINT = "#2563eb";

// Priority zone colors — red transparent fill, thin black borders
const PRIORITY_FILL = "rgba(239, 68, 68, 0.35)";
const PRIORITY_LINE = "#991b1b";
const SECTOR_FILL = "rgba(220, 38, 38, 0.13)";
const SECTOR_LINE = "#0a0a0a";
const HIDE_FILTER: FilterSpecification = ["==", "1", "0"];



/* ========== Map Config ========== */

const PERU_VIEW = { longitude: -75.0152, latitude: -9.1899, zoom: 5 };
const PERU_BOUNDS: [[number, number], [number, number]] = [[-81.4, -18.4], [-68.7, -0.1]];

const LIGHT_TILES = "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png";

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "light-base": { type: "raster", tiles: [LIGHT_TILES], tileSize: 256, attribution: "&copy; CARTO", maxzoom: 19 },
  },
  layers: [{ id: "light-base", type: "raster", source: "light-base" }],
  // Global transition for smooth property changes when filters/state update
  transition: { duration: 400, delay: 0 },
};

const DEFAULT_TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

/* ========== Utility: get bounds from features ========== */

function extractCoordsFromGeometry(c: unknown, coords: number[][]): void {
  if (Array.isArray(c)) {
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      coords.push(c as number[]);
    } else {
      for (const item of c) extractCoordsFromGeometry(item, coords);
    }
  }
}

function getBoundsFromFeature(feature: MapGeoJSONFeature): [[number, number], [number, number]] | null {
  try {
    const coords: number[][] = [];
    extractCoordsFromGeometry((feature.geometry as unknown as { coordinates: unknown }).coordinates, coords);
    if (coords.length === 0) return null;

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return [[minLng, minLat], [maxLng, maxLat]];
  } catch {
    return null;
  }
}

function calculateBoundsFromFeatures(features: GeoJSON.Feature[]): [[number, number], [number, number]] | null {
  if (features.length === 0) return null;
  
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const coords: number[][] = [];
  
  for (const f of features) {
    if (f.geometry && "coordinates" in f.geometry) {
      extractCoordsFromGeometry(f.geometry.coordinates, coords);
    }
  }
  
  if (coords.length === 0) return null;
  
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  
  if (minLng === Infinity || maxLng === -Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

/* ========== Component ========== */

export const TierraMap = forwardRef<TierraMapHandle, Props>(function TierraMap(
  { campaignId, slug, primaryColor, agents, forms, selectedAgentId, onSelectAgent, showTracking, showDatos, showHeatmap, drillState, onDrillChange },
  ref,
) {
  const mapRef = useRef<MapRef | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const isZoomingRef = useRef(false);
  const zoomEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // GeoJSON fallback: loaded from /geo/*.geojson per campaign
  const [geoData, setGeoData] = useState<Record<GeoLevel, GeoJSON.FeatureCollection | null>>({
    dep: null, prov: null, dist: null, sector: null, subsector: null,
  });

  useImperativeHandle(ref, () => ({
    flyToPoint(lng: number, lat: number, zoom = 17) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1200, essential: true });
    },
    getDrillState() { return drillState; },
  }), [drillState]);

  useEffect(() => {
    if (typeof window !== "undefined") setTileUrl(`${window.location.origin}${DEFAULT_TILE_TEMPLATE}`);
    setReady(true);
  }, []);

  // Load GeoJSON files for this campaign
  useEffect(() => {
    const configs = GEOJSON_FILES[slug];
    if (!configs) return;
    for (const cfg of configs) {
      fetch(cfg.file)
        .then((r) => r.json())
        .then((fc: GeoJSON.FeatureCollection) => {
          // Normalize property names to lowercase for consistent filtering
          const normalized: GeoJSON.FeatureCollection = {
            ...fc,
            features: fc.features.map((f) => {
              const p = f.properties ?? {};
              return {
                ...f,
                properties: {
                  ...p,
                  coddep: p.CODDEP ?? p.coddep ?? "",
                  departamento: p.DEPARTAMEN ?? p.departamento ?? "",
                  codprov: p.CODPROV ?? p.codprov ?? "",
                  provincia: p.PROVINCIA ?? p.provincia ?? "",
                  codprov_full: (p.CODDEP ?? "") + (p.CODPROV ?? ""),
                  coddist: p.CODDIST ?? p.coddist ?? "",
                  distrito: p.DISTRITO ?? p.distrito ?? "",
                  ubigeo: p.UBIGEO ?? p.ubigeo ?? "",
                  sector: p.SECTOR ?? p.sector ?? null,
                  subsector: p.SUBSECTOR ?? p.subsector ?? null,
                },
              };
            }),
          };
          setGeoData((prev) => ({ ...prev, [cfg.level]: normalized }));
        })
        .catch(() => { /* file not found, ignore */ });
    }
  }, [slug]);

  /* ─── Campaign filter for priority layers ─── */
  const campaignFilter: FilterSpecification = useMemo(
    () => ["==", ["get", "campaign_id"], campaignId],
    [campaignId],
  );

  /* ─── Drill-down filters ─── */
  //
  // Strategy: Layers are ALWAYS rendered but their opacity is controlled by
  // zoom-interpolation expressions. Filters narrow down WHICH features to
  // show at each drill level (e.g. only the selected dep's provincias).
  //
  // The opacity crossfade is defined in the paint properties of each Layer
  // (see JSX below), NOT here in the filters. Filters only handle geographic
  // scoping (which dep/prov/dist).

  // ── Base map filters (Tegola vector tiles) ──

  // Departamentos FILL: show all at level 0, show ONLY selected dep at level 1+
  // (non-selected deps are hidden so the selected one "emerges" alone)
  const depFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return ["all"] as FilterSpecification;
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode]);

  // Departamentos LINE (for context outlines)
  const depLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return ["all"] as FilterSpecification;
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode]);

  // Non-selected departamentos: only at level 0
  const depOtherFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return ["all"] as FilterSpecification;
    return HIDE_FILTER;
  }, [drillState.level]);

  // Provincias: level 1 = all provs of selected dep, level 2+ = only selected prov
  const provFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return HIDE_FILTER;
    if (drillState.level >= 2 && drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode, drillState.provCode]);

  const provLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return HIDE_FILTER;
    if (drillState.level >= 2 && drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode, drillState.provCode]);

  // Distritos: level 2 = all dists of selected prov, level 3+ = only selected dist
  const distFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 2) return HIDE_FILTER;
    if (drillState.level >= 3 && drillState.distCode) return ["==", ["get", "ubigeo"], drillState.distCode];
    if (drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.provCode, drillState.distCode]);

  const distLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 2) return HIDE_FILTER;
    if (drillState.level >= 3 && drillState.distCode) return ["==", ["get", "ubigeo"], drillState.distCode];
    if (drillState.provCode) return ["==", ["get", "codprov_full"], drillState.provCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.provCode, drillState.distCode]);

  // ── Priority layer filters (red fill — campaign-specific zones) ──

  // Priority deps: show at level 0 (fade with zoom)
  const priorityDepFilter: FilterSpecification = useMemo(() => {
    if (drillState.level >= 1) return HIDE_FILTER;
    return ["all", campaignFilter] as FilterSpecification;
  }, [campaignFilter, drillState.level]);

  // Priority provs: show at level 1+ filtered to selected dep
  const priorityProvFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 1 || !drillState.depCode) return HIDE_FILTER;
    if (drillState.level >= 2) return HIDE_FILTER;
    return ["all", campaignFilter, ["==", ["get", "coddep"], drillState.depCode]] as FilterSpecification;
  }, [campaignFilter, drillState.level, drillState.depCode]);

  // Priority dists: show at level 2 filtered to selected prov
  const priorityDistFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 2 || !drillState.provCode) return HIDE_FILTER;
    if (drillState.level >= 3) return HIDE_FILTER;
    return ["all", campaignFilter, ["==", ["get", "codprov_full"], drillState.provCode]] as FilterSpecification;
  }, [campaignFilter, drillState.level, drillState.provCode]);

  // Campaign sectors: only show at level 3+
  const sectorFilter: FilterSpecification = useMemo(() => {
    if (drillState.level < 3 || !drillState.distCode) return HIDE_FILTER;
    if (drillState.level === 3) {
      return ["all", campaignFilter, ["==", ["get", "parent_code"], drillState.distCode], ["==", ["get", "zone_level"], "sector"]] as FilterSpecification;
    }
    if (drillState.level === 4 && drillState.sector != null) {
      return ["all", campaignFilter, ["==", ["get", "parent_code"], drillState.distCode], ["==", ["get", "zone_level"], "subsector"], ["==", ["get", "sector"], drillState.sector]] as FilterSpecification;
    }
    return ["all", campaignFilter, ["==", ["get", "parent_code"], drillState.distCode]] as FilterSpecification;
  }, [campaignFilter, drillState.level, drillState.distCode, drillState.sector]);

  /* ─── GeoJSON sources ─── */

  const agentsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: agents.map((a) => ({
      type: "Feature" as const,
      properties: { agent_id: a.id, name: a.name, status: a.status, forms_count: a.forms_count, is_selected: a.id === selectedAgentId ? 1 : 0 },
      geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
    })),
  }), [agents, selectedAgentId]);

  const formsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: forms
      .filter((f) => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng))
      .map((f) => ({
        type: "Feature" as const,
        properties: { nombre: f.nombre, agent_id: f.agent_id ?? "", created_at: f.created_at, is_filtered: selectedAgentId ? (f.agent_id === selectedAgentId ? 1 : 0) : 1 },
        geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
      })),
  }), [forms, selectedAgentId]);

  const formsHeatGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: forms
      .filter((f) => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng))
      .map((f) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
      })),
  }), [forms]);

  /* ─── Handlers ─── */

  const handleLoad = useCallback(() => {
    mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 20, duration: 0 });
    
    const map = mapRef.current?.getMap();
    if (map) {
      // Track zoom/pan to suppress cursor feedback during movement
      const onMoveStart = () => {
        isZoomingRef.current = true;
        if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
      };
      const onMoveEnd = () => {
        zoomEndTimer.current = setTimeout(() => {
          isZoomingRef.current = false;
        }, 300);
      };
      map.on("movestart", onMoveStart);
      map.on("zoomstart", onMoveStart);
      map.on("moveend", onMoveEnd);
      map.on("zoomend", onMoveEnd);
    }
  }, []);

  // Drill-down click handler — click zones to drill in, click empty space to go back
  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const features = e.features;
    if (!features?.length) {
      // Click on empty space → go back one level
      if (drillState.level > 0) {
        const newLevel = (drillState.level - 1) as DrillLevel;
        const newState = { ...drillState, level: newLevel };
        if (newLevel < 4) { newState.sector = null; newState.sectorName = null; }
        if (newLevel < 3) { newState.distCode = null; newState.distName = null; }
        if (newLevel < 2) { newState.provCode = null; newState.provName = null; }
        if (newLevel < 1) { newState.depCode = null; newState.depName = null; }
        onDrillChange(newState);

        // Fit to appropriate bounds
        if (newLevel === 0) {
          mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: 800 });
        }
      }
      return;
    }

    const f = features[0];
    const layerId = f.layer?.id;

    // Cluster click → just expand/zoom into the cluster
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
      }
      return;
    }

    // Agent click → toggle selection
    if (layerId === "agents-circles" || layerId === "agents-selected-ring") {
      const agentId = f.properties?.agent_id;
      if (agentId) {
        if (selectedAgentId === agentId) { onSelectAgent(null); }
        else {
          onSelectAgent(agentId);
          const agent = agents.find((a) => a.id === agentId);
          if (agent) mapRef.current?.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: 800 });
        }
      }
      return;
    }

    // Priority zone / base map / GeoJSON drill-down clicks
    const isDep = layerId === "dep-fill" || layerId?.startsWith("priority-dep") || layerId === "geo-dep-fill";
    const isProv = layerId === "prov-fill" || layerId?.startsWith("priority-prov") || layerId === "geo-prov-fill";
    const isDist = layerId === "dist-fill" || layerId?.startsWith("priority-dist") || layerId === "geo-dist-fill";
    const isSector = layerId?.startsWith("sector") || layerId === "geo-sector-fill";
    const isSubsector = layerId === "geo-subsector-fill";

    // Clicking a ghost/context layer from a higher level = go back one level
    // e.g. at level 3 (distrito), clicking the provincia ghost → go back to level 2
    const clickedLevel = isDep ? 0 : isProv ? 1 : isDist ? 2 : isSector ? 3 : isSubsector ? 4 : -1;
    if (clickedLevel >= 0 && clickedLevel < drillState.level) {
      const newLevel = (drillState.level - 1) as DrillLevel;
      const newState = { ...drillState, level: newLevel };
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
        // Fit to the clicked feature itself — keeps zoom at departamento level
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
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? drillState.depCode ?? "");
      if (codprovFull) {
        preloadDistritos(codprovFull);
        // Fit to the clicked feature itself — keeps zoom at provincia level
        const bounds = getBoundsFromFeature(f);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
        
        skipNextFitRef.current = true;
        onDrillChange({ ...drillState, level: 2, provCode: codprovFull, provName: name, depCode: coddep, distCode: null, distName: null, sector: null, sectorName: null });
      }
      return;
    }

    if (isDist) {
      const ubigeo = String(f.properties?.ubigeo ?? f.properties?.UBIGEO ?? "");
      const name = String(f.properties?.distrito ?? f.properties?.DISTRITO ?? ubigeo);
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? drillState.depCode ?? "");
      const depName = String(f.properties?.departamento ?? f.properties?.DEPARTAMEN ?? drillState.depName ?? "");
      const codprovFull = String(f.properties?.codprov_full ?? (((f.properties?.CODDEP ?? "") + (f.properties?.CODPROV ?? "")) || (drillState.provCode ?? "")));
      const provName = String(f.properties?.provincia ?? f.properties?.PROVINCIA ?? drillState.provName ?? "");
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
      const zoneName = String(f.properties?.zone_name ?? f.properties?.DISTRITO ?? `Sector ${sectorNum}`);
      if (sectorNum != null) {
        const bounds = getBoundsFromFeature(f);
        onDrillChange({ ...drillState, level: 4, sector: sectorNum, sectorName: `Sector ${sectorNum}` });
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
      }
      return;
    }

    if (isSubsector) {
      // Already at deepest level, just fitBounds
      const bounds = getBoundsFromFeature(f);
      if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
      return;
    }
  }, [drillState, onDrillChange, selectedAgentId, onSelectAgent, agents]);

  // Hover handler — only updates cursor, no tooltips
  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (isZoomingRef.current) return;
    
    const features = e.features;
    if (!features?.length) {
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
      return;
    }
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "pointer";
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
  }, []);

  useEffect(() => {
    if (selectedAgentId && mapRef.current) {
      const agent = agents.find((a) => a.id === selectedAgentId);
      if (agent) mapRef.current.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: 800 });
    }
  }, [selectedAgentId, agents]);

  // Track previous drill level to detect navigation direction
  const prevLevelRef = useRef<number>(drillState.level);
  // Track if we should skip the next auto-fit (when bounds are handled by click)
  const skipNextFitRef = useRef<boolean>(false);
  
  // Auto-fit bounds when drill state changes
  // This handles both:
  // 1. GeoJSON fallback data (local files)
  // 2. Cached API bounds (Redis-backed) for vector tile hierarchy
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Skip if bounds were already handled by click handler
    if (skipNextFitRef.current) {
      skipNextFitRef.current = false;
      prevLevelRef.current = drillState.level;
      return;
    }
    
    const prevLevel = prevLevelRef.current;
    const isNavigatingBack = drillState.level < prevLevel;
    prevLevelRef.current = drillState.level;
    
    // Level 0: Always fit to Peru bounds (or GeoJSON features if available)
    if (drillState.level === 0) {
      // Fit to GeoJSON features if available, otherwise fit to Peru bounds
      let features: GeoJSON.Feature[] = [];
      if (geoData.dep) {
        features = geoData.dep.features;
      } else if (geoData.dist) {
        features = geoData.dist.features;
      }
      
      if (features.length > 0) {
        const bounds = calculateBoundsFromFeatures(features);
        if (bounds) {
          mapRef.current.fitBounds(bounds, { padding: 50, duration: 800 });
          return;
        }
      }
      
      // Fallback to Peru bounds
      mapRef.current.fitBounds(PERU_BOUNDS, { padding: 40, duration: 800 });
      return;
    }
    
    // For navigation back (breadcrumb clicks), use cached API bounds
    if (isNavigatingBack) {
      if (drillState.level === 1 && drillState.depCode) {
        // Navigating back to level 1: fetch provincias bounds from cache
        getProvincias(drillState.depCode).then((result) => {
          if (result.ok && result.bounds && mapRef.current) {
            mapRef.current.fitBounds(result.bounds, { padding: 50, duration: 800 });
          }
        }).catch(() => {});
        return;
      }
      if (drillState.level === 2 && drillState.provCode) {
        // Navigating back to level 2: fetch distritos bounds from cache
        getDistritos(drillState.provCode).then((result) => {
          if (result.ok && result.bounds && mapRef.current) {
            mapRef.current.fitBounds(result.bounds, { padding: 50, duration: 800 });
          }
        }).catch(() => {});
        return;
      }
    }
    
    // Determine which features to fit based on drill level (GeoJSON fallback)
    let features: GeoJSON.Feature[] = [];
    
    if (drillState.level === 1 && drillState.depCode) {
      // Inside a dep: fit to provinces of that dep, or the dep itself
      if (geoData.prov) {
        features = geoData.prov.features.filter((f) => f.properties?.coddep === drillState.depCode);
      }
      // If no provinces, try to fit to the selected dep
      if (features.length === 0 && geoData.dep) {
        features = geoData.dep.features.filter((f) => f.properties?.coddep === drillState.depCode);
      }
    } else if (drillState.level === 2 && drillState.provCode) {
      // Inside a prov: fit to districts of that prov, or the prov itself
      if (geoData.dist) {
        features = geoData.dist.features.filter((f) => f.properties?.codprov_full === drillState.provCode);
      }
      // If no districts, try to fit to the selected prov
      if (features.length === 0 && geoData.prov) {
        features = geoData.prov.features.filter((f) => f.properties?.codprov_full === drillState.provCode);
      }
    } else if (drillState.level === 3 && drillState.distCode) {
      // Inside a dist: fit to sectors of that dist, or the dist itself
      if (geoData.sector) {
        features = geoData.sector.features.filter((f) => f.properties?.ubigeo === drillState.distCode);
      }
      // If no sectors, try to fit to the selected dist
      if (features.length === 0 && geoData.dist) {
        features = geoData.dist.features.filter((f) => f.properties?.ubigeo === drillState.distCode);
      }
    }
    
    if (features.length === 0) return;
    
    const bounds = calculateBoundsFromFeatures(features);
    if (bounds) {
      mapRef.current.fitBounds(bounds, { padding: 50, duration: 800 });
    }
  }, [drillState.level, drillState.depCode, drillState.provCode, drillState.distCode, geoData]);

  useEffect(() => () => { 
    if (zoomEndTimer.current) clearTimeout(zoomEndTimer.current);
  }, []);

  if (!ready || !tileUrl) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" }}>
        <span style={{ color: "#64748b", fontSize: 13 }}>Cargando mapa...</span>
      </div>
    );
  }

  // Interactive layers for click/hover
  // Tegola layers: dep-fill, prov-fill, dist-fill for hierarchy navigation
  // Also includes geo-* GeoJSON fallback layers and priority layers
  const interactive = [
    "agents-circles", "agents-selected-ring",
    "forms-clusters", "forms-cluster-ring", "forms-points",
    // Tegola base layers (hierarchy navigation)
    "dep-fill", "prov-fill", "dist-fill",
    // Priority layers (campaign-specific)
    "priority-dep-fill", "priority-prov-fill", "priority-dist-fill",
    "sector-fill",
    // GeoJSON fallback layers
    "geo-dep-fill", "geo-prov-fill", "geo-dist-fill", "geo-sector-fill", "geo-subsector-fill",
  ];

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapLibre
        ref={mapRef}
        initialViewState={PERU_VIEW}
        style={{ width: "100%", height: "100%" }}
        mapStyle={mapStyle}
        onLoad={handleLoad}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={interactive}
      >
        {/* ── Tegola vector tiles ── */}
        <Source id="peru" type="vector" tiles={[tileUrl]} minzoom={0} maxzoom={14} promoteId={{ departamentos: "coddep", provincias: "codprov_full", distritos: "ubigeo" }}>

          {/* ── DEPARTAMENTOS ── visible at level 0, ghost outline at level 1+ */}
          <Layer id="dep-fill" type="fill" source-layer="departamentos" filter={depFillFilter}
            paint={{
              "fill-color": "rgba(59, 130, 246, 0.15)",
              "fill-opacity": drillState.level === 0 ? 0.8 : 0.04,
            }} />
          <Layer id="dep-line" type="line" source-layer="departamentos" filter={depLineFilter}
            paint={{
              "line-color": drillState.level === 0 ? "#3b82f6" : "#94a3b8",
              "line-width": drillState.level === 0 ? 1.5 : 0.8,
              "line-opacity": drillState.level === 0 ? 0.6 : 0.2,
            }} />

          {/* ── PROVINCIAS ── visible at level 1, ghost outline at level 2+ (filter hides at level 0) */}
          <Layer id="prov-fill" type="fill" source-layer="provincias" filter={provFillFilter}
            paint={{
              "fill-color": "rgba(16, 185, 129, 0.18)",
              "fill-opacity": drillState.level === 1 ? 0.85 : 0.04,
            }} />
          <Layer id="prov-line" type="line" source-layer="provincias" filter={provLineFilter}
            paint={{
              "line-color": drillState.level === 1 ? "#10b981" : "#94a3b8",
              "line-width": drillState.level === 1 ? 1.2 : 0.6,
              "line-opacity": drillState.level === 1 ? 0.7 : 0.15,
            }} />

          {/* ── DISTRITOS ── level 2 = all dists, level 3 = only selected (painted) */}
          <Layer id="dist-fill" type="fill" source-layer="distritos" filter={distFillFilter}
            paint={{
              "fill-color": "rgba(249, 115, 22, 0.18)",
              "fill-opacity": 0.85,
            }} />
          <Layer id="dist-line" type="line" source-layer="distritos" filter={distLineFilter}
            paint={{
              "line-color": "#f97316",
              "line-width": drillState.level >= 3 ? 1.5 : 1,
              "line-opacity": 0.7,
            }} />

          {/* ── PRIORITY ZONES ── red overlay, visibility by drill state */}
          <Layer id="priority-dep-fill" type="fill" source-layer="priority_departamentos" filter={priorityDepFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
          <Layer id="priority-dep-line" type="line" source-layer="priority_departamentos" filter={priorityDepFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.8, "line-opacity": 0.4 }} />

          <Layer id="priority-prov-fill" type="fill" source-layer="priority_provincias" filter={priorityProvFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
          <Layer id="priority-prov-line" type="line" source-layer="priority_provincias" filter={priorityProvFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.6, "line-opacity": 0.4 }} />

          <Layer id="priority-dist-fill" type="fill" source-layer="priority_distritos" filter={priorityDistFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
          <Layer id="priority-dist-line" type="line" source-layer="priority_distritos" filter={priorityDistFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />

          {/* ── SECTORS / SUBSECTORS ── visible at level 3+ */}
          <Layer id="sector-fill" type="fill" source-layer="campaign_sectors" filter={sectorFilter}
            paint={{ "fill-color": SECTOR_FILL, "fill-opacity": 0.8 }} />
          <Layer id="sector-line" type="line" source-layer="campaign_sectors" filter={sectorFilter}
            paint={{ "line-color": SECTOR_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />
        </Source>

        {/* ── GeoJSON fallback: priority zones from local files ── */}
        {/* Visibility controlled by drill state, not zoom */}

        {/* dep-level zones — only at level 0 */}
        {geoData.dep && drillState.level === 0 && (
          <Source id="geo-dep" type="geojson" data={geoData.dep}>
            <Layer id="geo-dep-fill" type="fill" paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
            <Layer id="geo-dep-line" type="line" paint={{ "line-color": PRIORITY_LINE, "line-width": 0.8, "line-opacity": 0.4 }} />
          </Source>
        )}

        {/* prov-level zones — only at level 1 */}
        {geoData.prov && drillState.level === 1 && drillState.depCode && (() => {
          const filtered = geoData.prov.features.filter((f) => f.properties?.coddep === drillState.depCode);
          if (filtered.length === 0) return null;
          return (
            <Source id="geo-prov" type="geojson" data={{ ...geoData.prov, features: filtered }}>
              <Layer id="geo-prov-fill" type="fill" paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
              <Layer id="geo-prov-line" type="line" paint={{ "line-color": PRIORITY_LINE, "line-width": 0.6, "line-opacity": 0.4 }} />
            </Source>
          );
        })()}

        {/* dist-level zones — only at level 2 */}
        {geoData.dist && (() => {
          let filtered: GeoJSON.Feature[] = [];
          
          if (drillState.level === 0 && !geoData.dep && !geoData.prov) {
            // No higher-level GeoJSON available, show dists as top level
            filtered = geoData.dist.features;
          } else if (drillState.level === 2 && drillState.provCode) {
            filtered = geoData.dist.features.filter((f) => f.properties?.codprov_full === drillState.provCode);
          }
          
          if (filtered.length === 0) return null;
          
          return (
            <Source id="geo-dist" type="geojson" data={{ ...geoData.dist, features: filtered }}>
              <Layer id="geo-dist-fill" type="fill" paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 0.8 }} />
              <Layer id="geo-dist-line" type="line" paint={{ "line-color": PRIORITY_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />
            </Source>
          );
        })()}

        {/* sector-level zones — only at level 3+ */}
        {geoData.sector && drillState.level >= 3 && drillState.distCode && (
          <Source id="geo-sector" type="geojson" data={{
            ...geoData.sector,
            features: geoData.sector.features.filter((f) => f.properties?.ubigeo === drillState.distCode),
          }}>
            <Layer id="geo-sector-fill" type="fill" paint={{ "fill-color": SECTOR_FILL, "fill-opacity": 0.8 }} />
            <Layer id="geo-sector-line" type="line" paint={{ "line-color": SECTOR_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />
          </Source>
        )}

        {/* subsector-level zones */}
        {geoData.subsector && drillState.level >= 4 && drillState.distCode && drillState.sector != null && (
          <Source id="geo-subsector" type="geojson" data={{
            ...geoData.subsector,
            features: geoData.subsector.features.filter((f) =>
              f.properties?.ubigeo === drillState.distCode && f.properties?.sector === drillState.sector,
            ),
          }}>
            <Layer id="geo-subsector-fill" type="fill" paint={{ "fill-color": SECTOR_FILL, "fill-opacity": 1 }} />
            <Layer id="geo-subsector-line" type="line" paint={{ "line-color": SECTOR_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />
          </Source>
        )}

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
                0, "rgba(0,0,0,0)",
                0.2, "rgba(30,58,95,0.35)",
                0.4, "rgba(13,148,136,0.5)",
                0.6, "rgba(217,119,6,0.6)",
                0.8, "rgba(180,83,9,0.7)",
                1, "rgba(127,29,29,0.8)",
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
    </div>
  );
});


