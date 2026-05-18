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
    <div className="min-h-full bg-[#020a1e] flex flex-col pt-16 pb-4 px-4 sm:px-8 gap-6">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-amber-400/60 mb-2">
          SITUACIÓN ACTUAL · SURCO 2026
        </p>
        <h2 className="text-2xl sm:text-3xl font-black text-white">¿QUIÉN LIDERA LA CARRERA?</h2>
        <p className="text-xs text-white/40 mt-1">
          {encuesta.fuente} · {encuesta.fecha} · {encuesta.tipo}
        </p>
      </motion.div>

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
              className="flex items-center gap-3"
            >
              <div className="w-48 shrink-0 text-right">
                <p className={`text-sm font-bold ${isLeader ? "text-white" : "text-white/80"}`}>
                  {c.nombre}
                </p>
                <p className="text-[9px] uppercase tracking-wider" style={{ color: c.color }}>
                  {c.partido}
                </p>
              </div>
              <div className="flex-1 relative h-8 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: isLeader ? "#ef4444" : c.color + "99" }}
                  initial={{ width: "0%" }}
                  animate={{ width: `${barWidth}%` }}
                  transition={{ delay: 0.25 + i * 0.08, duration: 0.7, ease: "easeOut" }}
                />
                {isLeader && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase tracking-wider text-white/70">
                    LÍDER
                  </span>
                )}
              </div>
              <div className="w-14 shrink-0 text-right">
                <span className={`text-sm font-black ${isLeader ? "text-red-400" : "text-white/60"}`}>
                  {c.pct.toFixed(1)}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4 }}
        className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-5 py-3"
      >
        <p className="text-xs text-amber-300 leading-relaxed">
          <span className="font-black">★ Campo abierto:</span> Con Carlos Bruce ausente (postula a Lima),
          Surco 2026 no tiene incumbente. Jean Pierre Combe ganó 2018 con solo{" "}
          <span className="font-black text-amber-400">25.78%</span> en campo fragmentado de 18 candidatos.
          Quien consolida primero, gana.
        </p>
      </motion.div>
    </div>
  );
}
