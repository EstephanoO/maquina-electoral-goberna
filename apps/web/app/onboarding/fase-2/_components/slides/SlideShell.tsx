"use client";

import { motion } from "motion/react";

interface SlideShellProps {
  /** Header band con título estilo PDF Goberna (navy + gold underline). */
  title?: string;
  /** Si true, omite el header band y centra todo (slides divisor estilo PDF). */
  bare?: boolean;
  children: React.ReactNode;
}

/**
 * Layout base de cada slide:
 *   - Modo "title": header navy con barra dorada inferior + contenido
 *   - Modo "bare": pantalla completa centrada (cover, divisores, CTA)
 */
export function SlideShell({ title, bare = false, children }: SlideShellProps) {
  if (bare) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-180px)]">
        {children}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative -mx-4 sm:-mx-8 mb-6"
      >
        <div className="bg-gradient-to-r from-[#0a1e4a] to-[#0d2861] px-6 sm:px-10 py-4 sm:py-5">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white uppercase tracking-tight">
            {title}
          </h1>
        </div>
        <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
      </motion.div>

      <div className="flex-1">{children}</div>
    </div>
  );
}
