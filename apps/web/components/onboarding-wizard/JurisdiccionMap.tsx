"use client";

import { useMemo, useEffect, useRef } from "react";
import { Map as MapLibre, Source, Layer, type MapRef } from "@vis.gl/react-maplibre";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

/** Calcula bbox [minLng, minLat, maxLng, maxLat] de un FeatureCollection sin libs externas. */
function calcBounds(fc: FeatureCollection): [number, number, number, number] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let any = false;
  const visit = (coords: unknown): void => {
    if (!coords) return;
    if (typeof (coords as Position)[0] === "number" && typeof (coords as Position)[1] === "number") {
      const [lng, lat] = coords as Position;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
        any = true;
      }
      return;
    }
    if (Array.isArray(coords)) {
      for (const c of coords) visit(c);
    }
  };
  for (const f of fc.features) {
    if (!f.geometry) continue;
    if ("coordinates" in f.geometry) visit((f.geometry as { coordinates: unknown }).coordinates);
  }
  if (!any) return null;
  return [minLng, minLat, maxLng, maxLat];
}

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface MapItem {
  id: number;
  nombre: string;
  geom?: Geometry;
}

interface JurisdiccionMapProps {
  items: MapItem[];
  selectedId?: number | null;
  hoverId?: number | null;
  onClick: (id: number) => void;
}

/**
 * Mini-mapa MapLibre para la cascada de jurisdicción del wizard.
 * Estilo dark + accents amber (consistente con el resto del onboarding).
 * Click en polígono = selecciona el item.
 */
export function JurisdiccionMap({
  items,
  selectedId = null,
  hoverId = null,
  onClick,
}: JurisdiccionMapProps) {
  const mapRef = useRef<MapRef | null>(null);

  const geojson: FeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: items
        .filter((it) => it.geom)
        .map((it) => ({
          type: "Feature" as const,
          properties: { id: it.id, nombre: it.nombre },
          geometry: it.geom as Geometry,
        })) as Feature[],
    };
  }, [items]);

  // Auto-fit bounds cuando cambian los items
  const bounds = useMemo(() => calcBounds(geojson), [geojson]);

  useEffect(() => {
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding: 24, duration: 500, maxZoom: 11 });
    }
  }, [bounds]);

  // Default a Perú si no hay bounds
  const initialView = useMemo(
    () => ({
      longitude: -75.0,
      latitude: -10.0,
      zoom: 4.5,
    }),
    [],
  );

  return (
    <div className="relative w-full h-[260px] sm:h-[320px] lg:h-[420px] rounded-2xl overflow-hidden border-2 border-gray-700/50 bg-black/40">
      <MapLibre
        ref={mapRef}
        initialViewState={initialView}
        mapStyle={DARK_STYLE}
        interactiveLayerIds={["jurisdiccion-fill"]}
        onClick={(e) => {
          const feature = e.features?.[0];
          if (feature?.properties?.id) {
            onClick(Number(feature.properties.id));
          }
        }}
        onMouseMove={(e) => {
          const map = e.target;
          if (!map) return;
          const f = e.features?.[0];
          map.getCanvas().style.cursor = f ? "pointer" : "";
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <Source id="jurisdiccion-src" type="geojson" data={geojson}>
          {/* Fill base */}
          <Layer
            id="jurisdiccion-fill"
            type="fill"
            paint={{
              "fill-color": [
                "case",
                ["==", ["get", "id"], selectedId ?? -1],
                "#f59e0b", // amber-500 selected
                ["==", ["get", "id"], hoverId ?? -1],
                "#fbbf24", // amber-400 hover
                "#1f2937", // gray-800 default
              ],
              "fill-opacity": [
                "case",
                ["==", ["get", "id"], selectedId ?? -1],
                0.6,
                ["==", ["get", "id"], hoverId ?? -1],
                0.45,
                0.25,
              ],
            }}
          />
          {/* Border */}
          <Layer
            id="jurisdiccion-line"
            type="line"
            paint={{
              "line-color": [
                "case",
                ["==", ["get", "id"], selectedId ?? -1],
                "#fbbf24", // amber-400
                "#4b5563", // gray-600
              ],
              "line-width": [
                "case",
                ["==", ["get", "id"], selectedId ?? -1],
                2.5,
                1,
              ],
            }}
          />
        </Source>
      </MapLibre>

      {/* Overlay legend en esquina */}
      <div className="absolute bottom-2 left-2 rounded-md bg-black/70 backdrop-blur-sm px-2.5 py-1 text-[10px] uppercase tracking-wider text-amber-400/80 border border-amber-500/20 pointer-events-none">
        Click en el mapa para seleccionar
      </div>
    </div>
  );
}
