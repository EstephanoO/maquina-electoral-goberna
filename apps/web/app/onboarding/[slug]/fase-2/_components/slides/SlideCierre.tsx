"use client";

import { motion } from "motion/react";
import { SlideChromeCinematic } from "../chrome/SlideChromeCinematic";
import { TagTilt } from "../chrome/TagTilt";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

/**
 * Slide CIERRE — mix entre p.19 (section divider con nubes) y p.24 (GRACIAS).
 * Layout cinematic, H1 enorme "WAR ROOM GOBERNA", tag amber tilt, CTA.
 */

const EJE_LABEL: Record<string, string> = {
  PLAN_DE_GOBIERNO:    "Plan de Gobierno",
  "EQUIPO_DE_CAMPAÑA": "Equipo de Campaña",
  SIMPATIA:            "Simpatía",
  ESPERANZA:           "Esperanza",
  ODIO:                "Indignación",
  MIEDO:               "Miedo",
};

interface Props {
  f2?: ConsultorFormFase2;
}

export function SlideCierre({ f2 }: Props) {
  const eje = f2?.fase1_rapida?.estrategia?.eje_emocional;
  const ejeLabel = eje ? EJE_LABEL[eje] ?? eje : null;

  return (
    <SlideChromeCinematic accent="amber">
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 py-16 text-center gap-8">
        <motion.h1
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black uppercase tracking-tight text-white leading-[0.9] drop-shadow-[0_4px_24px_rgba(2,10,30,0.6)]"
        >
          War Room
          <br />
          Goberna
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          <TagTilt
            label="Activá tu campaña ahora"
            tone="amber"
            size="lg"
            rotate={-3}
          />
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.5 }}
          type="button"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-400 hover:bg-amber-300 px-8 py-4 text-base sm:text-lg font-black uppercase tracking-wider text-[#0a1f4a] shadow-[0_8px_32px_rgba(245,158,11,0.4)] hover:shadow-[0_12px_40px_rgba(245,158,11,0.5)] transition-all"
        >
          Solicitar War Room
        </motion.button>

        {ejeLabel ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.75 }}
            className="mt-8 text-xs sm:text-sm uppercase tracking-[0.3em] text-white/60 font-medium"
          >
            Tu campaña:{" "}
            <span className="text-white/90 font-bold">{ejeLabel}</span>
          </motion.p>
        ) : null}
      </div>
    </SlideChromeCinematic>
  );
}

/** Visibilidad — siempre visible. */
export function isSlideCierreVisible(): boolean {
  return true;
}
