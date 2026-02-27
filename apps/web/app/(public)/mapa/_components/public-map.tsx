"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Map as MapLibre, Source, Layer, NavigationControl } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type {
  StyleSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  FilterSpecification,
} from "maplibre-gl";

/* ─── Constants ─── */

const LIGHT_TILES = "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png";
const TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

const PERU_VIEW = { longitude: -75.0152, latitude: -9.1899, zoom: 5 } as const;
const PERU_BOUNDS: [[number, number], [number, number]] = [[-81.4, -18.4], [-68.7, -0.1]];
const PERU_BOUNDS_FLAT: [number, number, number, number] = [-81.4, -18.4, -68.7, -0.1];

const PROMOTE_ID = {
  departamentos: "coddep",
  provincias: "codprov_full",
  distritos: "ubigeo",
};

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "light-base": { type: "raster", tiles: [LIGHT_TILES], tileSize: 256, attribution: "&copy; CARTO", maxzoom: 19 },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#e6e5e3" } },
    { id: "light-base", type: "raster", source: "light-base" },
  ],
  transition: { duration: 0, delay: 0 },
};

const HIDE: FilterSpecification = ["==", "1", "0"];
const SHOW_ALL: FilterSpecification = ["all"];

const ZONE_FILL = "rgba(148, 163, 184, 0.06)";
const ZONE_LINE = "#334155";
const MASK_COLOR = "#0f172a";
const MASK_OPACITY_ACTIVE = 0.06;
const MASK_OPACITY_HOVER = 0.14;
const MASK_OPACITY_DIM = 0.45;

const FLY_DURATION = 600;

const HOVER_LAYERS: Record<string, string> = {
  "dep-fill": "departamentos",
  "prov-fill": "provincias",
  "dist-fill": "distritos",
};

const INTERACTIVE_LAYERS = ["dep-fill", "prov-fill", "dist-fill"];

/* ─── Types ─── */

type DrillLevel = 0 | 1 | 2 | 3;

type DrillState = {
  level: DrillLevel;
  depCode?: string;
  depName?: string;
  provCode?: string;
  provName?: string;
  distCode?: string;
  distName?: string;
};

const INITIAL_DRILL: DrillState = { level: 0 };

/* ─── Paint helpers ─── */

function buildMaskFill(level: DrillLevel, depCode?: string, provCode?: string, distCode?: string): FillLayerSpecification["paint"] {
  if (level === 0) {
    return {
      "fill-color": MASK_COLOR,
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false], MASK_OPACITY_HOVER,
        MASK_OPACITY_ACTIVE,
      ],
    };
  }
  // Drill level 1+: dim non-selected, highlight selected
  const code = level === 1 ? depCode : level === 2 ? provCode : distCode;
  const prop = level === 1 ? "coddep" : level === 2 ? "codprov_full" : "ubigeo";
  return {
    "fill-color": MASK_COLOR,
    "fill-opacity": [
      "case",
      ["==", ["get", prop], code ?? ""],
      ["case", ["boolean", ["feature-state", "hover"], false], MASK_OPACITY_HOVER, MASK_OPACITY_ACTIVE],
      MASK_OPACITY_DIM,
    ],
  };
}

/* ─── Component ─── */

