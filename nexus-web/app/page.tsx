"use client";

import { useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, MapLayerMouseEvent, MapRef, Source } from "@vis.gl/react-maplibre";
import type { FilterSpecification, StyleSpecification } from "maplibre-gl";

const PERU_CENTER = { lng: -75.0152, lat: -9.1899, zoom: 5 };

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#eef3f8" },
    },
  ],
};

function getBoundsFromFeatureGeometry(geometry: unknown): [[number, number], [number, number]] | null {
  if (!geometry || typeof geometry !== "object") return null;

  const coords = (geometry as { coordinates?: unknown }).coordinates;
  if (!coords) return null;

  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
        const lon = value[0];
        const lat = value[1];
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
        return;
      }

      for (const item of value) visit(item);
    }
  };

  visit(coords);

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
    return null;
  }

  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

export default function Home() {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedDep, setSelectedDep] = useState<string | null>(null);
  const [selectedProvFull, setSelectedProvFull] = useState<string | null>(null);
  const [selectedDist, setSelectedDist] = useState<string | null>(null);
  const [selectedDepBounds, setSelectedDepBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [selectedProvBounds, setSelectedProvBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [hoverDep, setHoverDep] = useState<string | null>(null);
  const [hoverProvFull, setHoverProvFull] = useState<string | null>(null);
  const [hoverDist, setHoverDist] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_MAP_API_BASE ?? "http://localhost:3002";
  const tiles = `${apiBase}/api/tiles/{z}/{x}/{y}.vector.pbf`;

  const departamentosFilter = useMemo(
    () =>
      (selectedDep ? ["==", ["get", "coddep"], selectedDep] : ["has", "coddep"]) as FilterSpecification,
    [selectedDep],
  );

  const provinciasFilter = useMemo(
    () => {
      if (!selectedDep) return ["==", ["get", "coddep"], "__none__"] as FilterSpecification;
      if (selectedProvFull) return ["==", ["get", "codprov_full"], selectedProvFull] as FilterSpecification;
      return ["==", ["get", "coddep"], selectedDep] as FilterSpecification;
    },
    [selectedDep, selectedProvFull],
  );

  const distritosFilter = useMemo(
    () => {
      if (!selectedProvFull) return ["==", ["get", "ubigeo"], "__none__"] as FilterSpecification;
      if (selectedDist) return ["==", ["get", "ubigeo"], selectedDist] as FilterSpecification;
      return ["==", ["get", "codprov_full"], selectedProvFull] as FilterSpecification;
    },
    [selectedProvFull, selectedDist],
  );

  const handleMapClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];

    if (feature && feature.layer.id === "departamentos-hit") {
      const dep = String((feature.properties as Record<string, unknown> | undefined)?.coddep ?? "");
      if (!dep) return;

      const bounds = getBoundsFromFeatureGeometry(feature.geometry);
      setSelectedDep(dep);
      setSelectedProvFull(null);
      setSelectedDist(null);
      setSelectedDepBounds(bounds);
      setSelectedProvBounds(null);

      const map = mapRef.current?.getMap();
      if (!map) return;

      if (bounds) {
        map.fitBounds(bounds, { padding: 48, duration: 700, maxZoom: 8 });
      }

      return;
    }

    if (feature && feature.layer.id === "provincias-hit") {
      const provFull = String((feature.properties as Record<string, unknown> | undefined)?.codprov_full ?? "");
      if (!provFull) return;

      const bounds = getBoundsFromFeatureGeometry(feature.geometry);
      setSelectedProvFull(provFull);
      setSelectedDist(null);
      setSelectedProvBounds(bounds);

      const map = mapRef.current?.getMap();
      if (!map) return;

      if (bounds) {
        map.fitBounds(bounds, { padding: 40, duration: 650, maxZoom: 10 });
      }

      return;
    }

    if (feature && feature.layer.id === "distritos-hit") {
      const ubigeo = String((feature.properties as Record<string, unknown> | undefined)?.ubigeo ?? "");
      if (!ubigeo) return;

      const bounds = getBoundsFromFeatureGeometry(feature.geometry);
      setSelectedDist(ubigeo);

      const map = mapRef.current?.getMap();
      if (!map) return;

      if (bounds) {
        map.fitBounds(bounds, { padding: 32, duration: 550, maxZoom: 12 });
      }

      return;
    }

    if (selectedDist) {
      setSelectedDist(null);
      const map = mapRef.current?.getMap();
      if (map && selectedProvBounds) {
        map.fitBounds(selectedProvBounds, { padding: 40, duration: 600, maxZoom: 10 });
      }
      return;
    }

    if (selectedProvFull) {
      setSelectedProvFull(null);
      setSelectedProvBounds(null);
      const map = mapRef.current?.getMap();
      if (map && selectedDepBounds) {
        map.fitBounds(selectedDepBounds, { padding: 48, duration: 650, maxZoom: 8 });
      }
      return;
    }

    if (selectedDep) {
      setSelectedDep(null);
      setSelectedDepBounds(null);
      setSelectedDist(null);
      setSelectedProvBounds(null);
      mapRef.current?.flyTo({ center: [PERU_CENTER.lng, PERU_CENTER.lat], zoom: PERU_CENTER.zoom, duration: 700 });
    }
  };

  const handleMapMove = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];

    setHoverDep(null);
    setHoverProvFull(null);
    setHoverDist(null);

    if (!feature) return;

    const props = (feature.properties as Record<string, unknown> | undefined) ?? {};

    if (feature.layer.id === "distritos-hit") {
      const ubigeo = String(props.ubigeo ?? "");
      if (ubigeo) setHoverDist(ubigeo);
      return;
    }

    if (feature.layer.id === "provincias-hit") {
      const prov = String(props.codprov_full ?? "");
      if (prov) setHoverProvFull(prov);
      return;
    }

    if (feature.layer.id === "departamentos-hit") {
      const dep = String(props.coddep ?? "");
      if (dep) setHoverDep(dep);
    }
  };

  const resetHover = () => {
    setHoverDep(null);
    setHoverProvFull(null);
    setHoverDist(null);
  };

  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <MapLibre
        ref={mapRef}
        initialViewState={{ longitude: PERU_CENTER.lng, latitude: PERU_CENTER.lat, zoom: PERU_CENTER.zoom }}
        mapStyle={mapStyle}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["distritos-hit", "provincias-hit", "departamentos-hit"]}
        onClick={handleMapClick}
        onMouseMove={handleMapMove}
        onMouseLeave={resetHover}
      >
        <Source id="peru-admin" type="vector" tiles={[tiles]} minzoom={3} maxzoom={20}>
          <Layer
            id="departamentos-fill"
            type="fill"
            source="peru-admin"
            source-layer="departamentos"
            filter={departamentosFilter}
            paint={{
              "fill-color": "#0f4c81",
              "fill-opacity": 0.2,
            }}
          />

          <Layer
            id="departamentos-line"
            type="line"
            source="peru-admin"
            source-layer="departamentos"
            filter={departamentosFilter}
            paint={{
              "line-color": ["case", ["==", ["get", "coddep"], hoverDep ?? ""], "#dc2626", "#000000"],
              "line-width": 1.2,
            }}
          />

          <Layer
            id="provincias-line"
            type="line"
            source="peru-admin"
            source-layer="provincias"
            filter={provinciasFilter}
            paint={{
              "line-color": ["case", ["==", ["get", "codprov_full"], hoverProvFull ?? ""], "#dc2626", "#000000"],
              "line-width": 0.9,
            }}
          />

          <Layer
            id="distritos-line"
            type="line"
            source="peru-admin"
            source-layer="distritos"
            filter={distritosFilter}
            paint={{
              "line-color": ["case", ["==", ["get", "ubigeo"], hoverDist ?? ""], "#dc2626", "#000000"],
              "line-width": 0.8,
            }}
          />

          <Layer
            id="departamentos-hit"
            type="fill"
            source="peru-admin"
            source-layer="departamentos"
            filter={departamentosFilter}
            paint={{
              "fill-color": "#000000",
              "fill-opacity": 0,
            }}
          />

          <Layer
            id="provincias-hit"
            type="fill"
            source="peru-admin"
            source-layer="provincias"
            filter={
              (selectedDep ? ["==", ["get", "coddep"], selectedDep] : ["==", ["get", "coddep"], "__none__"]) as FilterSpecification
            }
            paint={{
              "fill-color": "#000000",
              "fill-opacity": 0,
            }}
          />

          <Layer
            id="distritos-hit"
            type="fill"
            source="peru-admin"
            source-layer="distritos"
            filter={
              (selectedProvFull
                ? ["==", ["get", "codprov_full"], selectedProvFull]
                : ["==", ["get", "ubigeo"], "__none__"]) as FilterSpecification
            }
            paint={{
              "fill-color": "#000000",
              "fill-opacity": 0,
            }}
          />
        </Source>
      </MapLibre>
    </main>
  );
}
