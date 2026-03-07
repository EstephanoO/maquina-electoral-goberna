"use client";

/**
 * RegionsMap — GA4 audience visualization by Peru region (departamento).
 *
 * Architecture:
 * - Declarative via @vis.gl/react-maplibre
 * - Choropleth fill layer driven by activeUsers per region
 * - GeoJSON polygon data embedded inline (no external tile dependency)
 * - Region name normalization maps GA4 region names → Peru departamento names
 * - memo() wraps component to prevent cascade re-renders from parent
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibre,
  Source,
  Layer,
  Popup,
  NavigationControl,
} from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type {
  FillLayerSpecification,
  LineLayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { GA4Region } from "./types";

/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */

type Props = {
  regions: GA4Region[];
  primaryColor: string;
  highlightRegion?: string | null;
  clickedRegion?: string | null;
};

type HoverInfo = {
  lng: number;
  lat: number;
  region: GA4Region & { normalizedName: string };
};

/* ═══════════════════════════════════════════════════════════════════
   Region name normalization
   Maps GA4 region names → Peru departamento names (as in GeoJSON)
   ═══════════════════════════════════════════════════════════════════ */

const GA4_TO_PERU_REGION: Record<string, string> = {
  // Direct matches
  "Amazonas": "Amazonas",
  "Ancash": "Ancash",
  "Apurimac": "Apurimac",
  "Arequipa": "Arequipa",
  "Ayacucho": "Ayacucho",
  "Cajamarca": "Cajamarca",
  "Cusco": "Cusco",
  "Huancavelica": "Huancavelica",
  "Huanuco": "Huanuco",
  "Ica": "Ica",
  "Junin": "Junin",
  "Lambayeque": "Lambayeque",
  "Loreto": "Loreto",
  "Moquegua": "Moquegua",
  "Pasco": "Pasco",
  "Piura": "Piura",
  "Puno": "Puno",
  "Tacna": "Tacna",
  "Tumbes": "Tumbes",
  "Ucayali": "Ucayali",
  "San Martin": "San Martin",
  // GA4 variants
  "Lima Province": "Lima",
  "Lima Region": "Lima",
  "Callao Region": "Callao",
  "La Libertad": "La Libertad",
  "Madre de Dios": "Madre de Dios",
};

function normalizeRegionName(ga4Name: string): string | null {
  return GA4_TO_PERU_REGION[ga4Name] ?? null;
}

/* ═══════════════════════════════════════════════════════════════════
   Peru Departments GeoJSON
   Loaded at runtime from /geo/peru-departments.geojson (public/)
   ═══════════════════════════════════════════════════════════════════ */

// Simplified department centroids for flyTo
const REGION_CENTROIDS: Record<string, [number, number]> = {
  "Lima": [-76.5, -11.9],
  "Callao": [-77.13, -12.05],
  "Arequipa": [-72.5, -16.0],
  "La Libertad": [-78.5, -7.8],
  "Piura": [-80.2, -5.5],
  "Cajamarca": [-78.5, -7.0],
  "Cusco": [-71.5, -13.5],
  "Junin": [-75.0, -11.5],
  "Ancash": [-77.5, -9.5],
  "Lambayeque": [-79.8, -6.7],
  "Loreto": [-74.0, -4.5],
  "Ica": [-75.5, -14.0],
  "Puno": [-70.2, -15.5],
  "San Martin": [-76.5, -7.0],
  "Ucayali": [-74.0, -9.0],
  "Huanuco": [-76.5, -9.8],
  "Ayacucho": [-74.2, -13.2],
  "Tacna": [-70.2, -17.5],
  "Moquegua": [-70.9, -17.1],
  "Tumbes": [-80.5, -3.7],
  "Amazonas": [-78.0, -5.5],
  "Pasco": [-76.2, -10.5],
  "Apurimac": [-73.0, -14.0],
  "Huancavelica": [-74.8, -12.8],
  "Madre de Dios": [-70.5, -12.5],
};



/* ═══════════════════════════════════════════════════════════════════
   Map constants
   ═══════════════════════════════════════════════════════════════════ */

const DEFAULT_CENTER: [number, number] = [-75.5, -9.5];
const DEFAULT_ZOOM = 4.2;

const MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "Peru Regions",
  sources: {
    "carto-positron": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "&copy; CARTO &copy; OSM",
    },
  },
  layers: [
    {
      id: "carto-positron",
      type: "raster",
      source: "carto-positron",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */

export const RegionsMap = memo(function RegionsMap({
  regions,
  primaryColor,
  highlightRegion,
  clickedRegion,
}: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [baseGeoJSON, setBaseGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  // Load Peru departments GeoJSON from static public asset
  useEffect(() => {
    fetch("/geo/peru-departments.geojson")
      .then((r) => r.json())
      .then((data: GeoJSON.FeatureCollection) => setBaseGeoJSON(data))
      .catch(() => {
        // Silently fail — map will render without choropleth
      });
  }, []);

  // Build a lookup map: normalized region name → GA4Region data
  const regionDataMap = useMemo(() => {
    const map = new Map<string, GA4Region & { normalizedName: string }>();
    for (const r of regions) {
      const normalized = normalizeRegionName(r.region);
      if (normalized) {
        // If both "Lima Province" and "Lima Region" exist, sum them
        const existing = map.get(normalized);
        if (existing) {
          map.set(normalized, {
            ...r,
            region: r.region,
            normalizedName: normalized,
            activeUsers: existing.activeUsers + r.activeUsers,
            newUsers:
              existing.newUsers !== undefined && r.newUsers !== undefined
                ? existing.newUsers + r.newUsers
                : existing.newUsers ?? r.newUsers,
            events:
              existing.events !== undefined && r.events !== undefined
                ? existing.events + r.events
                : existing.events ?? r.events,
          });
        } else {
          map.set(normalized, { ...r, normalizedName: normalized });
        }
      }
    }
    return map;
  }, [regions]);

  const maxUsers = useMemo(() => {
    let max = 1;
    for (const r of regionDataMap.values()) {
      if (r.activeUsers > max) max = r.activeUsers;
    }
    return max;
  }, [regionDataMap]);

  const totalUsers = useMemo(() => {
    let total = 0;
    for (const r of regionDataMap.values()) total += r.activeUsers;
    return total;
  }, [regionDataMap]);

  // Enrich the GeoJSON features with user data
  const enrichedGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    if (!baseGeoJSON) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: baseGeoJSON.features.map((f) => {
        const name = f.properties?.name as string;
        const data = regionDataMap.get(name);
        return {
          ...f,
          properties: {
            ...f.properties,
            activeUsers: data?.activeUsers ?? 0,
            weight: data ? data.activeUsers / maxUsers : 0,
            hasData: data ? 1 : 0,
          },
        };
      }),
    };
  }, [baseGeoJSON, regionDataMap, maxUsers]);

  // Choropleth fill paint
  const fillPaint = useMemo(
    (): FillLayerSpecification["paint"] => ({
      "fill-color": [
        "case",
        ["==", ["get", "hasData"], 0],
        "#f1f5f9",
        [
          "interpolate",
          ["linear"],
          ["get", "weight"],
          0, "#dbeafe",
          0.05, "#bfdbfe",
          0.15, "#93c5fd",
          0.3, primaryColor,
          0.6, "#f97316",
          0.85, "#dc2626",
          1, "#991b1b",
        ],
      ],
      "fill-opacity": [
        "case",
        ["==", ["get", "hasData"], 0],
        0.25,
        0.82,
      ],
    }),
    [primaryColor],
  );

  const outlinePaint = useMemo(
    (): LineLayerSpecification["paint"] => ({
      "line-color": "#ffffff",
      "line-width": 1.5,
      "line-opacity": 0.9,
    }),
    [],
  );

  const highlightFillPaint = useMemo(
    (): FillLayerSpecification["paint"] => ({
      "fill-color": primaryColor,
      "fill-opacity": 0.2,
    }),
    [primaryColor],
  );

  // ── Hover handler ──
  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) {
        setHoverInfo(null);
        return;
      }
      const name = f.properties?.name as string;
      const data = regionDataMap.get(name);
      if (data) {
        setHoverInfo({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          region: data,
        });
      } else {
        setHoverInfo(null);
      }
    },
    [regionDataMap],
  );

  const handleMouseLeave = useCallback(() => setHoverInfo(null), []);
  const handleMouseEnter = useCallback(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "pointer";
  }, []);
  const handleCursorReset = useCallback(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
  }, []);

  // ── flyTo driven by parent props ──
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const target = clickedRegion ?? highlightRegion ?? null;
    if (!target) {
      m.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 400 });
      setHoverInfo(null);
      return;
    }

    const normalized = normalizeRegionName(target) ?? target;
    const centroid = REGION_CENTROIDS[normalized];
    if (!centroid) return;

    const zoom = clickedRegion ? 7 : 5.5;
    const duration = clickedRegion ? 800 : 500;
    m.flyTo({ center: centroid, zoom, duration, essential: !!clickedRegion });

    const data = regionDataMap.get(normalized);
    if (data) {
      setHoverInfo({
        lng: centroid[0],
        lat: centroid[1],
        region: data,
      });
    }
  }, [clickedRegion, highlightRegion, regionDataMap]);

  const handleReset = useCallback(() => {
    mapRef.current?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 500 });
    setHoverInfo(null);
  }, []);

  return (
    <div style={STYLES.container}>
      <MapLibre
        ref={mapRef}
        initialViewState={{
          longitude: DEFAULT_CENTER[0],
          latitude: DEFAULT_CENTER[1],
          zoom: DEFAULT_ZOOM,
        }}
        style={STYLES.map}
        mapStyle={MAP_STYLE}
        minZoom={3}
        maxZoom={12}
        dragRotate={false}
        touchPitch={false}
        attributionControl={false}
        interactiveLayerIds={["regions-fill"]}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => {
          handleCursorReset();
          handleMouseLeave();
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        <Source id="peru-regions" type="geojson" data={enrichedGeoJSON}>
          <Layer id="regions-fill" type="fill" paint={fillPaint} />
          <Layer id="regions-outline" type="line" paint={outlinePaint} />
          {hoverInfo && (
            <Layer
              id="regions-highlight"
              type="fill"
              paint={highlightFillPaint}
              filter={["==", ["get", "name"], hoverInfo.region.normalizedName]}
            />
          )}
        </Source>

        {hoverInfo && (
          <Popup
            longitude={hoverInfo.lng}
            latitude={hoverInfo.lat}
            anchor="bottom"
            offset={12}
            closeButton={false}
            closeOnClick={false}
          >
            <PopupContent
              region={hoverInfo.region}
              totalUsers={totalUsers}
              primaryColor={primaryColor}
            />
          </Popup>
        )}
      </MapLibre>

      {/* Legend */}
      <div style={STYLES.legend}>
        <div style={STYLES.legendGradient(primaryColor)} />
        <div style={STYLES.legendLabels}>
          <span style={STYLES.legendText}>Menos</span>
          <span style={STYLES.legendText}>Más</span>
        </div>
      </div>

      {/* Reset zoom */}
      <button
        type="button"
        onClick={handleReset}
        style={STYLES.resetBtn}
        title="Ver todo Peru"
        aria-label="Ver todo Peru"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════
   PopupContent
   ═══════════════════════════════════════════════════════════════════ */

function PopupContent({
  region,
  totalUsers,
  primaryColor,
}: {
  region: GA4Region & { normalizedName: string };
  totalUsers: number;
  primaryColor: string;
}) {
  const pct = totalUsers > 0 ? ((region.activeUsers / totalUsers) * 100).toFixed(1) : "0";
  const hasEnriched =
    region.avgEngagementTime !== undefined || region.newUsers !== undefined;

  return (
    <div
      style={{ padding: "4px 4px", fontFamily: "system-ui, sans-serif", minWidth: 148 }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
        {region.normalizedName}
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
        {region.region !== region.normalizedName ? `(${region.region})` : null}
      </div>
      <div
        style={{ fontSize: 20, fontWeight: 800, color: primaryColor, margin: "3px 0" }}
      >
        {region.activeUsers.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: "#64748b" }}>
        usuarios activos · {pct}%
      </div>

      {hasEnriched && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid #e2e8f0",
            fontSize: 11,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {region.newUsers !== undefined && (
            <Row
              label="Nuevos"
              value={`${region.newUsers.toLocaleString()}`}
            />
          )}
          {region.avgEngagementTime !== undefined &&
            region.avgEngagementTime > 0 && (
              <Row
                label="Tiempo prom."
                value={formatTime(region.avgEngagementTime)}
              />
            )}
          {region.engagementRate !== undefined &&
            region.engagementRate > 0 && (
              <Row
                label="Engagement"
                value={`${(region.engagementRate * 100).toFixed(1)}%`}
              />
            )}
          {region.events !== undefined && region.events > 0 && (
            <Row label="Eventos" value={region.events.toLocaleString()} />
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
    >
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ color: "#334155", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/* ═══════════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════════ */

const STYLES = {
  container: {
    position: "relative" as const,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    overflow: "hidden",
    height: "100%",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  legend: {
    position: "absolute" as const,
    bottom: 48,
    left: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(8px)",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    padding: "8px 12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    zIndex: 2,
    minWidth: 120,
  },
  legendGradient: (primaryColor: string): React.CSSProperties => ({
    height: 8,
    borderRadius: 4,
    background: `linear-gradient(to right, #dbeafe, ${primaryColor}, #dc2626)`,
    marginBottom: 4,
  }),
  legendLabels: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
  },
  legendText: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: 500,
  } as React.CSSProperties,
  resetBtn: {
    position: "absolute" as const,
    bottom: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(8px)",
    border: "1px solid #e2e8f0",
    color: "#64748b",
    cursor: "pointer",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    zIndex: 2,
  },
} as const;
