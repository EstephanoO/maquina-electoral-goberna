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

/**
 * @deprecated This page is a legacy debug/diagnostic map. The production
 * tracking view is at /candidatos/[slug]/tierra. This page lacks JWT auth
 * for SSE and will be removed in a future release.
 */
export default function MapPage() {
  return (
    <div>
      <div
        style={{
          padding: "8px 16px",
          background: "var(--goberna-gold-100, #fef3c7)",
          color: "var(--goberna-gold-800, #92400e)",
          fontSize: 13,
          fontWeight: 500,
          textAlign: "center",
          borderBottom: "1px solid var(--goberna-gold-200, #fde68a)",
        }}
      >
        Vista legacy — usa <a href="/candidatos" style={{ textDecoration: "underline", fontWeight: 600 }}>Tierra</a> para tracking en tiempo real
      </div>
      <MapView />
    </div>
  );
}
