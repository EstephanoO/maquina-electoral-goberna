"use client";

import { useMemo, useRef } from "react";
import { Map as MapLibre, Source, Layer, Marker } from "@vis.gl/react-maplibre";
import type { MapRef } from "@vis.gl/react-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

type Scan = {
  lat: number | null;
  lon: number | null;
  city: string | null;
  region: string | null;
  scanned_at: string;
};

type Props = {
  scans: Scan[];
  isDark: boolean;
};

export default function QrMap({ scans, isDark }: Props) {
  const mapRef = useRef<MapRef>(null);

  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: scans
      .filter((s) => s.lat != null && s.lon != null)
      .map((s) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [s.lon!, s.lat!],
        },
        properties: {
          city: s.city ?? "",
          region: s.region ?? "",
          time: s.scanned_at,
        },
      })),
  }), [scans]);

  // Center on Peru by default, or on first scan point
  const initialCenter = useMemo(() => {
    const first = scans.find((s) => s.lat != null && s.lon != null);
    if (first) return { lng: first.lon!, lat: first.lat! };
    return { lng: -77.03, lat: -12.04 }; // Lima
  }, [scans]);

  return (
    <MapLibre
      ref={mapRef}
      initialViewState={{
        longitude: initialCenter.lng,
        latitude: initialCenter.lat,
        zoom: scans.length > 0 ? 6 : 5,
      }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={isDark ? DARK_STYLE : LIGHT_STYLE}
      attributionControl={false}
    >
      <Source id="qr-scans" type="geojson" data={geojson} cluster clusterMaxZoom={14} clusterRadius={40}>
        {/* Cluster circles */}
        <Layer
          id="qr-clusters"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": "#25D366",
            "circle-radius": ["step", ["get", "point_count"], 18, 5, 24, 20, 32],
            "circle-opacity": 0.85,
            "circle-stroke-width": 2,
            "circle-stroke-color": isDark ? "#0f172a" : "#ffffff",
          }}
        />
        {/* Cluster count text */}
        <Layer
          id="qr-cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": "{point_count_abbreviated}",
            "text-size": 13,
          }}
          paint={{
            "text-color": "#ffffff",
          }}
        />
        {/* Individual points */}
        <Layer
          id="qr-points"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": "#25D366",
            "circle-radius": 7,
            "circle-opacity": 0.9,
            "circle-stroke-width": 2,
            "circle-stroke-color": isDark ? "#0f172a" : "#ffffff",
          }}
        />
      </Source>

      {/* Pulse on the latest scan */}
      {scans.length > 0 && scans[0].lat != null && scans[0].lon != null && (
        <Marker longitude={scans[0].lon!} latitude={scans[0].lat!} anchor="center">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-6 h-6 rounded-full bg-emerald-400 opacity-40 animate-ping" />
            <div className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-white shadow-lg" />
          </div>
        </Marker>
      )}
    </MapLibre>
  );
}
