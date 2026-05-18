"use client";

import { motion } from "motion/react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratHerramientas({ data }: Props) {
  const { herramientas } = data;

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">

      {/* Navy header band */}
      <div
        className="relative px-6 sm:px-10 py-3 shrink-0"
        style={{ background: "linear-gradient(to right, #061633, #0a1f4a, #061633)" }}
      >
        <div className="absolute bottom-0 inset-x-0 h-[4px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-0.5">
          PLATAFORMA GOBERNA
        </p>
        <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
          HERRAMIENTAS DE CAMPAÑA
        </h2>
      </div>

      {/* White body */}
      <div className="flex-1 overflow-auto px-6 sm:px-10 py-4 sm:py-5">
        <div className="grid grid-cols-3 gap-4 h-full">
          {herramientas.map((tool, i) => (
            <motion.div
              key={tool.nombre}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }}
              className="flex flex-col bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden"
            >
              {/* Image */}
              <div className="relative h-40 shrink-0 overflow-hidden">
                <img
                  src={tool.imagen}
                  alt={tool.nombre}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Navy top stripe */}
              <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400 shrink-0" />

              {/* Card body */}
              <div className="flex flex-col gap-2 p-4 flex-1">
                <h3 className="text-lg font-black text-[#0a1f4a]">{tool.nombre}</h3>
                <p className="text-sm text-gray-600 leading-relaxed flex-1">{tool.descripcion}</p>
                <span
                  className="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 mt-2 self-start"
                >
                  {tool.badge}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
