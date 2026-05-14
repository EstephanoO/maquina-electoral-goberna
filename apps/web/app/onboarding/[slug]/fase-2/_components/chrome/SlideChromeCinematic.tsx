"use client";

import type { ReactNode } from "react";

/**
 * Chrome cinematic — slide full-bleed con fondo cielo nublado navy
 * y franja amber inferior. Usado por slides hero, secciones, cierre.
 *
 * El parent del deck ya monta <CloudSkyBg /> global, así que acá solo
 * agregamos vignette + accent amber para crear la sensación "cinemática"
 * sin romper el grain del fondo global.
 */
interface Props {
  children: ReactNode;
  /** Color de la franja inferior — default amber, "none" para omitir. */
  accent?: "amber" | "none";
  className?: string;
}

export function SlideChromeCinematic({
  children,
  accent = "amber",
  className = "",
}: Props) {
  return (
    <div
      className={`relative flex-1 flex flex-col rounded-2xl overflow-hidden border border-white/5 shadow-2xl min-h-[70vh] ${className}`}
    >
      {/* Vignette adicional sobre el bg global para definir el contorno del slide */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(10, 30, 74, 0.55), transparent 75%), linear-gradient(180deg, rgba(2, 10, 30, 0.0) 0%, rgba(2, 10, 30, 0.4) 100%)",
        }}
      />

      {/* Contenido */}
      <div className="relative z-10 flex-1 flex flex-col">{children}</div>

      {/* Franja amber inferior */}
      {accent === "amber" ? (
        <div className="relative h-1.5 w-full bg-amber-400" />
      ) : null}
    </div>
  );
}
