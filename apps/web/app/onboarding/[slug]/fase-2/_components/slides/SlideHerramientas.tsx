"use client";

import { motion } from "motion/react";
import { Network, MessageSquare, Map } from "lucide-react";
import { SlideChromeData } from "../chrome/SlideChromeData";
import type { ComponentType, SVGProps } from "react";

/**
 * Slide HERRAMIENTAS — replica p.18 del PDF Goberna.
 * Title "HERRAMIENTAS DE CAMPAÑA ESTRATÉGICA" + frase central +
 * grid 3-col con cards visuales (Social Listening · CRM · Plataforma de Territorio).
 *
 * Cards usan placeholders abstractos (gradientes + icon lucide), sin imágenes.
 */

interface Tool {
  key: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Gradiente CSS para el bg del placeholder visual. */
  gradient: string;
  /** Color del icono (tailwind). */
  iconCls: string;
}

const TOOLS: Tool[] = [
  {
    key: "social",
    label: "Social Listening",
    Icon: Network,
    gradient:
      "radial-gradient(circle at 30% 40%, #1e3a8a 0%, #020a1e 60%), radial-gradient(circle at 70% 60%, #f59e0b22 0%, transparent 40%)",
    iconCls: "text-amber-400",
  },
  {
    key: "crm",
    label: "CRM",
    Icon: MessageSquare,
    gradient:
      "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
    iconCls: "text-[#0a1f4a]",
  },
  {
    key: "territorio",
    label: "Plataforma de Territorio",
    Icon: Map,
    gradient:
      "linear-gradient(160deg, #dbeafe 0%, #bfdbfe 50%, #e0f2fe 100%)",
    iconCls: "text-[#0a1f4a]",
  },
];

export function SlideHerramientas() {
  return (
    <SlideChromeData title="HERRAMIENTAS DE CAMPAÑA ESTRATÉGICA">
      <div className="flex flex-col gap-10">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center text-base sm:text-lg md:text-xl font-bold text-[#0a1f4a] leading-snug max-w-3xl mx-auto"
        >
          Goberna cuenta con herramientas tecnológicas y equipo de estrategia con
          la capacidad de dirigir campañas exitosas.
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {TOOLS.map((tool, i) => (
            <motion.div
              key={tool.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="flex flex-col gap-4"
            >
              {/* Placeholder visual */}
              <div
                className="relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 shadow-sm"
                style={{ background: tool.gradient }}
              >
                {/* Decoración de fondo: puntos / red abstracta */}
                <PlaceholderDecoration variant={tool.key} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <tool.Icon
                    className={`size-16 sm:size-20 ${tool.iconCls} drop-shadow-md`}
                    strokeWidth={1.5}
                  />
                </div>
              </div>

              {/* Label */}
              <p className="text-center text-base sm:text-lg font-black text-[#0a1f4a] uppercase tracking-wide">
                {tool.label}
              </p>
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
// Decoración interna abstracta para cada card
// ────────────────────────────────────────────────────────────────────────────

function PlaceholderDecoration({ variant }: { variant: string }) {
  if (variant === "social") {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-60"
        viewBox="0 0 200 150"
        preserveAspectRatio="none"
        aria-hidden
      >
        <g stroke="#f59e0b40" strokeWidth="0.5" fill="none">
          <line x1="100" y1="75" x2="40"  y2="30" />
          <line x1="100" y1="75" x2="160" y2="40" />
          <line x1="100" y1="75" x2="30"  y2="110" />
          <line x1="100" y1="75" x2="170" y2="115" />
          <line x1="100" y1="75" x2="80"  y2="25" />
          <line x1="100" y1="75" x2="120" y2="125" />
        </g>
        <g fill="#f59e0b">
          <circle cx="40"  cy="30"  r="3" />
          <circle cx="160" cy="40"  r="2.5" />
          <circle cx="30"  cy="110" r="2" />
          <circle cx="170" cy="115" r="3" />
          <circle cx="80"  cy="25"  r="2" />
          <circle cx="120" cy="125" r="2.5" />
        </g>
      </svg>
    );
  }

  if (variant === "crm") {
    return (
      <svg
        className="absolute inset-0 w-full h-full opacity-50"
        viewBox="0 0 200 150"
        preserveAspectRatio="none"
        aria-hidden
      >
        <g fill="#0a1f4a20">
          <rect x="20"  y="20"  width="38" height="32" rx="3" />
          <rect x="68"  y="20"  width="38" height="32" rx="3" />
          <rect x="116" y="20"  width="38" height="32" rx="3" />
          <rect x="164" y="20"  width="14" height="32" rx="3" />
          <rect x="20"  y="60"  width="38" height="32" rx="3" />
          <rect x="68"  y="60"  width="38" height="32" rx="3" />
          <rect x="116" y="60"  width="38" height="32" rx="3" />
          <rect x="20"  y="100" width="38" height="32" rx="3" />
          <rect x="68"  y="100" width="38" height="32" rx="3" />
          <rect x="116" y="100" width="38" height="32" rx="3" />
        </g>
      </svg>
    );
  }

  // territorio — mapa abstracto
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-50"
      viewBox="0 0 200 150"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M60,20 Q90,15 110,30 Q140,40 145,70 Q150,100 130,120 Q105,135 80,125 Q55,115 50,90 Q45,55 60,20 Z"
        fill="#0a1f4a15"
        stroke="#0a1f4a40"
        strokeWidth="0.5"
      />
      <g fill="#0a1f4a">
        <circle cx="80"  cy="50"  r="4" />
        <circle cx="115" cy="65"  r="3" />
        <circle cx="95"  cy="90"  r="5" />
        <circle cx="125" cy="105" r="3" />
        <circle cx="70"  cy="100" r="2.5" />
      </g>
    </svg>
  );
}