export function PublicMap() {
  const mapRef = useRef<MapRef>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [drill, setDrill] = useState<DrillState>(INITIAL_DRILL);
  const hoveredRef = useRef<{ source: string; id: string | number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null);

  // Client-side tile URL resolution
  useEffect(() => {
    setTileUrl(`${window.location.origin}${TILE_TEMPLATE}`);
    setReady(true);
  }, []);

  // Fit bounds on drill change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drill.level === 0) {
      map.fitBounds(PERU_BOUNDS, { padding: 40, duration: FLY_DURATION });
    }
  }, [drill.level]);

  /* ─── Filters ─── */

  const depFilter: FilterSpecification = SHOW_ALL;
  const provFilter: FilterSpecification = drill.level >= 1
    ? ["==", ["get", "coddep"], drill.depCode ?? ""]
    : HIDE;
  const distFilter: FilterSpecification = drill.level >= 2
    ? ["==", ["get", "codprov_full"], drill.provCode ?? ""]
    : HIDE;

  const depFillPaint = buildMaskFill(drill.level, drill.depCode);
  const provFillPaint = drill.level >= 1
    ? buildMaskFill(drill.level, drill.depCode, drill.provCode)
    : { "fill-color": ZONE_FILL };
  const distFillPaint = drill.level >= 2
    ? buildMaskFill(drill.level, drill.depCode, drill.provCode, drill.distCode)
    : { "fill-color": ZONE_FILL };

  /* ─── Hover handling ─── */

  const handleMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous hover
    if (hoveredRef.current) {
      map.setFeatureState(
        { source: "peru", sourceLayer: hoveredRef.current.source, id: hoveredRef.current.id },
        { hover: false },
      );
      hoveredRef.current = null;
    }

    const f = e.features?.[0];
    if (!f || !f.id) {
      map.getCanvas().style.cursor = "";
      setTooltip(null);
      return;
    }

    const layerId = f.layer.id;
    const sourceLayer = HOVER_LAYERS[layerId];
    if (!sourceLayer) {
      setTooltip(null);
      return;
    }

    map.getCanvas().style.cursor = "pointer";
    map.setFeatureState(
      { source: "peru", sourceLayer, id: f.id },
      { hover: true },
    );
    hoveredRef.current = { source: sourceLayer, id: f.id };

    // Tooltip
    const name =
      f.properties?.departamento ??
      f.properties?.provincia ??
      f.properties?.distrito ??
      "";
    if (name) {
      setTooltip({ x: e.point.x, y: e.point.y, name });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hoveredRef.current) {
      map.setFeatureState(
        { source: "peru", sourceLayer: hoveredRef.current.source, id: hoveredRef.current.id },
        { hover: false },
      );
      hoveredRef.current = null;
    }
    map.getCanvas().style.cursor = "";
    setTooltip(null);
  }, []);

  /* ─── Click / drill ─── */

  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current;
    if (!map) return;

    const f = e.features?.[0];

    // Click empty space → drill up
    if (!f) {
      setDrill((prev) => {
        if (prev.level === 0) return prev;
        if (prev.level === 1) return INITIAL_DRILL;
        if (prev.level === 2) return { level: 1, depCode: prev.depCode, depName: prev.depName };
        return { level: 2, depCode: prev.depCode, depName: prev.depName, provCode: prev.provCode, provName: prev.provName };
      });
      return;
    }

    const layerId = f.layer.id;
    const props = f.properties ?? {};

    if (layerId === "dep-fill" && drill.level === 0) {
      // Drill into department
      const bbox = getBBox(f);
      if (bbox) map.fitBounds(bbox, { padding: 40, duration: FLY_DURATION });
      setDrill({
        level: 1,
        depCode: props.coddep,
        depName: props.departamento,
      });
    } else if (layerId === "prov-fill" && drill.level === 1) {
      // Drill into province
      const bbox = getBBox(f);
      if (bbox) map.fitBounds(bbox, { padding: 40, duration: FLY_DURATION });
      setDrill({
        level: 2,
        depCode: drill.depCode,
        depName: drill.depName,
        provCode: props.codprov_full,
        provName: props.provincia,
      });
    } else if (layerId === "dist-fill" && drill.level === 2) {
      // Drill into district
      const bbox = getBBox(f);
      if (bbox) map.fitBounds(bbox, { padding: 40, duration: FLY_DURATION });
      setDrill({
        level: 3,
        depCode: drill.depCode,
        depName: drill.depName,
        provCode: drill.provCode,
        provName: drill.provName,
        distCode: props.ubigeo,
        distName: props.distrito,
      });
    } else {
      // Click on a layer that doesn't match current level → drill up
      setDrill((prev) => {
        if (prev.level === 0) return prev;
        if (prev.level === 1) return INITIAL_DRILL;
        if (prev.level === 2) return { level: 1, depCode: prev.depCode, depName: prev.depName };
        return { level: 2, depCode: prev.depCode, depName: prev.depName, provCode: prev.provCode, provName: prev.provName };
      });
    }
  }, [drill]);

  const handleLoad = useCallback(() => {
    mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: 0 });
  }, []);

  /* ─── Breadcrumb ─── */

  const breadcrumb = buildBreadcrumb(drill, setDrill, mapRef);

  if (!ready || !tileUrl) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#e6e5e3" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--color-text-tertiary)", fontSize: 14 }}>
          <div style={{ width: 20, height: 20, border: "2px solid var(--color-border)", borderTopColor: "var(--goberna-blue-600)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Cargando mapa...
          <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", flex: 1 }}>
      {/* Breadcrumb */}
      {breadcrumb}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 28,
            padding: "6px 12px",
            background: "var(--goberna-blue-950)",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: "var(--radius-sm)",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {tooltip.name}
        </div>
      )}

      <MapLibre
        ref={mapRef}
        initialViewState={PERU_VIEW}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        maxTileCacheZoomLevels={10}
        fadeDuration={0}
        onLoad={handleLoad}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={INTERACTIVE_LAYERS}
      >
        <NavigationControl position="bottom-right" />

        {/* Vector tile source */}
        <Source
          id="peru"
          type="vector"
          tiles={[tileUrl]}
          promoteId={PROMOTE_ID}
          bounds={PERU_BOUNDS_FLAT}
          maxzoom={12}
        >
          {/* Departamentos */}
          <Layer id="dep-fill" type="fill" source-layer="departamentos" filter={depFilter} paint={depFillPaint as FillLayerSpecification["paint"]} />
          <Layer id="dep-line" type="line" source-layer="departamentos" filter={depFilter} paint={{ "line-color": ZONE_LINE, "line-width": drill.level === 0 ? 1 : 0.5, "line-opacity": drill.level === 0 ? 0.7 : 0.3 } as LineLayerSpecification["paint"]} />

          {/* Provincias */}
          <Layer id="prov-fill" type="fill" source-layer="provincias" filter={provFilter} paint={provFillPaint as FillLayerSpecification["paint"]} />
          <Layer id="prov-line" type="line" source-layer="provincias" filter={provFilter} paint={{ "line-color": ZONE_LINE, "line-width": 0.8, "line-opacity": 0.5 } as LineLayerSpecification["paint"]} />

          {/* Distritos */}
          <Layer id="dist-fill" type="fill" source-layer="distritos" filter={distFilter} paint={distFillPaint as FillLayerSpecification["paint"]} />
          <Layer id="dist-line" type="line" source-layer="distritos" filter={distFilter} paint={{ "line-color": ZONE_LINE, "line-width": 0.6, "line-opacity": 0.4 } as LineLayerSpecification["paint"]} />
        </Source>
      </MapLibre>
    </div>
  );
}

