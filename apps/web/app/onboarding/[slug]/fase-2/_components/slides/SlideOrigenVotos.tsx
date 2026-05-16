"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

interface Segmento {
  label:   string;
  sub:     string;
  pct:     number;
  color:   string;
  tactica: string;
}

function buildSegmentos(fe: ConsultorFormFase2["formula_electoral"]): {
  items: Segmento[];
  isSimulated: boolean;
} {
  const tierra = fe?.peso_tierra;
  const mar    = fe?.peso_mar;
  const aire   = fe?.peso_aire;

  if (!tierra && !mar && !aire) {
    return {
      isSimulated: true,
      items: [
        { label: "Tierra", sub: "Canvassing & base propia", pct: 50, color: "bg-amber-500",  tactica: "Visitas puerta a puerta, brigadistas" },
        { label: "Mar",    sub: "Eventos & actos públicos",  pct: 30, color: "bg-blue-500",   tactica: "Concentraciones, caravanas, mítines"  },
        { label: "Aire",   sub: "Digital & medios",          pct: 20, color: "bg-purple-500", tactica: "Redes sociales, prensa, publicidad"   },
      ],
    };
  }

  const raw = [
    { label: "Tierra", sub: "Canvassing & base propia", raw: tierra ?? 0, color: "bg-amber-500",  tactica: "Visitas puerta a puerta, brigadistas" },
    { label: "Mar",    sub: "Eventos & actos públicos",  raw: mar    ?? 0, color: "bg-blue-500",   tactica: "Concentraciones, caravanas, mítines"  },
    { label: "Aire",   sub: "Digital & medios",          raw: aire   ?? 0, color: "bg-purple-500", tactica: "Redes sociales, prensa, publicidad"   },
  ];
  const total = raw.reduce((s, r) => s + r.raw, 0) || 100;
  return {
    isSimulated: false,
    items: raw.map((r) => ({ ...r, pct: Math.round((r.raw / total) * 100) })),
  };
}

export function SlideOrigenVotos({ f2 }: Props) {
  const { items, isSimulated } = buildSegmentos(f2.formula_electoral);
  const justificacion = f2.formula_electoral?.justificacion;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Estrategia Electoral</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          De Dónde Vienen Los Votos
        </h2>
        <p className="text-sm text-white/40 mt-1">Distribución de esfuerzo por frente</p>
      </motion.div>

      <div className="flex flex-col gap-4 flex-1">
        {items.map((seg, i) => (
          <motion.div
            key={seg.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.1 }}
            className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-base font-black text-white">{seg.label}</p>
                <p className="text-xs text-white/40">{seg.sub}</p>
              </div>
              <p className="text-3xl font-black text-amber-400 tabular-nums">{seg.pct}%</p>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${seg.pct}%` }}
                transition={{ duration: 0.7, delay: 0.3 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                className={`h-full rounded-full ${seg.color}`}
              />
            </div>
            <p className="text-xs text-white/30 italic">{seg.tactica}</p>
          </motion.div>
        ))}
      </div>

      {justificacion && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="bg-[#0a1e4a]/60 border border-white/5 rounded-xl px-4 py-3"
        >
          <p className="text-xs text-white/40 leading-relaxed italic">{justificacion}</p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.7 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">Fórmula Tierra / Mar / Aire — Goberna</p>
        {isSimulated && <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
