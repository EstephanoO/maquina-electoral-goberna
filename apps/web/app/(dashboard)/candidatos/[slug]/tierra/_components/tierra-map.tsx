"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, Popup, Source } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { FilterSpecification, StyleSpecification, MapGeoJSONFeature, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type DrillLevel, type DrillState, INITIAL_DRILL } from "./zone-breadcrumb";
import {
  getProvincias,
  getDistritos,
  preloadProvincias,
  preloadDistritos,
  reverseGeocode,
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

type HoverInfo = {
  lng: number;
  lat: number;
} & (
  | { type: "cluster"; count: number }
  | { type: "form"; nombre: string; created_at: string }
  | { type: "agent"; agent: EnrichedAgent }
  | { type: "zone"; name: string; level: string }
);

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
const BORDER_COLOR = "#0a0a0a";
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
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Strategy: Use database geometry (Tegola vector tiles) for hierarchy navigation.
  // Level 0: Show all departamentos (clickable to drill into)
  // Level 1: Show provincias of selected departamento
  // Level 2: Show distritos of selected provincia
  // Level 3+: Show campaign sectors/subsectors

  // ── Base map filters (Tegola vector tiles) ──

  // Departamentos FILL: only at level 0 (clickable), hide at level 1+ to not block province clicks
  const depFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return ["all"] as FilterSpecification;
    return HIDE_FILTER; // Hide fill at level 1+ so provinces can be clicked
  }, [drillState.level]);

  // Departamentos LINE: show outline of selected dep at level 1+ for context
  const depLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 0) return ["all"] as FilterSpecification;
    if (drillState.depCode) return ["==", ["get", "coddep"], drillState.depCode];
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode]);

  // Provincias FILL: only at level 1 (clickable), hide at level 2+ to not block district clicks
  const provFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 1 && drillState.depCode) {
      return ["==", ["get", "coddep"], drillState.depCode];
    }
    return HIDE_FILTER; // Hide fill at level 2+ so districts can be clicked
  }, [drillState.level, drillState.depCode]);

  // Provincias LINE: show outline of selected prov at level 2+ for context
  const provLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 1 && drillState.depCode) {
      return ["==", ["get", "coddep"], drillState.depCode];
    }
    if (drillState.level >= 2 && drillState.provCode) {
      return ["==", ["get", "codprov_full"], drillState.provCode];
    }
    return HIDE_FILTER;
  }, [drillState.level, drillState.depCode, drillState.provCode]);

  // Distritos FILL: only at level 2 (clickable)
  const distFillFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 2 && drillState.provCode) {
      return ["==", ["get", "codprov_full"], drillState.provCode];
    }
    return HIDE_FILTER;
  }, [drillState.level, drillState.provCode]);

  // Distritos LINE: show outline of selected dist at level 3+ for context
  const distLineFilter: FilterSpecification = useMemo(() => {
    if (drillState.level === 2 && drillState.provCode) {
      return ["==", ["get", "codprov_full"], drillState.provCode];
    }
    if (drillState.level >= 3 && drillState.distCode) {
      return ["==", ["get", "ubigeo"], drillState.distCode];
    }
    return HIDE_FILTER;
  }, [drillState.level, drillState.provCode, drillState.distCode]);

  // ── Priority layer filters (red fill — the actual visible zones) ──

  // Priority deps: always show at level 0; hide once drilled into a dep
  const priorityDepFilter: FilterSpecification = useMemo(() => {
    if (drillState.level >= 1) return HIDE_FILTER;
    return ["all", campaignFilter] as FilterSpecification;
  }, [campaignFilter, drillState.level]);

  // Priority provs: show at level 1 (inside a dep), filtered to that dep
  const priorityProvFilter: FilterSpecification = useMemo(() => {
    if (drillState.level !== 1 || !drillState.depCode) return HIDE_FILTER;
    return ["all", campaignFilter, ["==", ["get", "coddep"], drillState.depCode]] as FilterSpecification;
  }, [campaignFilter, drillState.level, drillState.depCode]);

  // Priority dists: show at level 2 (inside a prov), filtered to that prov
  const priorityDistFilter: FilterSpecification = useMemo(() => {
    if (drillState.level !== 2 || !drillState.provCode) return HIDE_FILTER;
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
  }, []);

  // Drill-down click handler
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
        // For other levels, the fitBounds will happen when the filter updates and re-renders
      }
      return;
    }

    const f = features[0];
    const layerId = f.layer?.id;

    // Cluster click → expand and detect geographic location via reverse geocoding
    if (layerId === "forms-clusters" || layerId === "forms-cluster-ring") {
      const clusterId = f.properties?.cluster_id;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      const [lng, lat] = coords;
      
      if (clusterId != null && mapRef.current) {
        const map = mapRef.current.getMap();
        const source = map.getSource("forms-clustered") as GeoJSONSource | undefined;
        
        // Use reverse geocoding API to detect the distrito at this point
        const detectAndUpdateDrillState = async (targetZoom: number) => {
          // Call backend reverse geocode API
          const result = await reverseGeocode(lng, lat);
          
          if (result.ok && result.result) {
            const { coddep, departamento, codprov_full, provincia, ubigeo, distrito } = result.result;
            
            // Determine drill level based on zoom
            if (targetZoom >= 9) {
              // Drill to distrito level
              skipNextFitRef.current = true;
              onDrillChange({
                level: 3,
                depCode: coddep,
                depName: departamento,
                provCode: codprov_full,
                provName: provincia,
                distCode: ubigeo,
                distName: distrito,
                sector: null,
                sectorName: null,
              });
            } else if (targetZoom >= 7) {
              // Drill to provincia level
              skipNextFitRef.current = true;
              onDrillChange({
                level: 2,
                depCode: coddep,
                depName: departamento,
                provCode: codprov_full,
                provName: provincia,
                distCode: null,
                distName: null,
                sector: null,
                sectorName: null,
              });
            } else {
              // Drill to departamento level
              skipNextFitRef.current = true;
              onDrillChange({
                ...INITIAL_DRILL,
                level: 1,
                depCode: coddep,
                depName: departamento,
              });
            }
          }
          // If reverse geocode fails, just zoom without updating drill state
        };
        
        // Perform cluster expansion zoom
        const performZoomAndDetect = (targetZoom: number) => {
          mapRef.current?.flyTo({
            center: [lng, lat],
            zoom: targetZoom,
            duration: 600,
            essential: true,
          });
          // Detect zone after fly animation completes
          setTimeout(() => detectAndUpdateDrillState(targetZoom), 650);
        };
        
        if (source && typeof source.getClusterExpansionZoom === "function") {
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            const targetZoom = Math.min(zoom + 0.5, 18);
            performZoomAndDetect(targetZoom);
          }).catch(() => {
            const currentZoom = mapRef.current?.getZoom() ?? 10;
            const targetZoom = Math.min(currentZoom + 2, 18);
            performZoomAndDetect(targetZoom);
          });
        } else {
          const currentZoom = mapRef.current?.getZoom() ?? 10;
          const targetZoom = Math.min(currentZoom + 2, 18);
          performZoomAndDetect(targetZoom);
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
    // Include both Tegola base layers (dep-fill, prov-fill, dist-fill) and priority/GeoJSON layers
    const isDep = layerId === "dep-fill" || layerId?.startsWith("priority-dep") || layerId === "geo-dep-fill";
    const isProv = layerId === "prov-fill" || layerId?.startsWith("priority-prov") || layerId === "geo-prov-fill";
    const isDist = layerId === "dist-fill" || layerId?.startsWith("priority-dist") || layerId === "geo-dist-fill";
    const isSector = layerId?.startsWith("sector") || layerId === "geo-sector-fill";
    const isSubsector = layerId === "geo-subsector-fill";

    if (isDep) {
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? "");
      const name = String(f.properties?.departamento ?? f.properties?.departamen ?? f.properties?.DEPARTAMEN ?? coddep);
      if (coddep) {
        // Preload provincias for this departamento (will be cached)
        preloadProvincias(coddep);
        
        // Try to get bounds from cached API first, fallback to feature geometry
        getProvincias(coddep).then((result) => {
          if (result.ok && result.bounds && mapRef.current) {
            mapRef.current.fitBounds(result.bounds, { padding: 40, duration: 800 });
          } else {
            // Fallback to feature bounds
            const bounds = getBoundsFromFeature(f);
            if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
          }
        }).catch(() => {
          const bounds = getBoundsFromFeature(f);
          if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
        });
        
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
        // Preload distritos for this provincia (will be cached)
        preloadDistritos(codprovFull);
        
        // Try to get bounds from cached API first, fallback to feature geometry
        getDistritos(codprovFull).then((result) => {
          if (result.ok && result.bounds && mapRef.current) {
            mapRef.current.fitBounds(result.bounds, { padding: 40, duration: 800 });
          } else {
            // Fallback to feature bounds
            const bounds = getBoundsFromFeature(f);
            if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
          }
        }).catch(() => {
          const bounds = getBoundsFromFeature(f);
          if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: 800 });
        });
        
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
        // For distritos, use feature bounds (no deeper level to preload from API)
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

  // Hover handler
  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    const features = e.features;
    if (!features?.length) {
      hoverTimer.current = setTimeout(() => setHover(null), 80);
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
      return;
    }
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "pointer";
    const f = features[0];
    const layerId = f.layer?.id;
    const coords = (f.geometry as GeoJSON.Point).coordinates;

    if (layerId === "forms-clusters" || layerId === "forms-cluster-ring") {
      setHover({ type: "cluster", lng: coords[0], lat: coords[1], count: f.properties?.point_count ?? 0 });
    } else if (layerId === "forms-points") {
      setHover({ type: "form", lng: coords[0], lat: coords[1], nombre: f.properties?.nombre ?? "", created_at: f.properties?.created_at ?? "" });
    } else if (layerId === "agents-circles" || layerId === "agents-selected-ring") {
      const agent = agents.find((a) => a.id === f.properties?.agent_id);
      if (agent) setHover({ type: "agent", lng: coords[0], lat: coords[1], agent });
    } else if (layerId === "dep-fill" || layerId === "prov-fill" || layerId === "dist-fill" || 
               layerId?.startsWith("priority-dep") || layerId?.startsWith("priority-prov") || layerId?.startsWith("priority-dist") || 
               layerId?.startsWith("geo-dep") || layerId?.startsWith("geo-prov") || layerId?.startsWith("geo-dist")) {
      const name = String(f.properties?.departamento ?? f.properties?.DEPARTAMEN ?? f.properties?.provincia ?? f.properties?.PROVINCIA ?? f.properties?.distrito ?? f.properties?.DISTRITO ?? "");
      const zoneLevel = layerId?.includes("dep") ? "departamento" : layerId?.includes("prov") ? "provincia" : "distrito";
      setHover({ type: "zone", lng: e.lngLat.lng, lat: e.lngLat.lat, name, level: zoneLevel });
    } else if (layerId?.startsWith("sector") || layerId?.startsWith("geo-sector") || layerId?.startsWith("geo-subsector")) {
      const name = String(f.properties?.zone_name ?? f.properties?.DISTRITO ?? `Sector ${f.properties?.sector ?? f.properties?.SECTOR ?? ""}`);
      setHover({ type: "zone", lng: e.lngLat.lng, lat: e.lngLat.lat, name, level: "sector" });
    } else {
      setHover(null);
    }
  }, [agents]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(null), 100);
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

  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

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

          {/* ── Departamentos: clickable at level 0, outline-only context at level 1+ ── */}
          <Layer id="dep-fill" type="fill" source-layer="departamentos" filter={depFillFilter}
            paint={{ "fill-color": "rgba(59, 130, 246, 0.15)", "fill-opacity": 1 }} />
          <Layer id="dep-line" type="line" source-layer="departamentos" filter={depLineFilter}
            paint={{ 
              "line-color": drillState.level === 0 ? "#3b82f6" : "#94a3b8", 
              "line-width": drillState.level === 0 ? 1.5 : 1, 
              "line-opacity": drillState.level === 0 ? 0.6 : 0.3 
            }} />
          {drillState.level === 0 && (
            <Layer id="dep-label" type="symbol" source-layer="departamentos" filter={depFillFilter} minzoom={5}
              layout={{ 
                "text-field": ["get", "departamento"], 
                "text-size": 11, 
                "text-font": ["Open Sans Bold"], 
                "text-allow-overlap": false,
                "text-transform": "uppercase"
              }} 
              paint={{ "text-color": "#1e40af", "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 1.5 }} />
          )}

          {/* ── Provincias: clickable at level 1, outline-only context at level 2+ ── */}
          <Layer id="prov-fill" type="fill" source-layer="provincias" filter={provFillFilter}
            paint={{ "fill-color": "rgba(16, 185, 129, 0.18)", "fill-opacity": 1 }} />
          <Layer id="prov-line" type="line" source-layer="provincias" filter={provLineFilter}
            paint={{ 
              "line-color": drillState.level === 1 ? "#10b981" : "#94a3b8", 
              "line-width": drillState.level === 1 ? 1.2 : 0.8, 
              "line-opacity": drillState.level === 1 ? 0.7 : 0.3 
            }} />
          {drillState.level === 1 && (
            <Layer id="prov-label" type="symbol" source-layer="provincias" filter={provFillFilter} minzoom={7}
              layout={{ 
                "text-field": ["get", "provincia"], 
                "text-size": 11, 
                "text-font": ["Open Sans Bold"], 
                "text-allow-overlap": false 
              }} 
              paint={{ "text-color": "#047857", "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 1.5 }} />
          )}

          {/* ── Distritos: clickable at level 2, outline-only context at level 3+ ── */}
          <Layer id="dist-fill" type="fill" source-layer="distritos" filter={distFillFilter}
            paint={{ "fill-color": "rgba(249, 115, 22, 0.18)", "fill-opacity": 1 }} />
          <Layer id="dist-line" type="line" source-layer="distritos" filter={distLineFilter}
            paint={{ 
              "line-color": drillState.level === 2 ? "#f97316" : "#94a3b8", 
              "line-width": drillState.level === 2 ? 1 : 0.6, 
              "line-opacity": drillState.level === 2 ? 0.7 : 0.3 
            }} />
          {drillState.level === 2 && (
            <Layer id="dist-label" type="symbol" source-layer="distritos" filter={distFillFilter} minzoom={9}
              layout={{ 
                "text-field": ["get", "distrito"], 
                "text-size": 10, 
                "text-font": ["Open Sans Bold"], 
                "text-allow-overlap": false 
              }} 
              paint={{ "text-color": "#c2410c", "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 1.5 }} />
          )}

          {/* ── Priority zones: RED fill + thin black border ── */}

          {/* Priority departamentos — level 0 only */}
          <Layer id="priority-dep-fill" type="fill" source-layer="priority_departamentos" filter={priorityDepFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 1 }} />
          <Layer id="priority-dep-line" type="line" source-layer="priority_departamentos" filter={priorityDepFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.8, "line-opacity": 0.4 }} />

          {/* Priority provincias — level 1 only */}
          <Layer id="priority-prov-fill" type="fill" source-layer="priority_provincias" filter={priorityProvFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 1 }} />
          <Layer id="priority-prov-line" type="line" source-layer="priority_provincias" filter={priorityProvFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.6, "line-opacity": 0.4 }} />

          {/* Priority distritos — level 2 only */}
          <Layer id="priority-dist-fill" type="fill" source-layer="priority_distritos" filter={priorityDistFilter}
            paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 1 }} />
          <Layer id="priority-dist-line" type="line" source-layer="priority_distritos" filter={priorityDistFilter}
            paint={{ "line-color": PRIORITY_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />

          {/* Campaign sectors/subsectors — level 3+ */}
          <Layer id="sector-fill" type="fill" source-layer="campaign_sectors" filter={sectorFilter}
            paint={{ "fill-color": SECTOR_FILL, "fill-opacity": 1 }} />
          <Layer id="sector-line" type="line" source-layer="campaign_sectors" filter={sectorFilter}
            paint={{ "line-color": SECTOR_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />
          <Layer id="sector-label" type="symbol" source-layer="campaign_sectors" filter={sectorFilter} minzoom={11}
            layout={{ "text-field": ["get", "zone_name"], "text-size": 10, "text-font": ["Open Sans Bold"], "text-allow-overlap": false }}
            paint={{ "text-color": "#0f172a", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.5 }} />
        </Source>

        {/* ── GeoJSON fallback: priority zones from local files ── */}
        {/* These render when Tegola priority tables are empty (data not yet imported) */}

        {/* GeoJSON priority zones — shown per drill level */}
        {/* dep-level zones */}
        {geoData.dep && drillState.level === 0 && (
          <Source id="geo-dep" type="geojson" data={geoData.dep}>
            <Layer id="geo-dep-fill" type="fill" paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 1 }} />
            <Layer id="geo-dep-line" type="line" paint={{ "line-color": PRIORITY_LINE, "line-width": 0.8, "line-opacity": 0.4 }} />
            <Layer id="geo-dep-label" type="symbol" minzoom={5} layout={{
              "text-field": ["get", "departamento"],
              "text-size": 12,
              "text-font": ["Open Sans Bold"],
              "text-allow-overlap": false,
            }} paint={{ "text-color": "#0f172a", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.5 }} />
          </Source>
        )}

        {/* prov-level zones - show when at level 1 (inside a dep) */}
        {geoData.prov && drillState.level === 1 && drillState.depCode && (() => {
          const filtered = geoData.prov.features.filter((f) => f.properties?.coddep === drillState.depCode);
          if (filtered.length === 0) return null;
          return (
            <Source id="geo-prov" type="geojson" data={{ ...geoData.prov, features: filtered }}>
              <Layer id="geo-prov-fill" type="fill" paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 1 }} />
              <Layer id="geo-prov-line" type="line" paint={{ "line-color": PRIORITY_LINE, "line-width": 0.6, "line-opacity": 0.4 }} />
              <Layer id="geo-prov-label" type="symbol" minzoom={7} layout={{
                "text-field": ["get", "provincia"],
                "text-size": 11,
                "text-font": ["Open Sans Bold"],
                "text-allow-overlap": false,
              }} paint={{ "text-color": "#0f172a", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.5 }} />
            </Source>
          );
        })()}

        {/* dist-level zones — show at level 0 if no dep/prov data, else at level 2 */}
        {geoData.dist && (() => {
          // Determine which districts to show based on drill level
          let filtered: GeoJSON.Feature[] = [];
          
          if (drillState.level === 0 && !geoData.dep && !geoData.prov) {
            // No parent data - show all districts at overview
            filtered = geoData.dist.features;
          } else if (drillState.level === 2 && drillState.provCode) {
            // Inside a province - show districts of that province
            filtered = geoData.dist.features.filter((f) => f.properties?.codprov_full === drillState.provCode);
          }
          
          if (filtered.length === 0) return null;
          
          return (
            <Source id="geo-dist" type="geojson" data={{ ...geoData.dist, features: filtered }}>
              <Layer id="geo-dist-fill" type="fill" paint={{ "fill-color": PRIORITY_FILL, "fill-opacity": 1 }} />
              <Layer id="geo-dist-line" type="line" paint={{ "line-color": PRIORITY_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />
              <Layer id="geo-dist-label" type="symbol" minzoom={9} layout={{
                "text-field": ["get", "distrito"],
                "text-size": 10,
                "text-font": ["Open Sans Bold"],
                "text-allow-overlap": false,
              }} paint={{ "text-color": "#0f172a", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.5 }} />
            </Source>
          );
        })()}

        {/* sector-level zones */}
        {geoData.sector && drillState.level === 3 && drillState.distCode && (
          <Source id="geo-sector" type="geojson" data={{
            ...geoData.sector,
            features: geoData.sector.features.filter((f) => f.properties?.ubigeo === drillState.distCode),
          }}>
            <Layer id="geo-sector-fill" type="fill" paint={{ "fill-color": SECTOR_FILL, "fill-opacity": 1 }} />
            <Layer id="geo-sector-line" type="line" paint={{ "line-color": SECTOR_LINE, "line-width": 0.5, "line-opacity": 0.4 }} />
          </Source>
        )}

        {/* subsector-level zones */}
        {geoData.subsector && drillState.level === 4 && drillState.distCode && drillState.sector != null && (
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

        {/* ── Hover tooltips ── */}
        {hover && <HoverTooltip hover={hover} primaryColor={primaryColor} />}
      </MapLibre>
    </div>
  );
});

/* ========== Hover Tooltip ========== */

const STATUS_LABELS: Record<AgentStatus, string> = {
  connected: "Conectado",
  idle: "Inactivo",
  inactive: "Desconectado",
};

function HoverTooltip({ hover, primaryColor }: { hover: HoverInfo; primaryColor: string }) {
  if (hover.type === "cluster") {
    return (
      <Popup longitude={hover.lng} latitude={hover.lat} anchor="bottom" offset={[0, -8]} closeButton={false} closeOnClick={false}>
        <div style={TT.wrap}>
          <div style={TT.row}>
            <span style={TT.icon}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <circle cx="12" cy="12" r="8" opacity="0.4" />
              </svg>
            </span>
            <div>
              <div style={TT.mainText}>
                <span style={{ ...TT.number, color: "#2563eb" }}>{hover.count}</span>
                <span style={TT.unit}>{hover.count === 1 ? "registro" : "registros"}</span>
              </div>
              <span style={TT.hint}>Click para expandir</span>
            </div>
          </div>
        </div>
      </Popup>
    );
  }

  if (hover.type === "form") {
    const d = hover.created_at ? new Date(hover.created_at).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    return (
      <Popup longitude={hover.lng} latitude={hover.lat} anchor="bottom" offset={[0, -4]} closeButton={false} closeOnClick={false}>
        <div style={TT.wrap}>
          <div style={TT.row}>
            <span style={{ ...TT.icon, backgroundColor: "rgba(37, 99, 235, 0.1)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <div>
              <div style={TT.title}>{hover.nombre || "Sin nombre"}</div>
              {d && <div style={TT.subtitle}>{d}</div>}
            </div>
          </div>
        </div>
      </Popup>
    );
  }

  if (hover.type === "agent") {
    const { agent } = hover;
    const statusColor = STATUS_COLORS[agent.status];
    return (
      <Popup longitude={hover.lng} latitude={hover.lat} anchor="bottom" offset={[0, -12]} closeButton={false} closeOnClick={false}>
        <div style={TT.wrap}>
          <div style={TT.row}>
            <span style={{ ...TT.icon, backgroundColor: `${statusColor}15` }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" fill={statusColor} />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <div style={TT.title}>{agent.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: statusColor }} />
                  <span style={{ ...TT.subtitle, marginTop: 0 }}>{STATUS_LABELS[agent.status]}</span>
                </span>
                <span style={{ color: "#cbd5e1" }}>•</span>
                <span style={{ ...TT.subtitle, marginTop: 0 }}>
                  <span style={{ fontWeight: 600, color: primaryColor }}>{agent.forms_count}</span> datos
                </span>
              </div>
            </div>
          </div>
        </div>
      </Popup>
    );
  }

  if (hover.type === "zone") {
    return (
      <Popup longitude={hover.lng} latitude={hover.lat} anchor="bottom" offset={[0, -4]} closeButton={false} closeOnClick={false}>
        <div style={TT.wrap}>
          <div style={TT.row}>
            <span style={{ ...TT.icon, backgroundColor: "rgba(239, 68, 68, 0.1)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </span>
            <div>
              <div style={TT.title}>{hover.name}</div>
              <div style={TT.subtitle}>{hover.level.charAt(0).toUpperCase() + hover.level.slice(1)}</div>
              <span style={TT.hint}>Click para explorar</span>
            </div>
          </div>
        </div>
      </Popup>
    );
  }

  return null;
}

/* Tooltip styles */
const TT: Record<string, React.CSSProperties> = {
  wrap: {
    padding: "10px 12px",
    minWidth: 140,
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mainText: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
  },
  number: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1,
  },
  unit: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: 500,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  hint: {
    display: "block",
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 4,
  },
};
