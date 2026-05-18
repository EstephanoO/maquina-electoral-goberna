"use client";

import { motion } from "motion/react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratEncuesta({ data }: Props) {
  const { encuesta } = data;
  const maxPct = Math.max(...encuesta.candidatos.map((c) => c.pct));

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">

      {/* Navy header band */}
      <div
        className="relative px-6 sm:px-10 py-3 shrink-0"
        style={{ background: "linear-gradient(to right, #061633, #0a1f4a, #061633)" }}
      >
        <div className="absolute bottom-0 inset-x-0 h-[4px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-0.5">
          SITUACIÓN ELECTORAL · ABRIL 2026
        </p>
        <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
          ENCUESTA DE INTENCIÓN DE VOTO
        </h2>
      </div>

      {/* White body */}
      <div className="flex-1 overflow-auto px-6 sm:px-10 py-4 sm:py-5 flex flex-col gap-4">

        {/* Source + date pills */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center gap-2 flex-wrap"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
            {encuesta.fuente}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
            {encuesta.fecha}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
            {encuesta.tipo}
          </span>
        </motion.div>

        {/* Candidate bars */}
        <div className="flex flex-col gap-3 flex-1 justify-center">
          {encuesta.candidatos.map((c, i) => {
            const barWidth = (c.pct / maxPct) * 100;
            const isLeader = i === 0;
            return (
              <motion.div
                key={c.nombre}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center gap-3"
                style={isLeader ? { borderLeft: "4px solid #ef4444" } : undefined}
              >
                <div className="w-44 shrink-0 text-right">
                  <p className={`text-sm font-bold ${isLeader ? "text-gray-900" : "text-gray-700"}`}>
                    {c.nombre}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: c.color }}>
                    {c.partido}
                  </p>
                </div>
                <div className="flex-1 relative h-8 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ backgroundColor: isLeader ? "#ef4444" : c.color + "aa" }}
                    initial={{ width: "0%" }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ delay: 0.25 + i * 0.08, duration: 0.7, ease: "easeOut" }}
                  />
                  {isLeader && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase tracking-wider text-white">
                      LÍDER
                    </span>
                  )}
                </div>
                <div className="w-14 shrink-0 text-right">
                  <span className={`text-sm font-black ${isLeader ? "text-red-600" : "text-gray-500"}`}>
                    {c.pct.toFixed(1)}%
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer insight box */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="rounded-xl p-4 text-white shrink-0"
          style={{ background: "#0a1f4a" }}
        >
          <p className="text-xs leading-relaxed text-white/80">
            <span className="font-black text-amber-400">★ Campo abierto:</span>{" "}
            Con Carlos Bruce ausente (postula a Lima), Surco 2026 no tiene incumbente. Jean Pierre Combe
            ganó 2018 con solo{" "}
            <span className="font-black text-amber-400">25.78%</span> en campo fragmentado de 18 candidatos.
            Quien consolida primero, gana.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
