"use client";

import type { ReactNode } from "react";

/**
 * Chrome data — header navy con título + amber underline + cuerpo blanco.
 * Patrón usado por todas las slides de análisis (¿Quién es?, FODA,
 * Presencia digital, Debilidades, Segmentación, etc.)
 */
interface Props {
  title: string;
  /** Subtítulo opcional debajo del título principal. */
  subtitle?: string;
  /** Tono del cuerpo — "white" (default) o "tinted" (subtle blue tint). */
  bodyTone?: "white" | "tinted";
  children: ReactNode;
  /** Footer opcional (caption pequeño bajo el contenido). */
  footer?: ReactNode;
}

export function SlideChromeData({
  title,
  subtitle,
  bodyTone = "white",
  children,
  footer,
}: Props) {
  const bodyBg =
    bodyTone === "tinted" ? "bg-slate-50" : "bg-white";

  return (
    <div className="relative flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 min-h-[70vh]">
      {/* Header navy */}
      <header
        className="relative px-8 sm:px-12 py-7 sm:py-8 text-white"
        style={{
          background:
            "linear-gradient(180deg, #0a1f4a 0%, #061634 100%)",
        }}
      >
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-center leading-tight">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2 text-xs sm:text-sm text-white/70 text-center font-medium">
            {subtitle}
          </p>
        ) : null}
        {/* Thin amber underline */}
        <div className="absolute left-0 right-0 bottom-0 h-1 bg-amber-400" />
      </header>

      {/* Body */}
      <div className={`relative flex-1 ${bodyBg} text-slate-900`}>
        <div className="h-full p-8 sm:p-12">{children}</div>
      </div>

      {footer ? (
        <div className={`${bodyBg} border-t border-slate-200 px-8 sm:px-12 py-4 text-center text-xs sm:text-sm text-slate-600`}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}
