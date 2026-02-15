"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, Source } from "@vis.gl/react-maplibre";
import type { MapRef } from "@vis.gl/react-maplibre";
import type { FilterSpecification, MapGeoJSONFeature, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";

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

type SourceLayerId = "departamentos" | "provincias" | "distritos";

type HoveredFeature = {
  sourceLayer: SourceLayerId;
  id: string | number;
};

type AgentLocation = {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  seq?: number;
};

type AgentSnapshotResponse = {
  ok?: boolean;
  ts?: string;
  agents?: AgentLocation[];
};

type AgentEventPayload = {
  agent?: AgentLocation;
  server_ts?: string;
};

type AgentHealthResponse = {
  ok?: boolean;
  service?: string;
  ts?: string;
  online_agents?: number;
  sse_clients?: number;
  stale_after_ms?: number;
  heartbeat_ms?: number;
  retention_days?: number;
  last_ingest_at?: string | null;
  last_ingest_age_ms?: number | null;
};

type MetricsResponse = {
  ok?: boolean;
  ts?: string;
  counters?: {
    tracking_ingest_total?: Record<string, number>;
    forms_ingest_total?: Record<string, number>;
    tracking_dedupe_total?: Record<string, number>;
    forms_dedupe_total?: Record<string, number>;
  };
  latencies?: Record<
    string,
    {
      count: number;
      p50_ms: number;
      p95_ms: number;
      p99_ms: number;
    }
  >;
};

function sanitizeApiBase(rawValue: string): string {
  const value = rawValue.trim();
  if (!value || value === "undefined" || value === "null") {
    return "";
  }

  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      return "";
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function toAbsoluteTileUrl(urlTemplate: string): string {
  if (/^https?:\/\//i.test(urlTemplate)) {
    try {
      const parsed = new URL(urlTemplate);
      if (parsed.username || parsed.password) {
        return "/api/tiles/{z}/{x}/{y}.vector.pbf";
      }
      return urlTemplate;
    } catch {
      return "/api/tiles/{z}/{x}/{y}.vector.pbf";
    }
  }

  const apiBase = sanitizeApiBase(process.env.NEXT_PUBLIC_MAP_API_BASE ?? "");
  const base = apiBase.replace(/\/$/, "");

  if (!base) {
    if (typeof window !== "undefined") {
      const normalizedPath = urlTemplate.startsWith("/") ? urlTemplate : `/${urlTemplate}`;
      return `${window.location.origin}${normalizedPath}`;
    }
    return urlTemplate.startsWith("/") ? urlTemplate : `/${urlTemplate}`;
  }

  return urlTemplate.startsWith("/") ? `${base}${urlTemplate}` : `${base}/${urlTemplate}`;
}

function isValidAgentLocation(value: unknown): value is AgentLocation {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (typeof data.agent_id !== "string" || !data.agent_id.trim()) return false;
  if (typeof data.ts !== "string" || Number.isNaN(Date.parse(data.ts))) return false;
  if (typeof data.lat !== "number" || typeof data.lng !== "number") return false;
  if (data.lat < -90 || data.lat > 90) return false;
  if (data.lng < -180 || data.lng > 180) return false;
  return true;
}

function getBoundsFromFeatureGeometry(geometry: unknown): [[number, number], [number, number]] | null {
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
}

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

const DEFAULT_TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

export default function Home() {
  const mapRef = useRef<MapRef | null>(null);
  const hoveredFeatureRef = useRef<HoveredFeature | null>(null);

  const apiBase = sanitizeApiBase(process.env.NEXT_PUBLIC_MAP_API_BASE ?? "");
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("Conectando con backend y Tegola...");
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [tileTemplate, setTileTemplate] = useState(DEFAULT_TILE_TEMPLATE);
  const [mapName, setMapName] = useState("peru");
  const [selectedDep, setSelectedDep] = useState<string | null>(null);
  const [selectedProvFull, setSelectedProvFull] = useState<string | null>(null);
  const [selectedDist, setSelectedDist] = useState<string | null>(null);
  const [selectedDepBounds, setSelectedDepBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [selectedProvBounds, setSelectedProvBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [agentLocations, setAgentLocations] = useState<Record<string, AgentLocation>>({});
  const [agentFeedState, setAgentFeedState] = useState<"connecting" | "live" | "error">("connecting");
  const [agentsHealth, setAgentsHealth] = useState<AgentHealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);

  const healthUrl = apiBase ? `${apiBase}/api/health` : "/api/health";
  const configUrl = apiBase ? `${apiBase}/api/config` : "/api/config";
  const agentsSnapshotUrl = apiBase ? `${apiBase}/api/agents/live` : "/api/agents/live";
  const agentsStreamUrl = apiBase ? `${apiBase}/api/agents/stream` : "/api/agents/stream";
  const agentsHealthUrl = apiBase ? `${apiBase}/api/agents/health` : "/api/agents/health";
  const metricsUrl = apiBase ? `${apiBase}/api/metrics` : "/api/metrics";

  const departamentosFilter = selectedDep
    ? (["==", ["get", "coddep"], selectedDep] as FilterSpecification)
    : (["has", "coddep"] as FilterSpecification);

  const provinciasFilter = (() => {
    if (!selectedDep) return ["==", ["get", "coddep"], "__none__"] as FilterSpecification;
    if (selectedProvFull) return ["==", ["get", "codprov_full"], selectedProvFull] as FilterSpecification;
    return ["==", ["get", "coddep"], selectedDep] as FilterSpecification;
  })();

  const distritosFilter = (() => {
    if (!selectedProvFull) return ["==", ["get", "ubigeo"], "__none__"] as FilterSpecification;
    if (selectedDist) return ["==", ["get", "ubigeo"], selectedDist] as FilterSpecification;
    return ["==", ["get", "codprov_full"], selectedProvFull] as FilterSpecification;
  })();

  const agentsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: Object.values(agentLocations).map((agent) => ({
        type: "Feature" as const,
        id: agent.agent_id,
        properties: {
          agent_id: agent.agent_id,
          ts: agent.ts,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [agent.lng, agent.lat],
        },
      })),
    }),
    [agentLocations],
  );

  const clearHoverState = useCallback(() => {
    const map = mapRef.current?.getMap();
    const prev = hoveredFeatureRef.current;

    if (map && prev) {
      map.setFeatureState(
        {
          source: "peru-admin",
          sourceLayer: prev.sourceLayer,
          id: prev.id,
        },
        { hover: false },
      );
    }

    hoveredFeatureRef.current = null;

    if (map) {
      map.getCanvas().style.cursor = "";
    }
  }, []);

  const getHoveredFeature = useCallback((feature: MapGeoJSONFeature | undefined): HoveredFeature | null => {
    if (!feature || feature.id === undefined || feature.id === null) {
      return null;
    }

    if (feature.layer.id === "departamentos-hit") {
      return { sourceLayer: "departamentos", id: feature.id };
    }

    if (feature.layer.id === "provincias-hit") {
      return { sourceLayer: "provincias", id: feature.id };
    }

    if (feature.layer.id === "distritos-hit") {
      return { sourceLayer: "distritos", id: feature.id };
    }

    return null;
  }, []);

  const handleMapMove = useCallback(
    (event: MapLayerMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const next = getHoveredFeature(event.features?.[0]);
      const prev = hoveredFeatureRef.current;

      if (prev && (!next || prev.id !== next.id || prev.sourceLayer !== next.sourceLayer)) {
        map.setFeatureState(
          {
            source: "peru-admin",
            sourceLayer: prev.sourceLayer,
            id: prev.id,
          },
          { hover: false },
        );
      }

      if (next && (!prev || prev.id !== next.id || prev.sourceLayer !== next.sourceLayer)) {
        map.setFeatureState(
          {
            source: "peru-admin",
            sourceLayer: next.sourceLayer,
            id: next.id,
          },
          { hover: true },
        );
      }

      hoveredFeatureRef.current = next;
      map.getCanvas().style.cursor = next ? "pointer" : "";
    },
    [getHoveredFeature],
  );

  const resetHover = useCallback(() => {
    clearHoverState();
  }, [clearHoverState]);

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      clearHoverState();

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
    },
    [clearHoverState, selectedDep, selectedDepBounds, selectedDist, selectedProvBounds, selectedProvFull],
  );

  useEffect(() => {
    const controller = new AbortController();

    const bootstrap = async () => {
      try {
        setTileUrl(toAbsoluteTileUrl(DEFAULT_TILE_TEMPLATE));
        setTileTemplate(DEFAULT_TILE_TEMPLATE);

        const [healthResponse, configResponse] = await Promise.all([
          fetch(healthUrl, { cache: "no-store", signal: controller.signal }),
          fetch(configUrl, { cache: "no-store", signal: controller.signal }),
        ]);

        if (!healthResponse.ok || !configResponse.ok) {
          setStatus("error");
          setMessage("backend o config sin respuesta valida");
          return;
        }

        const [healthData, configData] = (await Promise.all([healthResponse.json(), configResponse.json()])) as [
          HealthResponse,
          ConfigResponse,
        ];

        if (!healthData.ok) {
          setStatus("error");
          setMessage("backend o config sin respuesta valida");
          return;
        }

        setStatus("ok");
        setMessage(`health ok (${healthData.service ?? "backend"}) | map: ${configData.mapName ?? "peru"}`);
        const template = configData.tileUrlTemplate ?? DEFAULT_TILE_TEMPLATE;
        setTileTemplate(template);
        setTileUrl(toAbsoluteTileUrl(template));
        setMapName(configData.mapName ?? "peru");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setStatus("error");
        setMessage("error conectando a backend/tegola");
      }
    };

    void bootstrap();

    return () => {
      controller.abort();
    };
  }, [configUrl, healthUrl]);

  useEffect(() => {
    const controller = new AbortController();
    let eventSource: EventSource | null = null;
    let disposed = false;

    const applySnapshot = (items: AgentLocation[]) => {
      const nextState: Record<string, AgentLocation> = {};
      for (const item of items) {
        if (!isValidAgentLocation(item)) continue;
        nextState[item.agent_id] = item;
      }
      setAgentLocations(nextState);
    };

    const connect = async () => {
      try {
        setAgentFeedState("connecting");

        const response = await fetch(agentsSnapshotUrl, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("snapshot no disponible");
        }

        const snapshot = (await response.json()) as AgentSnapshotResponse;
        if (Array.isArray(snapshot.agents)) {
          applySnapshot(snapshot.agents);
        }

        if (disposed) return;

        eventSource = new EventSource(agentsStreamUrl);

        eventSource.addEventListener("open", () => {
          setAgentFeedState("live");
        });

        eventSource.addEventListener("snapshot", (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data) as AgentSnapshotResponse;
            if (Array.isArray(payload.agents)) {
              applySnapshot(payload.agents);
            }
          } catch {
            setAgentFeedState("error");
          }
        });

        eventSource.addEventListener("location.update", (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data) as AgentEventPayload;
            const next = payload.agent;
            if (!isValidAgentLocation(next)) return;
            setAgentLocations((prev) => ({
              ...prev,
              [next.agent_id]: next,
            }));
          } catch {
            setAgentFeedState("error");
          }
        });

        eventSource.addEventListener("agent.offline", (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data) as { agent_id?: string };
            if (!payload.agent_id) return;
            setAgentLocations((prev) => {
              const next = { ...prev };
              delete next[payload.agent_id as string];
              return next;
            });
          } catch {
            setAgentFeedState("error");
          }
        });

        eventSource.onerror = () => {
          setAgentFeedState("error");
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setAgentFeedState("error");
      }
    };

    void connect();

    return () => {
      disposed = true;
      controller.abort();
      eventSource?.close();
    };
  }, [agentsSnapshotUrl, agentsStreamUrl]);

  useEffect(() => {
    const controller = new AbortController();

    const pollOps = async () => {
      try {
        const [healthResponse, metricsResponse] = await Promise.all([
          fetch(agentsHealthUrl, { cache: "no-store", signal: controller.signal }),
          fetch(metricsUrl, { cache: "no-store", signal: controller.signal }),
        ]);

        if (healthResponse.ok) {
          const healthData = (await healthResponse.json()) as AgentHealthResponse;
          setAgentsHealth(healthData);
        }

        if (metricsResponse.ok) {
          const metricsData = (await metricsResponse.json()) as MetricsResponse;
          setMetrics(metricsData);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    };

    void pollOps();
    const timer = setInterval(() => {
      void pollOps();
    }, 10000);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [agentsHealthUrl, metricsUrl]);

  useEffect(() => {
    return () => {
      clearHoverState();
    };
  }, [clearHoverState]);

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
        {tileUrl ? (
          <Source
            id="peru-admin"
            type="vector"
            tiles={[tileUrl]}
            minzoom={3}
            maxzoom={20}
            promoteId={{ departamentos: "coddep", provincias: "codprov_full", distritos: "ubigeo" }}
          >
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
                "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#dc2626", "#0f172a"],
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
                "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#dc2626", "#334155"],
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
                "line-color": ["case", ["boolean", ["feature-state", "hover"], false], "#dc2626", "#0f172a"],
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
        ) : null}

        <Source id="agents-live" type="geojson" data={agentsGeoJson}>
          <Layer
            id="agents-live-circle"
            type="circle"
            paint={{
              "circle-color": "#ef4444",
              "circle-radius": 6,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-opacity": 0.92,
            }}
          />
          <Layer
            id="agents-live-label"
            type="symbol"
            layout={{
              "text-field": ["get", "agent_id"],
              "text-offset": [0, 1.3],
              "text-size": 11,
              "text-anchor": "top",
            }}
            paint={{
              "text-color": "#0f172a",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1,
            }}
          />
        </Source>
      </MapLibre>

      <section
        style={{
          width: "min(900px, 94vw)",
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
        <p style={{ marginTop: "6px", marginBottom: 0, color: "#475569" }}>Tiles: {tileTemplate}</p>
        <p style={{ marginTop: "6px", marginBottom: 0, color: "#475569" }}>
          Tracking: {agentFeedState.toUpperCase()} | agentes online: {Object.keys(agentLocations).length}
        </p>
        <p style={{ marginTop: "6px", marginBottom: 0, color: "#334155" }}>
          Ops: online={agentsHealth?.online_agents ?? "-"} | sse={agentsHealth?.sse_clients ?? "-"} | last_ingest_age_ms={agentsHealth?.last_ingest_age_ms ?? "-"}
        </p>
        <p style={{ marginTop: "6px", marginBottom: 0, color: "#334155" }}>
          Tracking counters: 202={metrics?.counters?.tracking_ingest_total?.["202"] ?? 0} | 200={metrics?.counters?.tracking_ingest_total?.["200"] ?? 0} | 4xx={metrics?.counters?.tracking_ingest_total?.["400"] ?? 0} | 5xx={metrics?.counters?.tracking_ingest_total?.["500"] ?? 0} | dedupe={metrics?.counters?.tracking_dedupe_total?.agent_seq ?? 0}
        </p>
        <p style={{ marginTop: "6px", marginBottom: 0, color: "#334155" }}>
          Forms counters: 202={metrics?.counters?.forms_ingest_total?.["202"] ?? 0} | 200={metrics?.counters?.forms_ingest_total?.["200"] ?? 0} | 4xx={metrics?.counters?.forms_ingest_total?.["400"] ?? 0} | 5xx={metrics?.counters?.forms_ingest_total?.["500"] ?? 0} | dedupe={metrics?.counters?.forms_dedupe_total?.client_id_pending ?? metrics?.counters?.forms_dedupe_total?.client_id ?? 0}
        </p>
        <p style={{ marginTop: "6px", marginBottom: 0, color: "#334155" }}>
          Latencia tracking p50/p95/p99: {metrics?.latencies?.["/api/agents/location"]?.p50_ms ?? "-"}/{metrics?.latencies?.["/api/agents/location"]?.p95_ms ?? "-"}/{metrics?.latencies?.["/api/agents/location"]?.p99_ms ?? "-"} ms
        </p>
        <p style={{ marginTop: "10px", marginBottom: 0 }}>
          <a href="/ops" style={{ color: "#0f172a", fontWeight: 700 }}>
            Ir al dashboard de observabilidad
          </a>
        </p>
      </section>
    </main>
  );
}
