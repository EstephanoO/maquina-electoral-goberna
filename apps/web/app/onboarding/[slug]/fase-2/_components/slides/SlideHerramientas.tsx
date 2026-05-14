"use client";

import { motion } from "motion/react";
import { Network, MessageSquare, Map } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { SlideChromeData } from "../chrome/SlideChromeData";

/**
 * Slide HERRAMIENTAS — replica p.18 del PDF Goberna.
 * Title "HERRAMIENTAS DE CAMPAÑA" + frase central + grid 3-col con cards
 * visualmente uniformes (Social Listening · CRM · Plataforma de Territorio).
 *
 * Todas las cards usan el mismo lenguaje visual:
 *   - bg navy gradient + ring amber-400/30
 *   - SVG decorativo único top, en líneas/dots amber sobre navy
 *   - icon lucide centrado + label uppercase blanco abajo
 */

interface Tool {
  key: "social" | "crm" | "territorio";
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TOOLS: Tool[] = [
  { key: "social",     label: "Social Listening",       Icon: Network },
  { key: "crm",        label: "CRM",                     Icon: MessageSquare },
  { key: "territorio", label: "Plataforma de Territorio", Icon: Map },
];

export function SlideHerramientas() {
  return (
    <SlideChromeData
      title="HERRAMIENTAS DE CAMPAÑA"
      subtitle="El stack tecnológico Goberna"
      chapter={5}
      chapterHint="qué te entregamos"
    >
      <div className="flex flex-col gap-10">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center text-base sm:text-lg md:text-xl font-bold text-[#0a1f4a] leading-snug max-w-3xl mx-auto"
        >
          Goberna cuenta con herramientas tecnológicas y equipo de estrategia
          con la capacidad de dirigir campañas exitosas.
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {TOOLS.map((tool, i) => (
            <motion.div
              key={tool.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{
                scale: 1.02,
                boxShadow: "0 0 32px rgba(251, 191, 36, 0.25)",
              }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
              className="relative aspect-[4/3] rounded-2xl p-8 overflow-hidden ring-1 ring-amber-400/30 flex flex-col items-center justify-between"
              style={{
                background: "linear-gradient(135deg, #0a1f4a 0%, #020a1e 100%)",
              }}
            >
              {/* SVG decorativo top */}
              <div className="w-full flex-1 min-h-0 flex items-center justify-center">
                <ToolDecoration variant={tool.key} />
              </div>

              {/* Icon + label bottom */}
              <div className="flex flex-col items-center gap-3 mt-4">
                <tool.Icon
                  className="size-8 text-amber-400"
                  strokeWidth={1.8}
                />
                <p className="text-center text-sm sm:text-base font-black uppercase tracking-wide text-white">
                  {tool.label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </SlideChromeData>
  );
}

/** Heurística de visibilidad — siempre visible (slide estática). */
export function isSlideHerramientasVisible(): boolean {
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Decoraciones SVG por tool — mismo lenguaje visual (amber sobre navy).
// ────────────────────────────────────────────────────────────────────────────

function ToolDecoration({ variant }: { variant: Tool["key"] }) {
  if (variant === "social") {
    // 1 nodo central grande + 7 satélites pequeños conectados con líneas amber/40.
    return (
      <svg
        viewBox="0 0 200 140"
        className="w-full h-full max-h-[180px]"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <g stroke="#fbbf2466" strokeWidth="0.7" fill="none">
          <line x1="100" y1="70" x2="40"  y2="25" />
          <line x1="100" y1="70" x2="160" y2="30" />
          <line x1="100" y1="70" x2="25"  y2="70" />
          <line x1="100" y1="70" x2="175" y2="70" />
          <line x1="100" y1="70" x2="45"  y2="115" />
          <line x1="100" y1="70" x2="155" y2="115" />
          <line x1="100" y1="70" x2="100" y2="20" />
        </g>
        <g fill="#fbbf24">
          <circle cx="40"  cy="25"  r="3" />
          <circle cx="160" cy="30"  r="2.5" />
          <circle cx="25"  cy="70"  r="2.5" />
          <circle cx="175" cy="70"  r="3" />
          <circle cx="45"  cy="115" r="2.5" />
          <circle cx="155" cy="115" r="3" />
          <circle cx="100" cy="20"  r="2" />
        </g>
        {/* nodo central */}
        <circle cx="100" cy="70" r="8" fill="#fbbf24" />
        <circle cx="100" cy="70" r="12" fill="none" stroke="#fbbf2466" strokeWidth="0.8" />
      </svg>
    );
  }

  if (variant === "crm") {
    // 3 columnas kanban con 4 cards apiladas, stagger en altura, tarjetas amber.
    return (
      <svg
        viewBox="0 0 200 140"
        className="w-full h-full max-h-[180px]"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {/* Columna 1 (4 cards completas) */}
        <g>
          <rect x="20" y="14"  width="44" height="18" rx="3" fill="#fbbf2433" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="20" y="36"  width="44" height="18" rx="3" fill="#fbbf2433" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="20" y="58"  width="44" height="18" rx="3" fill="#fbbf2433" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="20" y="80"  width="44" height="18" rx="3" fill="#fbbf2433" stroke="#fbbf24aa" strokeWidth="0.6" />
        </g>
        {/* Columna 2 (3 cards, arranca más abajo — stagger) */}
        <g>
          <rect x="78" y="26"  width="44" height="18" rx="3" fill="#fbbf2444" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="78" y="48"  width="44" height="18" rx="3" fill="#fbbf2444" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="78" y="70"  width="44" height="18" rx="3" fill="#fbbf2444" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="78" y="92"  width="44" height="18" rx="3" fill="#fbbf2444" stroke="#fbbf24aa" strokeWidth="0.6" />
        </g>
        {/* Columna 3 (2 cards visibles, stagger más abajo) */}
        <g>
          <rect x="136" y="40"  width="44" height="18" rx="3" fill="#fbbf2455" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="136" y="62"  width="44" height="18" rx="3" fill="#fbbf2455" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="136" y="84"  width="44" height="18" rx="3" fill="#fbbf2455" stroke="#fbbf24aa" strokeWidth="0.6" />
          <rect x="136" y="106" width="44" height="18" rx="3" fill="#fbbf2455" stroke="#fbbf24aa" strokeWidth="0.6" />
        </g>
      </svg>
    );
  }

  // territorio — mapa estilizado con 5 dots + connection lines + 1 pin grande central
  return (
    <svg
      viewBox="0 0 200 140"
      className="w-full h-full max-h-[180px]"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {/* Forma del mapa */}
      <path
        d="M30,40 Q60,15 100,25 Q145,30 170,55 Q180,85 155,110 Q120,125 85,115 Q45,108 30,80 Q20,60 30,40 Z"
        fill="#fbbf2412"
        stroke="#fbbf2455"
        strokeWidth="0.8"
      />
      {/* Connection lines entre dots */}
      <g stroke="#fbbf2455" strokeWidth="0.6" fill="none">
        <line x1="55"  y1="55" x2="100" y2="70" />
        <line x1="145" y1="50" x2="100" y2="70" />
        <line x1="65"  y1="100" x2="100" y2="70" />
        <line x1="140" y1="95" x2="100" y2="70" />
      </g>
      {/* 5 dots amber */}
      <g fill="#fbbf24">
        <circle cx="55"  cy="55"  r="2.5" />
        <circle cx="145" cy="50"  r="3" />
        <circle cx="65"  cy="100" r="2.5" />
        <circle cx="140" cy="95"  r="2.5" />
        <circle cx="105" cy="35"  r="2" />
      </g>
      {/* Pin grande central */}
      <g transform="translate(100,70)">
        <path
          d="M0,-14 C-8,-14 -12,-8 -12,-2 C-12,6 0,18 0,18 C0,18 12,6 12,-2 C12,-8 8,-14 0,-14 Z"
          fill="#fbbf24"
        />
        <circle cx="0" cy="-3" r="3.5" fill="#0a1f4a" />
      </g>
    </svg>
  );
}
