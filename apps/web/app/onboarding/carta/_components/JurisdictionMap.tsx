"use client";

/**
 * Mapa de la jurisdicción del candidato — maplibre con polígono GeoJSON.
 * Zoom-in animado al territorio cuando llega la data. Sin controles
 * (no zoom/pan manual; es decoración cinematográfica).
 */
import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  geojson: GeoJSON.Geometry | null;
  bbox: [number, number, number, number] | null;
  centroid: [number, number] | null;
  className?: string;
};

// Basemap CartoDB Voyager (muted blue-ish) — más visible contra fondo navy
// que dark_nolabels, mantiene el lenguaje cinematográfico.
const STYLE = {
  version: 8 as const,
  sources: {
    "carto-basemap": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "carto-tiles",
      type: "raster" as const,
      source: "carto-basemap",
      paint: {
        // Tinte navy + leve desaturación para integrar con el tema
        "raster-saturation": -0.3,
        "raster-contrast": 0.05,
      },
    },
  ],
};

export function JurisdictionMap({ geojson, bbox, centroid, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const mapStyle = useMemo(() => STYLE, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle as maplibregl.StyleSpecification,
      center: centroid ?? [-75, -10], // Perú default
      zoom: centroid ? 4.2 : 3.6,
      maxZoom: 9,
      attributionControl: false,
      interactive: false,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
      doubleClickZoom: false,
    });
    map.on("load", () => {
      if (geojson) {
        map.addSource("jurisdiccion", {
          type: "geojson",
          data: { type: "Feature", geometry: geojson, properties: {} },
        });
        map.addLayer({
          id: "jurisdiccion-fill",
          type: "fill",
          source: "jurisdiccion",
          paint: {
            "fill-color": "#fbbf24",
            "fill-opacity": 0.10, // baja opacidad → tiles legibles bajo el polígono
          },
        });
        map.addLayer({
          id: "jurisdiccion-glow",
          type: "line",
          source: "jurisdiccion",
          paint: {
            "line-color": "#fbbf24",
            "line-width": 10,
            "line-blur": 14,
            "line-opacity": 0.7,
          },
        });
        map.addLayer({
          id: "jurisdiccion-outline",
          type: "line",
          source: "jurisdiccion",
          paint: {
            "line-color": "#fbbf24",
            "line-width": 2.5,
            "line-opacity": 1,
          },
        });
      }
      if (bbox) {
        // Zoom in animado al territorio
        setTimeout(() => {
          map.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            {
              padding: 80,
              duration: 2400,
              essential: true,
            },
          );
        }, 300);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si la jurisdicción cambia (admin selecciona otro candidato), update.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("jurisdiccion") as maplibregl.GeoJSONSource | undefined;
    if (geojson && src) {
      src.setData({ type: "Feature", geometry: geojson, properties: {} });
    }
    if (bbox) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 80, duration: 1600, essential: true },
      );
    }
  }, [geojson, bbox]);

  return <div ref={containerRef} className={className} />;
}
