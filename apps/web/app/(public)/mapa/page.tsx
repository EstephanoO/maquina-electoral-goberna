"use client";

import dynamic from "next/dynamic";
import { MapLayerPanel } from "./_components/map-layer-panel";

const PublicMap = dynamic(
  () => import("./_components/public-map").then((m) => m.PublicMap),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e6e5e3",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "var(--color-text-tertiary)",
            fontSize: 14,
            fontFamily: "var(--font-montserrat), system-ui, sans-serif",
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              border: "2px solid var(--color-border)",
              borderTopColor: "var(--goberna-blue-600)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          Cargando geovisor...
          <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      </div>
    ),
  },
);

export default function MapaPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        position: "relative",
      }}
    >
      <PublicMap />
      <MapLayerPanel />
    </div>
  );
}
