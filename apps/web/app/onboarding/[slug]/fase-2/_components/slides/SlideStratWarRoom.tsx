"use client";

import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratWarRoom({ data }: Props) {
  const { warRoom } = data;

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">

      {/* Navy header band */}
      <div
        className="relative px-6 sm:px-10 py-3 shrink-0"
        style={{ background: "linear-gradient(to right, #061633, #0a1f4a, #061633)" }}
      >
        <div className="absolute bottom-0 inset-x-0 h-[4px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-0.5">
          GOBERNA · CONSULTORÍA POLÍTICA
        </p>
        <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
          WAR ROOM · PROPUESTA DE TRABAJO
        </h2>
      </div>

      {/* White body */}
      <div className="flex-1 overflow-auto px-6 sm:px-10 py-4 sm:py-5">
        <div className="grid grid-cols-2 gap-6 h-full">

          {/* Left — checklist items on white bg */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="flex flex-col gap-2"
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">
              SERVICIOS INCLUIDOS
            </p>
            {warRoom.items.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.06, duration: 0.3 }}
                className="bg-white rounded-lg border border-gray-200 p-3 flex gap-3 items-start shadow-sm"
              >
                <CheckCircle2 className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-sm font-medium text-gray-800 leading-snug">{item}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Right — navy CTA card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="rounded-2xl p-6 h-full flex flex-col text-white"
            style={{ background: "#0a1f4a" }}
          >
            {/* Goberna "G" shield */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full border-2 border-amber-400/60 bg-amber-400/10 flex items-center justify-center shrink-0">
                <span className="text-amber-400 font-black text-xl">G</span>
              </div>
              <div>
                <span className="text-2xl font-black text-amber-400 tracking-widest">GOBERNA</span>
                <p className="text-[9px] text-white/50 uppercase tracking-[0.2em]">
                  Consultoría Política Estratégica
                </p>
              </div>
            </div>

            <div className="w-12 h-px bg-amber-400/30 mb-4" />

            <p className="text-sm text-white/70 leading-relaxed mb-4">
              Diseño e implementación de campañas ganadoras con tecnología, estrategia y equipo humano experto.
            </p>

            {/* Title + steps */}
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-3">
              Próximos pasos
            </p>
            <div className="flex flex-col gap-2 flex-1">
              {[
                "Reunión de alineación estratégica",
                "Definición de hoja de ruta",
                "Kick-off campaña digital",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 font-black text-xs shrink-0 mt-0.5">{i + 1}.</span>
                  <span className="text-xs text-white/70 leading-snug">{step}</span>
                </div>
              ))}
            </div>

            {/* Confidential badge */}
            <div
              className="mt-4 rounded-full px-4 py-2 text-center"
              style={{ backgroundColor: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)" }}
            >
              <p className="text-[8px] font-semibold uppercase tracking-[0.25em] text-amber-400/80">
                SURCO 2026 · DIAGNÓSTICO ESTRATÉGICO CONFIDENCIAL
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
