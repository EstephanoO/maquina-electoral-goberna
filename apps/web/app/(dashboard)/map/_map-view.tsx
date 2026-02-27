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

type AgentBatchEventPayload = {
  ts?: string;
  agents?: AgentLocation[];
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
  const pulseTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
  const [agentTrails, setAgentTrails] = useState<Record<string, Array<[number, number]>>>({});
  const [movementPulse, setMovementPulse] = useState<Record<string, boolean>>({});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentFeedState, setAgentFeedState] = useState<"connecting" | "live" | "error">("connecting");
  const [agentsHealth, setAgentsHealth] = useState<AgentHealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);

  const healthUrl = apiBase ? `${apiBase}/api/health` : "/api/health";
  const configUrl = apiBase ? `${apiBase}/api/config` : "/api/config";
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
          is_recent: movementPulse[agent.agent_id] ? 1 : 0,
          is_selected: selectedAgentId === agent.agent_id ? 1 : 0,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [agent.lng, agent.lat],
        },
      })),
    }),
    [agentLocations, movementPulse, selectedAgentId],
  );

  const connectedAgents = useMemo(() => {
    return Object.values(agentLocations)
      .sort((a, b) => a.agent_id.localeCompare(b.agent_id))
      .map((agent) => ({
        id: agent.agent_id,
        lat: agent.lat,
        lng: agent.lng,
        ts: agent.ts,
      }));
  }, [agentLocations]);

  const focusAgent = useCallback((agentId: string) => {
    const agent = agentLocations[agentId];
    if (!agent) return;
    setSelectedAgentId(agentId);
    mapRef.current?.flyTo({
      center: [agent.lng, agent.lat],
      zoom: 14,
      duration: 700,
    });
  }, [agentLocations]);

  const agentTrailsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: Object.entries(agentTrails)
        .filter(([, points]) => points.length > 1)
        .map(([agentId, points]) => ({
          type: "Feature" as const,
          id: agentId,
          properties: { agent_id: agentId },
          geometry: {
            type: "LineString" as const,
            coordinates: points,
          },
        })),
    }),
    [agentTrails],
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
    let eventSource: EventSource | null = null;

    const applySnapshot = (items: AgentLocation[]) => {
      const nextState: Record<string, AgentLocation> = {};
      const nextTrails: Record<string, Array<[number, number]>> = {};
      for (const item of items) {
        if (!isValidAgentLocation(item)) continue;
        nextState[item.agent_id] = item;
        nextTrails[item.agent_id] = [[item.lng, item.lat]];
      }
      setAgentLocations(nextState);
      setAgentTrails(nextTrails);
      setMovementPulse({});
    };

    const schedulePulse = (agentId: string) => {
      const existing = pulseTimersRef.current[agentId];
      if (existing) {
        clearTimeout(existing);
      }
      setMovementPulse((prev) => ({ ...prev, [agentId]: true }));
      pulseTimersRef.current[agentId] = setTimeout(() => {
        setMovementPulse((prev) => {
          if (!prev[agentId]) return prev;
          const next = { ...prev };
          delete next[agentId];
          return next;
        });
        delete pulseTimersRef.current[agentId];
      }, 8000);
    };

    const applyLocationBatch = (items: AgentLocation[]) => {
      if (items.length === 0) return;

      setAgentLocations((prev) => {
        const nextLocations = { ...prev };
        const movedAgentIds: string[] = [];

        for (const item of items) {
          const current = nextLocations[item.agent_id];
          if (current && typeof current.seq === "number" && typeof item.seq === "number" && item.seq <= current.seq) {
            continue;
          }

          const moved = !current || current.lat !== item.lat || current.lng !== item.lng;
          if (moved) {
            movedAgentIds.push(item.agent_id);
          }

          nextLocations[item.agent_id] = item;
        }

        if (movedAgentIds.length > 0) {
          setMovementPulse((prevPulse) => {
            const nextPulse = { ...prevPulse };
            for (const agentId of movedAgentIds) {
              const existing = pulseTimersRef.current[agentId];
              if (existing) clearTimeout(existing);
              nextPulse[agentId] = true;
              pulseTimersRef.current[agentId] = setTimeout(() => {
                setMovementPulse((prevValue) => {
                  if (!prevValue[agentId]) return prevValue;
                  const out = { ...prevValue };
                  delete out[agentId];
                  return out;
                });
                delete pulseTimersRef.current[agentId];
              }, 8000);
            }
            return nextPulse;
          });

          setAgentTrails((prevTrails) => {
            const nextTrails = { ...prevTrails };
            for (const agentId of movedAgentIds) {
              const latest = nextLocations[agentId];
              if (!latest) continue;
              const prevPoints = nextTrails[agentId] ?? [];
              nextTrails[agentId] = [...prevPoints, [latest.lng, latest.lat] as [number, number]].slice(-8);
            }
            return nextTrails;
          });
        }

        return nextLocations;
      });
    };

    const connect = async () => {
      try {
        setAgentFeedState("connecting");

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

        eventSource.addEventListener("location.batch", (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data) as AgentBatchEventPayload;
            if (!Array.isArray(payload.agents)) return;
            const validItems = payload.agents.filter(isValidAgentLocation);
            applyLocationBatch(validItems);
          } catch {
            setAgentFeedState("error");
          }
        });

        eventSource.addEventListener("agent.offline", (event) => {
          try {
            // Session-based: agent.offline = explicit logout → remove from map
            const payload = JSON.parse((event as MessageEvent).data) as { agent_id?: string };
            if (!payload.agent_id) return;
            setAgentLocations((prev) => {
              const next = { ...prev };
              delete next[payload.agent_id as string];
              return next;
            });
            setAgentTrails((prev) => {
              const next = { ...prev };
              delete next[payload.agent_id as string];
              return next;
            });
            setMovementPulse((prev) => {
              const next = { ...prev };
              delete next[payload.agent_id as string];
              return next;
            });
            const timer = pulseTimersRef.current[payload.agent_id as string];
            if (timer) {
              clearTimeout(timer);
              delete pulseTimersRef.current[payload.agent_id as string];
            }
          } catch {
            setAgentFeedState("error");
          }
        });

        // Session-based: agent.online = login → agent will appear when GPS arrives
        eventSource.addEventListener("agent.online", () => {
          // No-op: agent will appear on map when first location arrives
        });

        // Session-based: agent.idle = GPS stale but session active → keep on map
        eventSource.addEventListener("agent.idle", () => {
          // No-op: agent stays on map at last known position
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
      eventSource?.close();
      for (const timer of Object.values(pulseTimersRef.current)) {
        clearTimeout(timer);
      }
      pulseTimersRef.current = {};
    };
  }, [agentsStreamUrl]);

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
      if (typeof document !== "undefined" && document.hidden) return;
      void pollOps();
    }, 30000);

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

        <Source id="agents-trails" type="geojson" data={agentTrailsGeoJson}>
          <Layer
            id="agents-trails-line"
            type="line"
            paint={{
              "line-color": "#f97316",
              "line-opacity": 0.7,
              "line-width": 2,
            }}
          />
        </Source>

        <Source id="agents-live" type="geojson" data={agentsGeoJson}>
          <Layer
            id="agents-live-pulse"
            type="circle"
            paint={{
              "circle-color": "#fb923c",
              "circle-radius": ["case", ["==", ["get", "is_recent"], 1], 12, 0],
              "circle-opacity": ["case", ["==", ["get", "is_recent"], 1], 0.25, 0],
              "circle-stroke-width": 0,
            }}
          />
          <Layer
            id="agents-live-circle"
            type="circle"
            paint={{
              "circle-color": [
                "case",
                ["==", ["get", "is_selected"], 1],
                "#0ea5e9",
                ["==", ["get", "is_recent"], 1],
                "#f97316",
                "#ef4444",
              ],
              "circle-radius": ["case", ["==", ["get", "is_selected"], 1], 9, ["==", ["get", "is_recent"], 1], 7, 6],
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

      </section>

      <section
        style={{
          width: "min(320px, 86vw)",
          maxHeight: "min(65vh, 540px)",
          overflowY: "auto",
          padding: "12px",
          borderRadius: "12px",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          position: "absolute",
          top: "14px",
          right: "14px",
          boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "14px" }}>Agentes conectados ({connectedAgents.length})</h2>
        <p style={{ margin: "6px 0 10px", fontSize: "12px", color: "#475569" }}>Click para centrar y hacer zoom al punto.</p>
        {connectedAgents.length === 0 ? (
          <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>Sin agentes online.</p>
        ) : (
          <div style={{ display: "grid", gap: "6px" }}>
            {connectedAgents.map((agent) => {
              const selected = agent.id === selectedAgentId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => focusAgent(agent.id)}
                  style={{
                    textAlign: "left",
                    borderRadius: "8px",
                    border: selected ? "1px solid #0284c7" : "1px solid #e2e8f0",
                    background: selected ? "#e0f2fe" : "#f8fafc",
                    padding: "8px 10px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>{agent.id}</div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    {agent.lat.toFixed(5)}, {agent.lng.toFixed(5)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
