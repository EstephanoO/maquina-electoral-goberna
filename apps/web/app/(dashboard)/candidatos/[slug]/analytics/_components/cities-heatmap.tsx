"use client";

/**
 * CitiesHeatmap — GA4 city audience visualization on a map.
 *
 * Architecture:
 * - Declarative via @vis.gl/react-maplibre (Source/Layer JSX, <Popup> for hover)
 * - All paint/layout objects hoisted to module-level constants or useMemo'd
 * - GeoJSON data memoized to avoid Source rebuilds on parent re-renders
 * - Popup is a React component (not imperative maplibregl.Popup)
 * - flyTo driven by useEffect reacting to highlightCity/clickedCity props
 * - memo() wraps component to prevent cascade re-renders from parent
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibre, Source, Layer, Popup, NavigationControl } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type {
  HeatmapLayerSpecification,
  CircleLayerSpecification,
  SymbolLayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { GA4City } from "./types";

/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */

type Props = {
  cities: GA4City[];
  primaryColor: string;
  /** City name to fly-to and highlight (driven by parent hover) */
  highlightCity?: string | null;
  /** City name for deep zoom on click */
  clickedCity?: string | null;
};

type GeocodedCity = {
  city: string;
  lng: number;
  lat: number;
  activeUsers: number;
  newUsers?: number;
  avgEngagementTime?: number;
  engagementRate?: number;
  events?: number;
};

type HoverInfo = {
  lng: number;
  lat: number;
  city: GeocodedCity;
};

/* ═══════════════════════════════════════════════════════════════════
   Peru city geocoding (static lookup)
   ═══════════════════════════════════════════════════════════════════ */

const PERU_CITIES: Record<string, [number, number]> = {
  Lima: [-77.0428, -12.0464],
  Trujillo: [-79.03, -8.1091],
  Cajamarca: [-78.5142, -7.1638],
  Chiclayo: [-79.8408, -6.7714],
  Cusco: [-71.9675, -13.532],
  Arequipa: [-71.5375, -16.409],
  Piura: [-80.6328, -5.1945],
  "La Esperanza": [-79.0444, -8.08],
  "El Porvenir": [-79.0147, -8.0892],
  Chimbote: [-78.5781, -9.0853],
  Iquitos: [-73.2472, -3.7491],
  Ica: [-75.7286, -14.0676],
  "Cerro Colorado": [-71.5617, -16.3835],
  "Victor Larco Herrera": [-79.0444, -8.13],
  Jaen: [-78.8089, -5.7069],
  Huaraz: [-77.5278, -9.5265],
  Tacna: [-70.2476, -18.0066],
  Lambayeque: [-79.9068, -6.7011],
  Tarapoto: [-76.3703, -6.4884],
  "Jose Luis Bustamante": [-71.53, -16.43],
  Paucarpata: [-71.5, -16.43],
  Pucallpa: [-74.5505, -8.3791],
  Sullana: [-80.6853, -4.9036],
  Huancayo: [-75.2049, -12.0651],
  Ilo: [-71.3375, -17.6394],
  Pisco: [-76.2031, -13.71],
  Ayacucho: [-74.2236, -13.1587],
  Cayma: [-71.5528, -16.39],
  Chepen: [-79.43, -7.2256],
  Miraflores: [-77.0289, -12.1219],
  "Parcona District": [-75.71, -14.04],
  "Puerto Maldonado": [-69.1833, -12.6],
  Talara: [-81.2714, -4.5769],
  Barranca: [-77.7531, -10.7544],
  Huacho: [-77.605, -11.1067],
  "Jose Leonardo Ortiz": [-79.84, -6.76],
  Juliaca: [-70.13, -15.5],
  "La Victoria": [-77.0286, -12.07],
  Lurin: [-76.8697, -12.2789],
  "Mariano Melgar": [-71.52, -16.42],
  Puno: [-70.0194, -15.8402],
  "Alto Selva Alegre": [-71.52, -16.39],
  "Cerro de Pasco": [-76.2564, -10.6875],
  Huaral: [-77.2072, -11.4953],
  Huaura: [-77.5989, -11.0667],
  "Jacobo Hunter": [-71.56, -16.44],
  Mollendo: [-72.0175, -17.0217],
  Moquegua: [-70.935, -17.1932],
  Paita: [-81.1139, -5.0892],
  Sachaca: [-71.57, -16.42],
  Salaverry: [-79.01, -8.22],
  "San Ignacio": [-78.9978, -5.1461],
  "San Martin de Pangoa": [-74.49, -11.43],
  "San Pedro de Lloc": [-79.5044, -7.43],
  Socabaya: [-71.5353, -16.4661],
  Yanahuara: [-71.54, -16.39],
};

const INTERNATIONAL_CITIES = new Set([
  "Fort Worth", "Aspen", "Council Bluffs", "Lulea", "Collegno", "Duluth",
  "Frankfurt am Main", "Gwalior", "Miami", "Paris", "Prineville", "Springfield",
  "Turin", "L'Hospitalet de Llobregat", "Siberut Tengah", "Srumbung",
  "North Carolina's 3rd Congressional District 2022 redistricting",
]);

