"use client";

import dynamic from "next/dynamic";

/**
 * Lazy-load the map view — MapLibre GL is a heavy WebGL library (~500KB).
 * Using next/dynamic keeps it out of the shared dashboard JS bundle so other
 * pages (equipo, cms, formularios…) load faster.
 */
const MapView = dynamic(() => import("./_map-view"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: "3px solid var(--goberna-blue-100)",
          borderTopColor: "var(--goberna-blue-900)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, color: "var(--goberna-blue-900)" }}>
        Cargando mapa...
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ),
});

export default function MapPage() {
  return <MapView />;
}
