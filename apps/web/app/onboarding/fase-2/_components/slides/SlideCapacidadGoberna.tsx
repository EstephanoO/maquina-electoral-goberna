"use client";

import { motion } from "motion/react";
import { Map, BarChart3, Smartphone, Database } from "lucide-react";
import { SlideShell } from "./SlideShell";

const PILARES = [
  {
    icon: Map,
    titulo: "Cartografía política",
    descripcion:
      "Mapas electorales por distrito, histórico de votación y densidad de votantes.",
  },
  {
    icon: Database,
    titulo: "Ciencia de datos",
    descripcion: "Modelos predictivos, segmentación y detección de patrones.",
  },
  {
    icon: Smartphone,
    titulo: "Tecnopolítica",
    descripcion: "App móvil para brigadas, validación en tiempo real, territorio↔digital.",
  },
  {
    icon: BarChart3,
    titulo: "Analítica electoral",
    descripcion: "Dashboards en vivo, KPIs por jurisdicción, reportes automáticos.",
  },
];

export function SlideCapacidadGoberna() {
  return (
    <SlideShell kicker="Capacidad Goberna" title="¿Qué hacemos por tu campaña?">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="px-2 sm:px-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          {PILARES.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.titulo}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.4 }}
                className="group"
              >
                <div className="flex items-start gap-4">
                  <Icon
                    className="size-5 text-amber-400 shrink-0 mt-1"
                    strokeWidth={1.5}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg sm:text-xl font-medium text-white tracking-tight leading-snug">
                      {p.titulo}
                    </h3>
                    <p className="mt-1.5 text-sm sm:text-base text-white/60 leading-relaxed">
                      {p.descripcion}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </SlideShell>
  );
}