function geocodeCities(cities: GA4City[]): GeocodedCity[] {
  const result: GeocodedCity[] = [];
  for (const c of cities) {
    if (INTERNATIONAL_CITIES.has(c.city)) continue;
    if (/^\d+$/.test(c.city)) continue;
    const coords = PERU_CITIES[c.city];
    if (coords) {
      result.push({
        city: c.city,
        lng: coords[0],
        lat: coords[1],
        activeUsers: c.activeUsers,
        newUsers: c.newUsers,
        avgEngagementTime: c.avgEngagementTime,
        engagementRate: c.engagementRate,
        events: c.events,
      });
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════════════
   Map constants
   ═══════════════════════════════════════════════════════════════════ */

const DEFAULT_CENTER: [number, number] = [-75.5, -9.5];
const DEFAULT_ZOOM = 4.3;

const MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "Peru Digital",
  sources: {
    "carto-voyager": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "&copy; CARTO &copy; OSM",
    },
  },
  layers: [
    { id: "carto-voyager", type: "raster", source: "carto-voyager", minzoom: 0, maxzoom: 20 },
  ],
};

const INTERACTIVE_LAYERS = ["cities-circles"] as const;

/* ═══════════════════════════════════════════════════════════════════
   Static layer paint/layout (P2 — hoisted, zero per-render alloc)
   ═══════════════════════════════════════════════════════════════════ */

// ── Heatmap intensity & radius (zoom-driven, data-independent) ──
const HEATMAP_INTENSITY: HeatmapLayerSpecification["paint"] = {
  "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 5, 1.5, 8, 3],
  "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 20, 5, 40, 7, 60, 10, 80],
  "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.85, 8, 0.7, 11, 0.4],
};

// ── Labels ──
const LABELS_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": ["concat", ["get", "city"], "\n", ["to-string", ["get", "activeUsers"]]],
  "text-size": ["interpolate", ["linear"], ["zoom"], 6.5, 10, 9, 13],
  "text-offset": [0, 1.6],
  "text-anchor": "top",
  "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
  "text-allow-overlap": false,
  "text-optional": true,
};

const LABELS_PAINT: SymbolLayerSpecification["paint"] = {
  "text-color": "var(--color-text-primary)",
  "text-halo-color": "var(--color-surface)",
  "text-halo-width": 1.8,
};

/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */

