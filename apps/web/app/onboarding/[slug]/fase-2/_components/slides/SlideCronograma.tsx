"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

type Hito = { key: string; titulo: string; fecha?: string; descripcion?: string };

const SIM_HITOS: Hito[] = [
  { key: "inicio",     titulo: "Lanzamiento de campaña",    fecha: "Mar 2026", descripcion: "Acto de presentación oficial"        },
  { key: "canvassing", titulo: "Inicio de canvassing",      fecha: "Abr 2026", descripcion: "Brigadas en los distritos clave"     },
  { key: "debate",     titulo: "Debate público municipal",  fecha: "May 2026", descripcion: "Exposición de propuestas en TV local" },
  { key: "cierre",     titulo: "Cierre de campaña",         fecha: "Jun 2026", descripcion: "Concentración final + movilización"   },
  { key: "eleccion",   titulo: "Día de elecciones",         fecha: "Jul 2026", descripcion: "Meta: movilizar base propia 100%"     },
];

const KEY_COLOR: Record<string, string> = {
  eleccion:   "bg-amber-400 text-black",
  debate:     "bg-amber-400 text-black",
  cierre:     "bg-emerald-500 text-white",
  inicio:     "bg-emerald-500 text-white",
  canvassing: "bg-blue-500 text-white",
};

function hitoColor(key: string): string {
  return KEY_COLOR[key] ?? "bg-white/20 text-white";
}

export function SlideCronograma({ f2 }: Props) {
  const hitos       = f2.recorrido_estrategico?.hitos ?? [];
  const isSimulated = hitos.length === 0;
  const displayHitos: Hito[] = isSimulated ? SIM_HITOS : hitos;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Planificación de Campaña</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Cronograma de Campaña
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {displayHitos.length} hitos planificados
        </p>
      </motion.div>

      <div className="flex flex-col gap-3 flex-1 relative pl-8">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-white/10" />
        {displayHitos.map((hito, i) => (
          <motion.div
            key={hito.key}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.08 + i * 0.07 }}
            className="relative bg-[#0a1e4a] border border-white/10 rounded-xl p-4"
          >
            <div className="absolute -left-5 top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/20" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {hito.fecha && (
                  <p className="text-[10px] text-amber-400/60 font-semibold uppercase tracking-widest mb-0.5">
                    {hito.fecha}
                  </p>
                )}
                <p className="text-sm font-bold text-white leading-snug">{hito.titulo}</p>
                {hito.descripcion && (
                  <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{hito.descripcion}</p>
                )}
              </div>
              <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${hitoColor(hito.key)}`}>
                {hito.key.replace(/_/g, " ")}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">Fuente: recorrido estratégico del consultor</p>
        {isSimulated && <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
