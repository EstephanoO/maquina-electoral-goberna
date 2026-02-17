"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, Popup, Source } from "@vis.gl/react-maplibre";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { api } from "@/lib/services";

/* ========== Types ========== */

export type AgentLocation = {
  agent_id: string;
  agent_name?: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
};

export type AgentStatus = "connected" | "idle" | "inactive";

export type EnrichedAgent = {
  id: string;
  name: string;
  status: AgentStatus;
  lastSeen: Date;
  forms_count: number;
  lat: number;
  lng: number;
};

export type FormPoint = {
  id: string;
  lat: number;
  lng: number;
  nombre: string;
  created_at: string;
  agent_id?: string;
};

type Props = {
  campaignId: string;
  primaryColor: string;
  agents: EnrichedAgent[];
  forms: FormPoint[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  showTracking?: boolean;
  showDatos?: boolean;
};

/* ========== Constants ========== */

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
      paint: { "background-color": "#e8f4f8" },
    },
  ],
};

const DEFAULT_TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

const STATUS_COLORS: Record<AgentStatus, string> = {
  connected: "#22c55e",
  idle: "#eab308",
  inactive: "#94a3b8",
};

/* ========== Component ========== */

export function TierraMap({ campaignId, primaryColor, agents, forms, selectedAgentId, onSelectAgent, showTracking = true, showDatos = true }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [popupAgent, setPopupAgent] = useState<EnrichedAgent | null>(null);

  // Initialize tile URL
  useEffect(() => {
    const url = DEFAULT_TILE_TEMPLATE;
    if (typeof window !== "undefined") {
      setTileUrl(`${window.location.origin}${url}`);
    } else {
      setTileUrl(url);
    }
    setStatus("ok");
  }, []);

  // Agent markers as GeoJSON
  const agentsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: agents.map((agent) => ({
        type: "Feature" as const,
        id: agent.id,
        properties: {
          agent_id: agent.id,
          name: agent.name,
          status: agent.status,
          forms_count: agent.forms_count,
          is_selected: agent.id === selectedAgentId ? 1 : 0,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [agent.lng, agent.lat],
        },
      })),
    }),
    [agents, selectedAgentId],
  );

  // Form points as GeoJSON
  const formsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: forms
        .filter((f) => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng))
        .map((form) => ({
          type: "Feature" as const,
          id: form.id,
          properties: {
            id: form.id,
            nombre: form.nombre,
            agent_id: form.agent_id,
            is_filtered: selectedAgentId ? (form.agent_id === selectedAgentId ? 1 : 0) : 1,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [form.lng, form.lat],
          },
        })),
    }),
    [forms, selectedAgentId],
  );

  const handleMapLoad = useCallback(() => {
    mapRef.current?.fitBounds(
      [
        [-81.4, -18.4],
        [-68.7, -0.1],
      ],
      { padding: 20, duration: 0 },
    );
  }, []);

  // Handle click on agent marker
  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const features = event.features;
      if (features && features.length > 0) {
        const feature = features[0];
        const agentId = feature.properties?.agent_id;
        if (agentId) {
          if (selectedAgentId === agentId) {
            onSelectAgent(null);
            setPopupAgent(null);
          } else {
            onSelectAgent(agentId);
            const agent = agents.find((a) => a.id === agentId);
            if (agent) setPopupAgent(agent);
          }
        }
      }
    },
    [agents, selectedAgentId, onSelectAgent],
  );

  // Handle hover
  const handleMouseEnter = useCallback(
    (event: MapLayerMouseEvent) => {
      const features = event.features;
      if (features && features.length > 0) {
        const agentId = features[0].properties?.agent_id;
        setHoveredAgentId(agentId);
        if (mapRef.current) {
          mapRef.current.getCanvas().style.cursor = "pointer";
        }
      }
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredAgentId(null);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = "";
    }
  }, []);

  // Fly to selected agent
  useEffect(() => {
    if (selectedAgentId && mapRef.current) {
      const agent = agents.find((a) => a.id === selectedAgentId);
      if (agent) {
        mapRef.current.flyTo({
          center: [agent.lng, agent.lat],
          zoom: 12,
          duration: 1000,
        });
        setPopupAgent(agent);
      }
    }
  }, [selectedAgentId, agents]);

  if (status === "loading" || !tileUrl) {
    return (
      <div style={styles.loadingContainer}>
        <span style={styles.loadingText}>Cargando mapa...</span>
      </div>
    );
  }

  return (
    <div style={styles.mapWrapper}>
      <MapLibre
        ref={mapRef}
        initialViewState={peruView}
        style={{ width: "100%", height: "100%" }}
        mapStyle={mapStyle}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={["agents-circles", "agents-circles-selected"]}
      >
        {/* Vector tiles source */}
        <Source id="peru" type="vector" tiles={[tileUrl]} minzoom={0} maxzoom={14}>
          <Layer
            id="departamentos-fill"
            type="fill"
            source-layer="departamentos"
            paint={{
              "fill-color": "#f8fafc",
              "fill-opacity": 0.8,
            }}
          />
          <Layer
            id="departamentos-line"
            type="line"
            source-layer="departamentos"
            paint={{
              "line-color": "#cbd5e1",
              "line-width": 1.5,
            }}
          />
          <Layer
            id="provincias-line"
            type="line"
            source-layer="provincias"
            minzoom={6}
            paint={{
              "line-color": "#e2e8f0",
              "line-width": 0.8,
            }}
          />
          <Layer
            id="distritos-line"
            type="line"
            source-layer="distritos"
            minzoom={9}
            paint={{
              "line-color": "#f1f5f9",
              "line-width": 0.5,
            }}
          />
        </Source>

        {/* Form data points - small colored dots */}
        {showDatos && (
          <Source id="forms" type="geojson" data={formsGeoJson}>
            <Layer
              id="forms-circles"
              type="circle"
              paint={{
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  5, 4,
                  10, 6,
                  15, 10,
                ],
                "circle-color": "#6366f1", // Indigo for data points
                "circle-opacity": [
                  "case",
                  ["==", ["get", "is_filtered"], 1],
                  0.8,
                  0.3,
                ],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              }}
            />
          </Source>
        )}

        {/* Agent markers - larger circles on top */}
        {showTracking && (
          <Source id="agents" type="geojson" data={agentsGeoJson}>
            {/* Outer ring for selected */}
            <Layer
              id="agents-circles-selected"
              type="circle"
              filter={["==", ["get", "is_selected"], 1]}
              paint={{
                "circle-radius": 24,
                "circle-color": primaryColor,
                "circle-opacity": 0.2,
              }}
            />
            {/* Pulse ring for connected agents */}
            <Layer
              id="agents-pulse"
              type="circle"
              filter={["==", ["get", "status"], "connected"]}
              paint={{
                "circle-radius": 18,
                "circle-color": STATUS_COLORS.connected,
                "circle-opacity": 0.15,
              }}
            />
            {/* Main circle */}
            <Layer
              id="agents-circles"
              type="circle"
              paint={{
                "circle-radius": [
                  "case",
                  ["==", ["get", "is_selected"], 1],
                  16,
                  12,
                ],
                "circle-color": [
                  "match",
                  ["get", "status"],
                  "connected", STATUS_COLORS.connected,
                  "idle", STATUS_COLORS.idle,
                  "inactive", STATUS_COLORS.inactive,
                  primaryColor,
                ],
                  "circle-stroke-width": 3,
                "circle-stroke-color": "#ffffff",
              }}
            />
            {/* Forms count label */}
            <Layer
              id="agents-labels"
              type="symbol"
              minzoom={7}
              layout={{
                "text-field": ["to-string", ["get", "forms_count"]],
                "text-size": 11,
                "text-allow-overlap": true,
              }}
              paint={{
                "text-color": "#ffffff",
                "text-halo-color": "rgba(0,0,0,0.3)",
                "text-halo-width": 1,
              }}
            />
          </Source>
        )}

        {/* Popup for selected agent */}
        {popupAgent && (
          <Popup
            longitude={popupAgent.lng}
            latitude={popupAgent.lat}
            anchor="bottom"
            offset={20}
            closeButton={false}
            closeOnClick={false}
          >
            <div style={styles.popup}>
              <div style={styles.popupHeader}>
                <span
                  style={{
                    ...styles.popupDot,
                    backgroundColor: STATUS_COLORS[popupAgent.status],
                  }}
                />
                <span style={styles.popupName}>{popupAgent.name}</span>
              </div>
              <div style={styles.popupStats}>
                <span style={{ ...styles.popupCount, color: primaryColor }}>
                  {popupAgent.forms_count}
                </span>
                <span style={styles.popupLabel}>datos</span>
              </div>
            </div>
          </Popup>
        )}
      </MapLibre>
    </div>
  );
}

/* ========== Styles ========== */

const styles: Record<string, React.CSSProperties> = {
  mapWrapper: {
    position: "absolute",
    inset: 0,
  },
  loadingContainer: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  loadingText: {
    color: "#64748b",
    fontSize: 14,
  },
  popup: {
    padding: "8px 12px",
    minWidth: 100,
  },
  popupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  popupDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  popupName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  popupStats: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
  },
  popupCount: {
    fontSize: 18,
    fontWeight: 700,
  },
  popupLabel: {
    fontSize: 11,
    color: "#94a3b8",
  },
};
