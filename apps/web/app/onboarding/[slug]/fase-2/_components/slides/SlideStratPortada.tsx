"use client";

import { motion } from "motion/react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratPortada({ data }: Props) {
  const { candidato, padron } = data;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col">
      <div className="flex flex-1 overflow-hidden rounded-2xl mt-16 mb-4">
        {/* Left — photo 55% */}
        <div className="relative w-[55%] shrink-0 overflow-hidden">
          <img
            src={candidato.foto}
            alt={candidato.nombre}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#020a1e]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020a1e]/60 via-transparent to-transparent" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="absolute bottom-6 left-6"
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-amber-400/70 mb-1">
              GOBERNA · DIAGNÓSTICO ELECTORAL 2026
            </p>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-none tracking-tight drop-shadow-lg">
              JORGE VALDEZ
              <br />
              <span className="text-amber-400">OYOLA</span>
            </h1>
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.15em] text-white/60 mt-2">
              Alcaldía Santiago de Surco · ERM 2026
            </p>
          </motion.div>
        </div>

        {/* Right — context 45% */}
        <div className="flex-1 flex flex-col justify-center px-8 py-6 gap-6">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <div className="border-l-[3px] border-amber-400 pl-4 mb-6">
              <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-amber-400/60 mb-1">
                Distrito
              </p>
              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                SANTIAGO DE SURCO
              </h2>
              <p className="text-xs text-white/50 mt-1 uppercase tracking-wider">Lima · Perú</p>
            </div>

            <div className="flex flex-col gap-3">
              {([
                { label: "Electores padrón", value: "353,867",   accent: "#fbbf24" },
                { label: "Elección general", value: "5 oct 2026", accent: "#3b82f6" },
                { label: "PentaD Score",     value: "3.4 / 10",  accent: "#ef4444" },
              ] as const).map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
                  className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                >
                  <div className="w-1 h-8 rounded-full" style={{ backgroundColor: stat.accent }} />
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-white/40">{stat.label}</p>
                    <p className="text-lg font-black text-white">{stat.value}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.4 }}
            className="mt-auto pt-4 border-t border-white/10"
          >
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/30">
              Diagnóstico estratégico · Confidencial · Goberna 2026
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