/* ─── Helpers ─── */

function getBBox(feature: GeoJSON.Feature): [[number, number], [number, number]] | null {
  if (!feature.geometry) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const coords = getAllCoordinates(feature.geometry);
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!isFinite(minLng)) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

function getAllCoordinates(geometry: GeoJSON.Geometry): number[][] {
  switch (geometry.type) {
    case "Point": return [geometry.coordinates];
    case "MultiPoint":
    case "LineString": return geometry.coordinates;
    case "MultiLineString":
    case "Polygon": return geometry.coordinates.flat();
    case "MultiPolygon": return geometry.coordinates.flat(2);
    case "GeometryCollection": return geometry.geometries.flatMap(getAllCoordinates);
    default: return [];
  }
}

function buildBreadcrumb(
  drill: DrillState,
  setDrill: React.Dispatch<React.SetStateAction<DrillState>>,
  mapRef: React.RefObject<MapRef | null>,
) {
  if (drill.level === 0) return null;

  const items: { label: string; onClick: () => void }[] = [
    {
      label: "Peru",
      onClick: () => {
        setDrill(INITIAL_DRILL);
        mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: FLY_DURATION });
      },
    },
  ];

  if (drill.level >= 1 && drill.depName) {
    items.push({
      label: drill.depName,
      onClick: () => {
        if (drill.level > 1) {
          setDrill({ level: 1, depCode: drill.depCode, depName: drill.depName });
        }
      },
    });
  }

  if (drill.level >= 2 && drill.provName) {
    items.push({
      label: drill.provName,
      onClick: () => {
        if (drill.level > 2) {
          setDrill({
            level: 2,
            depCode: drill.depCode,
            depName: drill.depName,
            provCode: drill.provCode,
            provName: drill.provName,
          });
        }
      },
    });
  }

  if (drill.level >= 3 && drill.distName) {
    items.push({ label: drill.distName, onClick: () => {} });
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "8px 14px",
        background: "rgba(255,255,255,0.95)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-md)",
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
      }}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
            <button
              type="button"
              onClick={item.onClick}
              style={{
                background: "none",
                border: "none",
                cursor: isLast ? "default" : "pointer",
                color: isLast ? "var(--goberna-blue-900)" : "var(--goberna-blue-600)",
                fontWeight: isLast ? 700 : 500,
                fontSize: 13,
                fontFamily: "inherit",
                padding: "2px 4px",
                borderRadius: 4,
                transition: "background 0.1s ease",
              }}
            >
              {item.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
