"use client";

import { motion } from "motion/react";

interface SlideShellProps {
  /** Header navy band con título — estilo "RESULTADOS PROVINCIALES, 2022" del PDF. */
  title?: string;
  /** Sub-kicker arriba del título (ej: "Sección 2 · Análisis Electoral"). */
  kicker?: string;
  /** Si true, omite header y centra el contenido full-screen. */
  bare?: boolean;
  children: React.ReactNode;
}

export function SlideShell({ title, kicker, bare = false, children }: SlideShellProps) {
  if (bare) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-180px)]">
        {children}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header band — full bleed, navy + gold underline */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative -mx-4 sm:-mx-8 mb-8"
      >
        <div className="bg-gradient-to-r from-[#0a1e4a] via-[#0d2861] to-[#0a1e4a] px-6 sm:px-12 py-5 sm:py-7">
          {kicker && (
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-amber-400/80 font-semibold mb-1.5">
              {kicker}
            </p>
          )}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white uppercase tracking-tight leading-tight">
            {title}
          </h1>
        </div>
        <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
      </motion.div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
