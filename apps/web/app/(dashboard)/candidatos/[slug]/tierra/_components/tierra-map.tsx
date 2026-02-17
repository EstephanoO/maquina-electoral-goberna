"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, Marker, Source } from "@vis.gl/react-maplibre";
import type { MapRef } from "@vis.gl/react-maplibre";
import type { FilterSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { api } from "@/lib/services";

type AgentLocation = {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
};

type Props = {
  campaignId: string;
  primaryColor: string;
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
      paint: { "background-color": "#d9e7f2" },
    },
  ],
};

const DEFAULT_TILE_TEMPLATE = "/api/tiles/{z}/{x}/{y}.vector.pbf";

export function TierraMap({ campaignId, primaryColor }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [agentLocations, setAgentLocations] = useState<Record<string, AgentLocation>>({});
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

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

  // Fetch agent locations
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await api.get<{ agents: AgentLocation[] }>("/api/agents/live", {
          campaignId,
        });
        if (res.ok && res.data?.agents) {
          const map: Record<string, AgentLocation> = {};
          for (const a of res.data.agents) {
            if (a.agent_id && typeof a.lat === "number" && typeof a.lng === "number") {
              map[a.agent_id] = a;
            }
          }
          setAgentLocations(map);
        }
      } catch {
        // ignore
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, [campaignId]);

  // Agent markers as GeoJSON
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

  const handleMapLoad = useCallback(() => {
    // Fit to Peru bounds on load
    mapRef.current?.fitBounds(
      [
        [-81.4, -18.4], // SW
        [-68.7, -0.1], // NE
      ],
      { padding: 20, duration: 0 },
    );
  }, []);

  if (status === "loading" || !tileUrl) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#e2e8f0",
        }}
      >
        <span style={{ color: "#64748b" }}>Cargando mapa...</span>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapLibre
        ref={mapRef}
        initialViewState={peruView}
        style={{ width: "100%", height: "100%" }}
        mapStyle={mapStyle}
        onLoad={handleMapLoad}
      >
        {/* Vector tiles source */}
        <Source id="peru" type="vector" tiles={[tileUrl]} minzoom={0} maxzoom={14}>
          {/* Departamentos fill */}
          <Layer
            id="departamentos-fill"
            type="fill"
            source-layer="departamentos"
            paint={{
              "fill-color": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                "#c7d2fe",
                "#f1e4f0",
              ],
              "fill-opacity": 0.6,
            }}
          />

          {/* Departamentos outline */}
          <Layer
            id="departamentos-line"
            type="line"
            source-layer="departamentos"
            paint={{
              "line-color": "#334155",
              "line-width": 1,
            }}
          />

          {/* Provincias outline (visible at higher zoom) */}
          <Layer
            id="provincias-line"
            type="line"
            source-layer="provincias"
            minzoom={6}
            paint={{
              "line-color": "#64748b",
              "line-width": 0.5,
            }}
          />

          {/* Distritos outline (visible at highest zoom) */}
          <Layer
            id="distritos-line"
            type="line"
            source-layer="distritos"
            minzoom={9}
            paint={{
              "line-color": "#94a3b8",
              "line-width": 0.3,
            }}
          />
        </Source>

        {/* Agent markers */}
        <Source id="agents" type="geojson" data={agentsGeoJson}>
          <Layer
            id="agents-circles"
            type="circle"
            paint={{
              "circle-radius": 8,
              "circle-color": primaryColor,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            }}
          />
        </Source>
      </MapLibre>

      {/* Agent count badge */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          backgroundColor: "#ffffff",
          padding: "8px 12px",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          fontSize: 12,
          fontWeight: 600,
          color: "#334155",
        }}
      >
        {Object.keys(agentLocations).length} agentes en mapa
      </div>
    </div>
  );
}
