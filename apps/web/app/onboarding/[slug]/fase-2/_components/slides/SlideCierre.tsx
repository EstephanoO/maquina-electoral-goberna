"use client";

import { motion } from "motion/react";

import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeCinematic } from "../chrome/SlideChromeCinematic";
import { TagTilt } from "../chrome/TagTilt";

/**
 * Slide CIERRE — mix entre p.19 (section divider con nubes) y p.24 (GRACIAS).
 * Layout cinematic con urgencia: tag amber arriba, H1 "WAR ROOM / GOBERNA"
 * enorme, countdown card a la elección, 2 CTAs lado a lado, caption con eje.
 */

const EJE_LABEL: Record<string, string> = {
  PLAN_DE_GOBIERNO: "Plan de gobierno",
  "EQUIPO_DE_CAMPAÑA": "Equipo de campaña",
  SIMPATIA: "Simpatía",
  ESPERANZA: "Esperanza",
  ODIO: "Confrontación",
  MIEDO: "Estabilidad",
};

interface Props {
  f2?: ConsultorFormFase2;
}

export function SlideCierre({ f2 }: Props) {
  const eje = f2?.fase1_rapida?.estrategia?.eje_emocional;
  const ejeLabel = eje ? EJE_LABEL[eje] ?? eje : null;
  const fechaEleccion = f2?.fase1_rapida?.postulacion?.fecha_eleccion;
  const { dias, esEstimado } = computeDaysToElection(fechaEleccion);

  return (
    <SlideChromeCinematic accent="amber">
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 sm:px-12 py-14 text-center">
        <div className="flex flex-col items-center gap-7 sm:gap-8 max-w-4xl w-full">
          {/* Tag de urgencia */}
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.55,
              ease: [0.34, 1.4, 0.64, 1],
            }}
          >
            <TagTilt
              label="ACTIVÁ TU CAMPAÑA AHORA"
              tone="amber"
              size="lg"
              rotate={-2}
            />
          </motion.div>

          {/* H1 War Room Goberna */}
          <motion.h1
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="text-white font-black uppercase tracking-tight leading-[0.9] text-6xl sm:text-7xl lg:text-8xl"
            style={{ textShadow: "0 6px 32px rgba(2,10,30,0.75)" }}
          >
            <span className="block">War Room</span>
            <span className="block">Goberna</span>
          </motion.h1>

          {/* Countdown card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="relative mt-2"
          >
            <div
              className="flex flex-col items-center px-10 sm:px-14 py-6 sm:py-7 rounded-sm"
              style={{
                background: "#fbbf24",
                boxShadow:
                  "8px 8px 0 rgba(2,10,30,0.45), 0 0 0 1px rgba(2,10,30,0.1)",
              }}
            >
              <motion.span
                className="text-6xl sm:text-7xl font-black text-[#0a1f4a] leading-none tracking-tight"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: [0.4, 0, 0.6, 1],
                  times: [0, 0.5, 1],
                }}
              >
                {dias}
              </motion.span>
              <span className="mt-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-[#0a1f4a]">
                Días para la elección
              </span>
              {esEstimado ? (
                <span className="mt-1 text-[10px] uppercase tracking-widest text-[#0a1f4a]/60 font-medium">
                  Estimado
                </span>
              ) : null}
            </div>
          </motion.div>

          {/* CTAs lado a lado */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.55 }}
            className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mt-2"
          >
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-amber-400 hover:bg-amber-300 px-8 py-4 text-base font-black uppercase tracking-wider text-[#0a1f4a] shadow-[0_8px_32px_rgba(245,158,11,0.4)] hover:shadow-[0_12px_40px_rgba(245,158,11,0.55)] transition-all"
            >
              Solicitar War Room
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border-2 border-white/80 hover:border-white px-8 py-[14px] text-base font-black uppercase tracking-wider text-white hover:bg-white hover:text-[#0a1f4a] transition-all"
            >
              Agendar reunión
            </button>
          </motion.div>

          {/* Caption con eje */}
          {ejeLabel ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ delay: 1.0, duration: 0.6 }}
              className="text-xs sm:text-sm tracking-[0.2em] uppercase text-white/70 font-medium mt-1"
            >
              Tu campaña:{" "}
              <span className="text-white font-bold">{ejeLabel}</span>
            </motion.p>
          ) : null}
        </div>
      </div>
    </SlideChromeCinematic>
  );
}

/** Visibilidad — siempre visible. */
export function isSlideCierreVisible(): boolean {
  return true;
}

/**
 * Calcular días restantes a la fecha de elección. Si no hay fecha o es
 * inválida, devuelve 180 (default) flag esEstimado=true.
 */
function computeDaysToElection(fecha: string | undefined): {
  dias: number;
  esEstimado: boolean;
} {
  if (!fecha) return { dias: 180, esEstimado: true };
  const target = new Date(fecha);
  if (Number.isNaN(target.getTime())) {
    return { dias: 180, esEstimado: true };
  }
  const diffMs = target.getTime() - Date.now();
  const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (dias <= 0) return { dias: 0, esEstimado: false };
  return { dias, esEstimado: false };
}
