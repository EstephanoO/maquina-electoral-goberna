"use client";

/**
 * RegionsMap — GA4 audience visualization by Peru region (departamento).
 *
 * Architecture:
 * - Declarative via @vis.gl/react-maplibre
 * - Bubble markers at department centroids, sized by activeUsers
 * - No GeoJSON polygons — centroids hardcoded, zero async loading
 * - Region name normalization maps GA4 region names → Peru departamento names
 * - memo() wraps component to prevent cascade re-renders from parent
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibre,
  Marker,
  Popup,
  NavigationControl,
} from "@vis.gl/react-maplibre";
import type { MapRef, StyleSpecification } from "@vis.gl/react-maplibre";
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

type ActiveMarker = {
  normalizedName: string;
  lng: number;
  lat: number;
  region: GA4Region & { normalizedName: string };
};

/* ═══════════════════════════════════════════════════════════════════
   Region name normalization
   Maps GA4 region names → Peru departamento names
   ═══════════════════════════════════════════════════════════════════ */

const GA4_TO_PERU_REGION: Record<string, string> = {
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
   Department centroids [lon, lat]
   ═══════════════════════════════════════════════════════════════════ */

const REGION_CENTROIDS: Record<string, [number, number]> = {
  "Lima":          [-76.50, -11.90],
  "Callao":        [-77.13, -12.05],
  "Arequipa":      [-72.50, -16.00],
  "La Libertad":   [-78.50,  -7.80],
  "Piura":         [-80.20,  -5.50],
  "Cajamarca":     [-78.50,  -7.00],
  "Cusco":         [-71.50, -13.50],
  "Junin":         [-75.00, -11.50],
  "Ancash":        [-77.50,  -9.50],
  "Lambayeque":    [-79.80,  -6.70],
  "Loreto":        [-74.00,  -4.50],
  "Ica":           [-75.50, -14.00],
  "Puno":          [-70.20, -15.50],
  "San Martin":    [-76.50,  -7.00],
  "Ucayali":       [-74.00,  -9.00],
  "Huanuco":       [-76.50,  -9.80],
  "Ayacucho":      [-74.20, -13.20],
  "Tacna":         [-70.20, -17.50],
  "Moquegua":      [-70.90, -17.10],
  "Tumbes":        [-80.50,  -3.70],
  "Amazonas":      [-78.00,  -5.50],
  "Pasco":         [-76.20, -10.50],
  "Apurimac":      [-73.00, -14.00],
  "Huancavelica":  [-74.80, -12.80],
  "Madre de Dios": [-70.50, -12.50],
};

/* ═══════════════════════════════════════════════════════════════════
   Bubble sizing
   Min 10px diameter, max 56px. Scaled by sqrt to avoid huge dominance.
   ═══════════════════════════════════════════════════════════════════ */

const MIN_R = 5;
const MAX_R = 28;

function bubbleRadius(activeUsers: number, maxUsers: number): number {
  if (maxUsers <= 0) return MIN_R;
  const t = Math.sqrt(activeUsers / maxUsers);
  return MIN_R + t * (MAX_R - MIN_R);
}

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
  const [activeMarker, setActiveMarker] = useState<ActiveMarker | null>(null);

  // Build lookup: normalized name → aggregated GA4Region
  const regionDataMap = useMemo(() => {
    const map = new Map<string, GA4Region & { normalizedName: string }>();
    for (const r of regions) {
      const normalized = normalizeRegionName(r.region);
      if (!normalized) continue;
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

  // ── flyTo driven by parent props ──
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const target = clickedRegion ?? highlightRegion ?? null;
    if (!target) {
      m.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 400 });
      setActiveMarker(null);
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
      setActiveMarker({
        normalizedName: normalized,
        lng: centroid[0],
        lat: centroid[1],
        region: data,
      });
    }
  }, [clickedRegion, highlightRegion, regionDataMap]);

  const handleReset = useCallback(() => {
    mapRef.current?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 500 });
    setActiveMarker(null);
  }, []);

  // Markers for all regions that have data
  const markers = useMemo(() => {
    return Array.from(regionDataMap.entries())
      .map(([name, data]) => {
        const centroid = REGION_CENTROIDS[name];
        if (!centroid) return null;
        const r = bubbleRadius(data.activeUsers, maxUsers);
        const isHighlighted =
          name === (clickedRegion ? normalizeRegionName(clickedRegion) ?? clickedRegion : null) ||
          name === (highlightRegion ? normalizeRegionName(highlightRegion) ?? highlightRegion : null);
        return { name, data, centroid, r, isHighlighted };
      })
      .filter(Boolean) as {
        name: string;
        data: GA4Region & { normalizedName: string };
        centroid: [number, number];
        r: number;
        isHighlighted: boolean;
      }[];
  }, [regionDataMap, maxUsers, clickedRegion, highlightRegion]);

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
        onClick={() => setActiveMarker(null)}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {markers.map(({ name, data, centroid, r, isHighlighted }) => (
          <Marker
            key={name}
            longitude={centroid[0]}
            latitude={centroid[1]}
            anchor="center"
          >
            <BubbleMarker
              r={r}
              isHighlighted={isHighlighted}
              primaryColor={primaryColor}
              onClick={() =>
                setActiveMarker((prev) =>
                  prev?.normalizedName === name
                    ? null
                    : { normalizedName: name, lng: centroid[0], lat: centroid[1], region: data },
                )
              }
              onMouseEnter={() =>
                setActiveMarker({
                  normalizedName: name,
                  lng: centroid[0],
                  lat: centroid[1],
                  region: data,
                })
              }
              onMouseLeave={() =>
                setActiveMarker((prev) =>
                  prev?.normalizedName === name ? null : prev,
                )
              }
            />
          </Marker>
        ))}

        {activeMarker && (
          <Popup
            longitude={activeMarker.lng}
            latitude={activeMarker.lat}
            anchor="bottom"
            offset={activeMarker.region ? bubbleRadius(activeMarker.region.activeUsers, maxUsers) + 6 : 12}
            closeButton={false}
            closeOnClick={false}
          >
            <PopupContent
              region={activeMarker.region}
              totalUsers={totalUsers}
              primaryColor={primaryColor}
            />
          </Popup>
        )}
      </MapLibre>

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
   BubbleMarker
   ═══════════════════════════════════════════════════════════════════ */

