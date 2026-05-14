"use client";

import { motion } from "motion/react";
import { SlideChromeData } from "../chrome/SlideChromeData";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

/**
 * Slide PROPUESTAS — reskin del antiguo SlideF1Propuestas usando chrome data.
 * Lista cards (1 por propuesta) con número amber + título navy + descripción + chip sector.
 */

interface Props {
  f2: ConsultorFormFase2;
}

export function SlidePropuestas({ f2 }: Props) {
  const propuestas = f2.fase1_rapida?.propuestas ?? [];
  const sorted = [...propuestas].sort((a, b) => a.orden - b.orden);

  return (
    <SlideChromeData title="Propuestas">
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400 italic">
          Sin propuestas registradas.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {sorted.map((p, i) => (
            <motion.article
              key={`${p.orden}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
              className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
            >
              <header className="flex items-start gap-4">
                <span className="font-black text-3xl sm:text-4xl text-amber-400 leading-none tabular-nums tracking-tight">
                  {String(p.orden).padStart(2, "0")}
                </span>
                <h3 className="font-bold text-base sm:text-lg text-[#0a1f4a] leading-tight pt-1">
                  {p.titulo}
                </h3>
              </header>

              <p className="text-sm text-slate-600 leading-relaxed">
                {p.descripcion_corta}
              </p>

              {p.sector ? (
                <span className="self-start mt-1 inline-flex items-center rounded-full bg-[#0a1f4a]/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#0a1f4a]">
                  {p.sector}
                </span>
              ) : null}
            </motion.article>
          ))}
        </div>
      )}
    </SlideChromeData>
  );
}

/** Visibilidad — true si hay al menos una propuesta. */
export function isSlidePropuestasVisible(f2: ConsultorFormFase2): boolean {
  return (f2.fase1_rapida?.propuestas?.length ?? 0) > 0;
}
