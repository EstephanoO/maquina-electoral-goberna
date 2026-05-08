"use client";

/**
 * Background "cielo nublado" estilo PDF Goberna — 5 capas de profundidad:
 *   1. Gradient base navy
 *   2. 4 radial gradients de nubes
 *   3. Glow dorado top
 *   4. Vignette inferior
 *   5. Noise SVG sutil
 *
 * Compartido por el wizard de Fase 1 + decks de Fase 2 y Fase 3 para
 * mantener identidad visual coherente.
 */
export function CloudSkyBg() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#0a1e4a] via-[#061b3d] to-[#020a1e]" />

      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 40% at 15% 20%, rgba(59, 130, 246, 0.15), transparent 60%),
            radial-gradient(ellipse 70% 50% at 85% 30%, rgba(30, 64, 175, 0.20), transparent 65%),
            radial-gradient(ellipse 80% 50% at 50% 80%, rgba(15, 23, 42, 0.6), transparent 70%),
            radial-gradient(ellipse 40% 30% at 75% 70%, rgba(96, 165, 250, 0.10), transparent 50%)
          `,
        }}
      />

      <div className="pointer-events-none fixed inset-x-0 top-0 h-1/3 bg-gradient-to-b from-amber-400/[0.06] to-transparent" />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[#020a1e] to-transparent" />

      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />
    </>
  );
}
