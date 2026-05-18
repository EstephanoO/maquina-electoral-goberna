"use client";

import { motion } from "motion/react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratHerramientas({ data }: Props) {
  const { herramientas } = data;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col pt-16 pb-4 px-4 sm:px-8 gap-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-amber-400/60 mb-1">
          GOBERNA TECHNOLOGY
        </p>
        <h2 className="text-2xl sm:text-3xl font-black text-white">LAS HERRAMIENTAS DE LA CAMPAÑA</h2>
        <p className="text-xs text-white/40 mt-1">Tecnología y equipo para dirigir campañas exitosas</p>
      </motion.div>

      <div className="grid grid-cols-3 gap-4 flex-1">
        {herramientas.map((tool, i) => (
          <motion.div
            key={tool.nombre}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }}
            className="flex flex-col rounded-xl border border-white/10 bg-white/5 overflow-hidden"
          >
            <div className="relative h-44 shrink-0 overflow-hidden">
              <img
                src={tool.imagen}
                alt={tool.nombre}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020a1e]/80 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tool.color }} />
                <span
                  className="text-[9px] font-black uppercase tracking-widest"
                  style={{ color: tool.color }}
                >
                  {tool.nombre}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-4 flex-1">
              <h3 className="text-sm font-black text-white">{tool.nombre}</h3>
              <p className="text-xs text-white/60 leading-relaxed flex-1">{tool.descripcion}</p>
              <span
                className="inline-block text-[8px] font-bold uppercase tracking-widest rounded-full px-2.5 py-1 self-start"
                style={{ backgroundColor: tool.color + "22", color: tool.color }}
              >
                {tool.badge}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
