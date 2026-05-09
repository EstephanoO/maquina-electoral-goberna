"use client";

import { motion } from "motion/react";
import { Map, BarChart3, Smartphone, Database } from "lucide-react";
import { SlideShell } from "./SlideShell";

const PILARES = [
  {
    icon: Map,
    titulo: "Cartografía Política",
    bullets: [
      "Mapas electorales por distrito",
      "Histórico de votación",
      "Densidad de votantes",
    ],
  },
  {
    icon: Database,
    titulo: "Ciencia de Datos",
    bullets: [
      "Modelos predictivos",
      "Segmentación de votantes",
      "Detección de patrones",
    ],
  },
  {
    icon: Smartphone,
    titulo: "Tecnopolítica",
    bullets: [
      "App móvil para brigadas",
      "Validación en tiempo real",
      "Conexión territorial — digital",
    ],
  },
  {
    icon: BarChart3,
    titulo: "Analítica electoral",
    bullets: [
      "Dashboards en vivo",
      "KPIs por jurisdicción",
      "Reportes automatizados",
    ],
  },
];

export function SlideCapacidadGoberna() {
  return (
    <SlideShell kicker="Capacidad Goberna" title="¿QUÉ HACEMOS POR TU CAMPAÑA?">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 px-2 sm:px-4">
        {PILARES.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.titulo}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }}
              className="relative bg-white/[0.04] border border-amber-400/20 rounded-md p-5 sm:p-6 backdrop-blur-sm"
            >
              <div className="absolute -top-3 left-5 bg-amber-400 size-10 flex items-center justify-center rounded-sm shadow-lg">
                <Icon className="size-5 text-[#0a1e4a]" strokeWidth={2.5} />
              </div>
              <h3 className="mt-4 text-xl font-extrabold uppercase tracking-tight text-white leading-tight">
                {p.titulo}
              </h3>
              <ul className="mt-3 space-y-1.5">
                {p.bullets.map((b) => (
                  <li
                    key={b}
                    className="text-sm text-gray-300 leading-snug pl-3 border-l-2 border-amber-400/50"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 text-center text-sm sm:text-base text-amber-400 uppercase tracking-[0.3em] font-bold"
      >
        Tierra · Datos · Digital — todo integrado
      </motion.p>
    </SlideShell>
  );
}
