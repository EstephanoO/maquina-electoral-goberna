"use client";

import { motion } from "motion/react";
import { Globe, DollarSign, Users, Zap, Radio } from "lucide-react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

const ICON_MAP = {
  Globe, DollarSign, Users, Zap, Radio,
} as const;

type IconName = keyof typeof ICON_MAP;

function getIcon(name: string) {
  return ICON_MAP[name as IconName] ?? Globe;
}

export function SlideStratDiagnostico({ data }: Props) {
  const { diagnostico } = data;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col pt-16 pb-4 px-4 sm:px-8 gap-5">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-red-400/70 mb-1">
          DIAGNÓSTICO DIGITAL · LO QUE EL VECINO VE HOY
        </p>
        <h2 className="text-2xl sm:text-3xl font-black text-white">
          ¿QUIÉN ES JORGE VALDEZ?
        </h2>
      </motion.div>

      {/* 2×2 CRÍTICO grid */}
      <div className="grid grid-cols-2 gap-3 flex-1">
        {diagnostico.critico.map((item, i) => {
          const Icon = getIcon(item.icono);
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
              className="relative rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex flex-col gap-2 overflow-hidden"
            >
              <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest text-red-400 border border-red-500/40 rounded px-1.5 py-0.5 rotate-[-3deg]">
                CRÍTICO
              </span>
              <Icon className="size-8 text-red-400" />
              <p className="text-sm font-black text-white pr-14">{item.label}</p>
              <p className="text-xs text-white/50 leading-relaxed">{item.detalle}</p>
            </motion.div>
          );
        })}
      </div>

      {/* ACTIVO full-width + PentaD mini-chart */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="relative rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-4 overflow-hidden"
      >
        <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest text-amber-400 border border-amber-500/40 rounded px-1.5 py-0.5 rotate-[-2deg]">
          ACTIVO
        </span>
        <Radio className="size-8 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-black text-white">Exitosa Te Escucha · 1.22M suscriptores</p>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">
            Show semanal propio en Radio Exitosa (22h–00h) desde abril 2024. Activo único: ningún competidor tiene su propia plataforma mediática.
          </p>
        </div>

        {/* PentaD mini-chart */}
        <div className="shrink-0 text-center mr-8">
          <p className="text-[8px] font-semibold uppercase tracking-widest text-white/40 mb-2">PentaD</p>
          <div className="flex items-end gap-3" style={{ height: "64px" }}>
            {([
              { label: "Valdez", score: diagnostico.pentad.valdez, color: "#fbbf24" },
              { label: "Gómez",  score: diagnostico.pentad.gomez,  color: "#f97316" },
              { label: "Vera",   score: diagnostico.pentad.vera,   color: "#64748b" },
            ] as const).map((d) => (
              <div key={d.label} className="flex flex-col items-center gap-1">
                <span className="text-[9px] font-black" style={{ color: d.color }}>{d.score}</span>
                <motion.div
                  className="w-7 rounded-t"
                  style={{ backgroundColor: d.color + "55" }}
                  initial={{ height: 0 }}
                  animate={{ height: `${(d.score / 10) * 48}px` }}
                  transition={{ delay: 0.65, duration: 0.6, ease: "easeOut" }}
                />
                <span className="text-[8px] text-white/30">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