function BubbleMarker({
  r,
  isHighlighted,
  primaryColor,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  r: number;
  isHighlighted: boolean;
  primaryColor: string;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const diameter = r * 2;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width: diameter,
        height: diameter,
        borderRadius: "50%",
        backgroundColor: isHighlighted ? "#dc2626" : primaryColor,
        opacity: isHighlighted ? 1 : 0.75,
        border: `2px solid ${isHighlighted ? "#991b1b" : "rgba(255,255,255,0.8)"}`,
        cursor: "pointer",
        transition: "opacity 0.15s, transform 0.15s",
        boxShadow: isHighlighted
          ? "0 0 0 4px rgba(220,38,38,0.25)"
          : "0 1px 4px rgba(0,0,0,0.18)",
        transform: isHighlighted ? "scale(1.15)" : "scale(1)",
        padding: 0,
      }}
      aria-label="Ver región"
    />
  );
}

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
    <div style={{ padding: "4px 4px", fontFamily: "system-ui, sans-serif", minWidth: 148 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
        {region.normalizedName}
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
        {region.region !== region.normalizedName ? `(${region.region})` : null}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: primaryColor, margin: "3px 0" }}>
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
            <Row label="Nuevos" value={region.newUsers.toLocaleString()} />
          )}
          {region.avgEngagementTime !== undefined && region.avgEngagementTime > 0 && (
            <Row label="Tiempo prom." value={formatTime(region.avgEngagementTime)} />
          )}
          {region.engagementRate !== undefined && region.engagementRate > 0 && (
            <Row label="Engagement" value={`${(region.engagementRate * 100).toFixed(1)}%`} />
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
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
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