export const CitiesHeatmap = memo(function CitiesHeatmap({
  cities,
  primaryColor,
  highlightCity,
  clickedCity,
}: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  // ── Geocode & aggregate ──
  const geocoded = useMemo(() => geocodeCities(cities), [cities]);
  const totalUsers = useMemo(() => geocoded.reduce((s, c) => s + c.activeUsers, 0), [geocoded]);
  const maxUsers = useMemo(() => Math.max(...geocoded.map((c) => c.activeUsers), 1), [geocoded]);

  // ── GeoJSON data (memoized — new ref = Source rebuild) ──
  const geojsonData = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: geocoded.map((c) => ({
        type: "Feature" as const,
        properties: {
          city: c.city,
          activeUsers: c.activeUsers,
          weight: c.activeUsers / maxUsers,
        },
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
      })),
    }),
    [geocoded, maxUsers],
  );

  // ── Dynamic paint objects (depend on data-derived maxUsers and primaryColor) ──
  const heatmapPaint = useMemo(
    (): HeatmapLayerSpecification["paint"] => ({
      ...HEATMAP_INTENSITY,
      "heatmap-weight": [
        "interpolate", ["linear"], ["get", "activeUsers"],
        0, 0, 10, 0.3, 100, 0.6, 500, 0.85, maxUsers, 1,
      ],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(0,0,0,0)",
        0.05, "rgba(65,105,225,0.15)",
        0.15, "rgba(59,130,246,0.45)",
        0.3, "rgba(99,102,241,0.65)",
        0.45, `${primaryColor}bb`,
        0.6, "rgba(234,88,12,0.8)",
        0.75, "rgba(220,38,38,0.88)",
        0.9, "rgba(185,28,28,0.95)",
        1, "rgba(153,27,27,1)",
      ],
    }),
    [maxUsers, primaryColor],
  );

  const circlesPaint = useMemo(
    (): CircleLayerSpecification["paint"] => ({
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        4, ["interpolate", ["linear"], ["get", "activeUsers"], 1, 3, 50, 5, 500, 9, maxUsers, 14],
        7, ["interpolate", ["linear"], ["get", "activeUsers"], 1, 5, 50, 10, 500, 20, maxUsers, 32],
        10, ["interpolate", ["linear"], ["get", "activeUsers"], 1, 7, 50, 14, 500, 28, maxUsers, 44],
      ],
      "circle-color": [
        "interpolate", ["linear"], ["get", "activeUsers"],
        0, "#60a5fa", 50, primaryColor, 300, "#f97316", 800, "#dc2626",
      ],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 7, 0.75, 10, 0.85],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 7, 2],
      "circle-stroke-color": "var(--color-surface)",
      "circle-stroke-opacity": 0.9,
    }),
    [maxUsers, primaryColor],
  );

  // ── Hover handler (stable via useCallback) ──
  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") {
        setHoverInfo(null);
        return;
      }
      const coords = f.geometry.coordinates as [number, number];
      const cityName = f.properties?.city as string;
      const cityData = geocoded.find((c) => c.city === cityName);
      if (cityData) {
        setHoverInfo({ lng: coords[0], lat: coords[1], city: cityData });
      }
    },
    [geocoded],
  );

  const handleMouseLeave = useCallback(() => setHoverInfo(null), []);

  // ── Cursor management ──
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

    // clickedCity takes priority (deep zoom)
    const target = clickedCity ?? highlightCity ?? null;
    if (!target) {
      m.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 400 });
      setHoverInfo(null);
      return;
    }

    const c = geocoded.find((g) => g.city === target);
    if (!c) return;

    const zoom = clickedCity ? 11 : 7;
    const duration = clickedCity ? 800 : 500;
    m.flyTo({ center: [c.lng, c.lat], zoom, duration, essential: !!clickedCity });

    // Show popup for the targeted city
    setHoverInfo({ lng: c.lng, lat: c.lat, city: c });
  }, [clickedCity, highlightCity, geocoded]);

  // ── Reset handler ──
  const handleReset = useCallback(() => {
    mapRef.current?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 500 });
    setHoverInfo(null);
  }, []);

  return (
    <div style={STYLES.container}>
      <MapLibre
        ref={mapRef}
        initialViewState={{ longitude: DEFAULT_CENTER[0], latitude: DEFAULT_CENTER[1], zoom: DEFAULT_ZOOM }}
        style={STYLES.map}
        mapStyle={MAP_STYLE}
        minZoom={3}
        maxZoom={14}
        dragRotate={false}
        touchPitch={false}
        attributionControl={false}
        interactiveLayerIds={INTERACTIVE_LAYERS as unknown as string[]}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => { handleCursorReset(); handleMouseLeave(); }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        <Source id="cities" type="geojson" data={geojsonData}>
          <Layer id="cities-heat" type="heatmap" maxzoom={11} paint={heatmapPaint} />
          <Layer id="cities-circles" type="circle" minzoom={4} paint={circlesPaint} />
          <Layer id="cities-labels" type="symbol" minzoom={6.5} layout={LABELS_LAYOUT} paint={LABELS_PAINT} />
        </Source>

        {/* React Popup — declarative, no raw HTML injection */}
        {hoverInfo && (
          <Popup
            longitude={hoverInfo.lng}
            latitude={hoverInfo.lat}
            anchor="bottom"
            offset={14}
            closeButton={false}
            closeOnClick={false}
          >
            <PopupContent city={hoverInfo.city} totalUsers={totalUsers} primaryColor={primaryColor} />
          </Popup>
        )}
      </MapLibre>

      {/* Reset zoom button */}
      <button
        type="button"
        onClick={handleReset}
        style={STYLES.resetBtn}
        title="Ver todo Peru"
        aria-label="Ver todo Peru"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════
   PopupContent — React component (replaces raw HTML string)
   ═══════════════════════════════════════════════════════════════════ */

function PopupContent({
  city,
  totalUsers,
  primaryColor,
}: {
  city: GeocodedCity;
  totalUsers: number;
  primaryColor: string;
}) {
  const pct = totalUsers > 0 ? ((city.activeUsers / totalUsers) * 100).toFixed(1) : "0";

  const hasEnriched = city.avgEngagementTime !== undefined || city.newUsers !== undefined;

  return (
    <div style={{ padding: "4px 4px", fontFamily: "system-ui, sans-serif", minWidth: 140 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--color-text-primary)" }}>{city.city}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: primaryColor, margin: "3px 0" }}>
        {city.activeUsers.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>usuarios activos · {pct}%</div>

      {hasEnriched && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border)", fontSize: 11, display: "flex", flexDirection: "column", gap: 3 }}>
          {city.newUsers !== undefined && (
            <Row label="Nuevos" value={`${city.newUsers.toLocaleString()} (${city.activeUsers > 0 ? ((city.newUsers / city.activeUsers) * 100).toFixed(0) : 0}%)`} />
          )}
          {city.avgEngagementTime !== undefined && city.avgEngagementTime > 0 && (
            <Row label="Tiempo prom." value={formatTime(city.avgEngagementTime)} />
          )}
          {city.engagementRate !== undefined && city.engagementRate > 0 && (
            <Row label="Engagement" value={`${(city.engagementRate * 100).toFixed(2)}%`} />
          )}
          {city.events !== undefined && city.events > 0 && (
            <Row label="Eventos" value={city.events.toLocaleString()} />
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: "var(--color-text-tertiary)" }}>{label}</span>
      <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>{value}</span>
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
    backgroundColor: "var(--color-surface)",
    borderRadius: 16,
    border: "1px solid var(--color-border)",
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
    border: "1px solid var(--color-border)",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    zIndex: 2,
  },
} as const;
