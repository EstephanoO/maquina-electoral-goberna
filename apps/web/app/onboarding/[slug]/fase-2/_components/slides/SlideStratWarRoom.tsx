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
    <div className="min-h-full bg-[#020a1e] flex flex-col pt-16 pb-4 px-4 sm:px-8 gap-5">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-amber-400/60 mb-1">
          GOBERNA · PROPUESTA
        </p>
        <h2 className="text-2xl sm:text-3xl font-black text-white">LA CAMPAÑA COMPLETA</h2>
      </motion.div>

      <div className="grid grid-cols-2 gap-6 flex-1">
        {/* Left — checklist */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="rounded-xl border border-white/10 bg-[#0a1e4a] p-5 flex flex-col gap-3"
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-400/60 mb-1">
            SERVICIOS INCLUIDOS
          </p>
          <div className="flex flex-col gap-2.5 flex-1">
            {warRoom.items.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.06, duration: 0.3 }}
                className="flex items-start gap-2.5"
              >
                <CheckCircle2 className="size-4 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-xs text-white/80 leading-snug">{item}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right — Goberna branding */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="rounded-xl border border-amber-400/20 overflow-hidden flex flex-col"
          style={{ background: "linear-gradient(135deg, #0a1e4a 0%, #020a1e 60%, #0a1e4a 100%)" }}
        >
          <div className="p-6 flex flex-col gap-4 flex-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-amber-400/60 flex items-center justify-center shrink-0">
                <span className="text-amber-400 font-black text-lg">G</span>
              </div>
              <div>
                <span className="text-2xl font-black text-amber-400 tracking-widest">GOBERNA</span>
                <p className="text-[9px] text-white/40 uppercase tracking-[0.2em]">
                  Consultoría Política Estratégica
                </p>
              </div>
            </div>

            <div className="w-12 h-px bg-amber-400/30" />

            <p className="text-sm text-white/70 leading-relaxed">
              Diseño e implementación de campañas ganadoras con tecnología, estrategia y equipo humano experto.
            </p>

            <div className="flex flex-col gap-3 mt-auto">
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-center">
                <p className="text-xs font-black text-amber-400 uppercase tracking-wider">PRÓXIMOS PASOS</p>
                <p className="text-[10px] text-white/60 mt-1 leading-relaxed">
                  Reunión de alineación estratégica · Definición de hoja de ruta · Kick-off campaña digital
                </p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-center">
                <p className="text-[8px] font-semibold uppercase tracking-[0.25em] text-white/30">
                  SURCO 2026 · DIAGNÓSTICO ESTRATÉGICO CONFIDENCIAL
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
