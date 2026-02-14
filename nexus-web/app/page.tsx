"use client";

import { useEffect, useMemo, useState } from "react";
import { Layer, Map as MapLibre, Source } from "@vis.gl/react-maplibre";
import type { MapRef } from "@vis.gl/react-maplibre";
import type { FilterSpecification, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import { useRef } from "react";

type HealthResponse = {
  ok?: boolean;
  service?: string;
  ts?: string;
};

type ConfigResponse = {
  mapName?: string;
  tileUrlTemplate?: string;
  layers?: Array<{ id: string; sourceLayer: string; minZoom: number; maxZoom: number }>;
};

const peruView = {
  longitude: -75.0152,
  latitude: -9.1899,
  zoom: 5,
};

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#d9e7f2",
      },
    },
  ],
};

export default function Home() {
  const mapRef = useRef<MapRef | null>(null);
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_MAP_API_BASE ?? "", []);
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("Conectando con backend y Tegola...");
  const [tileUrl, setTileUrl] = useState("/api/tiles/{z}/{x}/{y}.vector.pbf");
  const [mapName, setMapName] = useState("peru");
  const [selectedDep, setSelectedDep] = useState<string | null>(null);
  const [selectedProvFull, setSelectedProvFull] = useState<string | null>(null);
  const [selectedDist, setSelectedDist] = useState<string | null>(null);
  const [selectedDepBounds, setSelectedDepBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [selectedProvBounds, setSelectedProvBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [hoverDep, setHoverDep] = useState<string | null>(null);
  const [hoverProvFull, setHoverProvFull] = useState<string | null>(null);
  const [hoverDist, setHoverDist] = useState<string | null>(null);

  const healthUrl = apiBase ? `${apiBase}/api/health` : "/api/health";
  const configUrl = apiBase ? `${apiBase}/api/config` : "/api/config";

  const departamentosFilter = useMemo(
    () => (selectedDep ? (["==", ["get", "coddep"], selectedDep] as FilterSpecification) : (["has", "coddep"] as FilterSpecification)),
    [selectedDep],
  );

  const provinciasFilter = useMemo(() => {
    if (!selectedDep) return ["==", ["get", "coddep"], "__none__"] as FilterSpecification;
    if (selectedProvFull) return ["==", ["get", "codprov_full"], selectedProvFull] as FilterSpecification;
    return ["==", ["get", "coddep"], selectedDep] as FilterSpecification;
  }, [selectedDep, selectedProvFull]);

  const distritosFilter = useMemo(() => {
    if (!selectedProvFull) return ["==", ["get", "ubigeo"], "__none__"] as FilterSpecification;
    if (selectedDist) return ["==", ["get", "ubigeo"], selectedDist] as FilterSpecification;
    return ["==", ["get", "codprov_full"], selectedProvFull] as FilterSpecification;
  }, [selectedProvFull, selectedDist]);

  const getBoundsFromFeatureGeometry = (geometry: unknown): [[number, number], [number, number]] | null => {
    if (!geometry || typeof geometry !== "object") return null;
    const coords = (geometry as { coordinates?: unknown }).coordinates;
    if (!coords) return null;

    let minLon = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    const visit = (value: unknown): void => {
      if (!Array.isArray(value)) return;

      if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
        const lon = value[0];
        const lat = value[1];
        minLon = Math.min(minLon, lon);
        minLat = Math.min(minLat, lat);
        maxLon = Math.max(maxLon, lon);
        maxLat = Math.max(maxLat, lat);
        return;
      }

      for (const item of value) visit(item);
    };

    visit(coords);

    if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
      return null;
    }

    return [
      [minLon, minLat],
      [maxLon, maxLat],
    ];
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

  const handleMapClick = (event: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    const feature = event.features?.[0];

    if (feature?.layer.id === "departamentos-hit") {
      const dep = String((feature.properties as Record<string, unknown> | undefined)?.coddep ?? "");
      if (!dep) return;
      const bounds = getBoundsFromFeatureGeometry(feature.geometry);
      setSelectedDep(dep);
      setSelectedProvFull(null);
      setSelectedDist(null);
      setSelectedDepBounds(bounds);
      setSelectedProvBounds(null);
      if (map && bounds) map.fitBounds(bounds, { padding: 46, duration: 650, maxZoom: 8 });
      return;
    }

    if (feature?.layer.id === "provincias-hit") {
      const provFull = String((feature.properties as Record<string, unknown> | undefined)?.codprov_full ?? "");
      if (!provFull) return;
      const bounds = getBoundsFromFeatureGeometry(feature.geometry);
      setSelectedProvFull(provFull);
      setSelectedDist(null);
      setSelectedProvBounds(bounds);
      if (map && bounds) map.fitBounds(bounds, { padding: 38, duration: 550, maxZoom: 10 });
      return;
    }

    if (feature?.layer.id === "distritos-hit") {
      const ubigeo = String((feature.properties as Record<string, unknown> | undefined)?.ubigeo ?? "");
      if (!ubigeo) return;
      const bounds = getBoundsFromFeatureGeometry(feature.geometry);
      setSelectedDist(ubigeo);
      if (map && bounds) map.fitBounds(bounds, { padding: 30, duration: 500, maxZoom: 12 });
      return;
    }

    if (selectedDist) {
      setSelectedDist(null);
      if (map && selectedProvBounds) map.fitBounds(selectedProvBounds, { padding: 38, duration: 500, maxZoom: 10 });
      return;
    }

    if (selectedProvFull) {
      setSelectedProvFull(null);
      setSelectedProvBounds(null);
      if (map && selectedDepBounds) map.fitBounds(selectedDepBounds, { padding: 46, duration: 600, maxZoom: 8 });
      return;
    }

    if (selectedDep) {
      setSelectedDep(null);
      setSelectedDist(null);
      setSelectedDepBounds(null);
      mapRef.current?.flyTo({ center: [peruView.longitude, peruView.latitude], zoom: peruView.zoom, duration: 700 });
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [healthResponse, configResponse] = await Promise.all([
          fetch(healthUrl, { cache: "no-store" }),
          fetch(configUrl, { cache: "no-store" }),
        ]);

        const healthData = (await healthResponse.json()) as HealthResponse;
        const configData = (await configResponse.json()) as ConfigResponse;

        if (!cancelled && healthResponse.ok && healthData.ok) {
          setStatus("ok");
          setMessage(`health ok (${healthData.service ?? "backend"}) | map: ${configData.mapName ?? "peru"}`);
          setTileUrl(configData.tileUrlTemplate ?? "/api/tiles/{z}/{x}/{y}.vector.pbf");
          setMapName(configData.mapName ?? "peru");
          return;
        }

        if (!cancelled) {
          setStatus("error");
          setMessage("backend o config sin respuesta valida");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("error conectando a backend/tegola");
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [configUrl, healthUrl]);

  return (
    <main
      style={{
        minHeight: "100vh",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        background: "#dce8f3",
        position: "relative",
      }}
    >
      <MapLibre
        ref={mapRef}
        initialViewState={peruView}
        mapStyle={mapStyle}
        style={{ width: "100vw", height: "100vh" }}
        interactiveLayerIds={["departamentos-hit", "provincias-hit", "distritos-hit"]}
        onMouseMove={handleMapMove}
        onMouseLeave={resetHover}
        onClick={handleMapClick}
      >
        <Source id="peru-admin" type="vector" tiles={[tileUrl]} minzoom={3} maxzoom={20}>
          <Layer
            id="departamentos-fill"
            type="fill"
            source="peru-admin"
            source-layer="departamentos"
            filter={departamentosFilter}
            paint={{
              "fill-color": "#22c55e",
              "fill-opacity": 0.35,
            }}
          />
          <Layer
            id="departamentos-line"
            type="line"
            source="peru-admin"
            source-layer="departamentos"
            filter={departamentosFilter}
            paint={{
              "line-color": ["case", ["==", ["get", "coddep"], hoverDep ?? ""], "#dc2626", "#0f172a"],
              "line-width": 2,
            }}
          />

          <Layer
            id="provincias-fill"
            type="fill"
            source="peru-admin"
            source-layer="provincias"
            filter={provinciasFilter}
            minzoom={5}
            paint={{
              "fill-color": "#60a5fa",
              "fill-opacity": 0.18,
            }}
          />
          <Layer
            id="provincias-line"
            type="line"
            source="peru-admin"
            source-layer="provincias"
            filter={provinciasFilter}
            minzoom={5}
            paint={{
              "line-color": ["case", ["==", ["get", "codprov_full"], hoverProvFull ?? ""], "#dc2626", "#334155"],
              "line-width": 1.4,
            }}
          />
          <Layer
            id="distritos-line"
            type="line"
            source="peru-admin"
            source-layer="distritos"
            filter={distritosFilter}
            minzoom={8}
            paint={{
              "line-color": ["case", ["==", ["get", "ubigeo"], hoverDist ?? ""], "#dc2626", "#0f172a"],
              "line-width": 1.1,
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
            filter={selectedDep ? (["==", ["get", "coddep"], selectedDep] as FilterSpecification) : (["==", ["get", "coddep"], "__none__"] as FilterSpecification)}
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
              selectedProvFull
                ? (["==", ["get", "codprov_full"], selectedProvFull] as FilterSpecification)
                : (["==", ["get", "ubigeo"], "__none__"] as FilterSpecification)
            }
            paint={{
              "fill-color": "#000000",
              "fill-opacity": 0,
            }}
          />
        </Source>
      </MapLibre>

      <section
        style={{
          width: "min(760px, 92vw)",
          padding: "14px 16px",
          borderRadius: "12px",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          position: "absolute",
          top: "14px",
          left: "14px",
          boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "16px" }}>MapLibre + Tegola</h1>
        <p style={{ marginTop: "8px", marginBottom: 0 }}>
          Estado: <strong>{status === "ok" ? "OK" : status === "checking" ? "CHECKING" : "ERROR"}</strong>
        </p>
        <p style={{ marginTop: "6px", marginBottom: 0 }}>{message}</p>
        <p style={{ marginTop: "6px", marginBottom: 0, color: "#475569" }}>Map: {mapName}</p>
        <p style={{ marginTop: "6px", marginBottom: 0, color: "#475569" }}>Tiles: {tileUrl}</p>
      </section>
    </main>
  );
}
