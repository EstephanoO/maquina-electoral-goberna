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
    <div className="h-full bg-white flex flex-col overflow-hidden">

      {/* Navy header band */}
      <div
        className="relative px-6 sm:px-10 py-3 shrink-0"
        style={{ background: "linear-gradient(to right, #061633, #0a1f4a, #061633)" }}
      >
        <div className="absolute bottom-0 inset-x-0 h-[4px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-0.5">
          ANÁLISIS DIGITAL
        </p>
        <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
          DIAGNÓSTICO DIGITAL · JORGE VALDEZ
        </h2>
      </div>

      {/* White body */}
      <div className="flex-1 overflow-auto px-6 sm:px-10 py-4 sm:py-5 flex flex-col gap-4">

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
                className="relative bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2 overflow-hidden"
                style={{ borderLeft: "4px solid #ef4444" }}
              >
                <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest text-red-600 border border-red-300 bg-red-50 rounded px-1.5 py-0.5 rotate-[-3deg]">
                  CRÍTICO
                </span>
                <div className="w-9 h-9 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <Icon className="size-5 text-red-600" />
                </div>
                <p className="text-sm font-black text-gray-900 pr-14">{item.label}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{item.detalle}</p>
              </motion.div>
            );
          })}
        </div>

        {/* ACTIVO full-width + PentaD mini-chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="rounded-xl p-4 flex items-start gap-4 overflow-hidden shrink-0"
          style={{ background: "linear-gradient(135deg, #0a1f4a, #1a2c5e)" }}
        >
          <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5 rotate-[-2deg]">
            ACTIVO
          </span>
          <div className="w-9 h-9 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center shrink-0 mt-0.5">
            <Radio className="size-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-white">Exitosa Te Escucha · 1.22M suscriptores</p>
            <p className="text-xs text-white/60 mt-1 leading-relaxed">
              Show semanal propio en Radio Exitosa (22h–00h) desde abril 2024. Activo único: ningún competidor tiene su propia plataforma mediática.
            </p>
          </div>

          {/* PentaD mini-chart */}
          <div className="shrink-0 text-center mr-4">
            <p className="text-[8px] font-semibold uppercase tracking-widest text-white/50 mb-2">PentaD</p>
            <div className="flex items-end gap-3" style={{ height: "64px" }}>
              {([
                { label: "Valdez", score: diagnostico.pentad.valdez, color: "#fbbf24" },
                { label: "Gómez",  score: diagnostico.pentad.gomez,  color: "#f97316" },
                { label: "Vera",   score: diagnostico.pentad.vera,   color: "#94a3b8" },
              ] as const).map((d) => (
                <div key={d.label} className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-black" style={{ color: d.color }}>{d.score}</span>
                  <motion.div
                    className="w-7 rounded-t"
                    style={{ backgroundColor: d.color + "66" }}
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.score / 10) * 48}px` }}
                    transition={{ delay: 0.65, duration: 0.6, ease: "easeOut" }}
                  />
                  <span className="text-[8px] text-white/40">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
