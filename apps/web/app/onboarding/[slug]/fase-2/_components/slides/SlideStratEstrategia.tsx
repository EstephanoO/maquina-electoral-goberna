"use client";

import { motion } from "motion/react";
import { Shield, Users, Zap } from "lucide-react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

const STEP_ICONS = [Shield, Users, Zap] as const;

export function SlideStratEstrategia({ data }: Props) {
  const { estrategia, padron } = data;

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">

      {/* Navy header band */}
      <div
        className="relative px-6 sm:px-10 py-3 shrink-0"
        style={{ background: "linear-gradient(to right, #061633, #0a1f4a, #061633)" }}
      >
        <div className="absolute bottom-0 inset-x-0 h-[4px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-0.5">
          HOJA DE RUTA
        </p>
        <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
          CÓMO GANAR SURCO · 3 PASOS
        </h2>
      </div>

      {/* White body */}
      <div className="flex-1 overflow-auto px-6 sm:px-10 py-4 sm:py-5 flex flex-col gap-4">

        {/* 3-paso cards */}
        <div className="grid grid-cols-3 gap-4 flex-1">
          {estrategia.pasos.map((paso, i) => {
            const Icon = STEP_ICONS[i] ?? Zap;
            return (
              <motion.div
                key={paso.num}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.12, duration: 0.4 }}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 relative overflow-hidden"
                style={{ borderLeft: `4px solid ${paso.color}` }}
              >
                {/* Ghost number */}
                <span
                  className="text-7xl font-black absolute -top-2 -right-2 opacity-[0.08] select-none leading-none"
                  style={{ color: paso.color }}
                >
                  {paso.num}
                </span>
                <Icon className="size-6 shrink-0" style={{ color: paso.color }} />
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-1">
                    PASO {paso.num}
                  </p>
                  <h3 className="text-base font-black text-gray-900 leading-snug">{paso.titulo}</h3>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed flex-1">{paso.descripcion}</p>
                <span
                  className="inline-block text-[8px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 self-start mt-auto border"
                  style={{
                    backgroundColor: paso.color + "18",
                    color: paso.color,
                    borderColor: paso.color + "40",
                  }}
                >
                  {paso.segmento}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Electoral math footer — navy */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="rounded-xl px-5 py-3 text-white shrink-0"
          style={{ background: "#0a1f4a" }}
        >
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {[
              { label: "padrón",                            value: padron.total.toLocaleString("es-PE"),                   color: "text-white" },
              { label: `~${padron.abstenciones_pct}% abs.`, value: "ausentismo",                                           color: "text-white" },
              { label: "votos válidos",                      value: `~${padron.validos_estimados.toLocaleString("es-PE")}`, color: "text-white" },
            ].map((box, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="bg-white/10 rounded-lg px-3 py-1.5 text-center">
                  <p className={`font-bold ${box.color}`}>{box.value}</p>
                  <p className="text-[9px] text-white/50 font-normal">{box.label}</p>
                </div>
                <span className="text-white/30">→</span>
              </div>
            ))}
            <div className="rounded-lg px-3 py-1.5 font-black text-amber-400 border border-amber-400/40 bg-amber-400/10 text-center">
              <p>META: ~{padron.meta_votos.toLocaleString("es-PE")}</p>
              <p className="text-[9px] font-normal text-amber-400/70">25.7% del voto válido</p>
            </div>
          </div>
          <p className="text-[9px] text-white/40 mt-2">
            Patrón 2018: ganó con 25.78%. En campo de 6+ candidatos, 25–30% es suficiente para alcanzar la alcaldía.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
