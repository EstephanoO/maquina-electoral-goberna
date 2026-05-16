"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

/**
 * Slide PROPUESTAS — reskin CRÍTICO.
 * Grid de cards 2-3 por fila: número grande tenue + sector pill amber + título + descripción.
 */

interface Props {
  f2: ConsultorFormFase2;
}

const SIM_PROPUESTAS = [
  {
    orden: 1,
    titulo: "Agua para todos",
    descripcion_corta: "Acceso universal a agua potable en zonas rurales",
    sector: "Infraestructura",
    icono: undefined,
  },
  {
    orden: 2,
    titulo: "Empleo productivo",
    descripcion_corta: "Programa de capacitación y empleo para jóvenes",
    sector: "Economía",
    icono: undefined,
  },
  {
    orden: 3,
    titulo: "Seguridad ciudadana",
    descripcion_corta: "Fortalecer la policía comunitaria",
    sector: "Seguridad",
    icono: undefined,
  },
];

export function SlidePropuestas({ f2 }: Props) {
  const raw = f2.fase1_rapida?.propuestas ?? [];
  const isSimulated = raw.length === 0;
  const sorted = isSimulated
    ? SIM_PROPUESTAS
    : [...raw].sort((a, b) => a.orden - b.orden);

  const ejeTematico = f2.fase1_rapida?.estrategia?.tipo_campana;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-end justify-between"
      >
        <div>
          <SlideLabel>Propuestas de Campaña</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Qué ofrece tu candidatura
          </h2>
          {ejeTematico && (
            <p className="text-sm text-white/40 mt-1">
              Campaña{" "}
              <span className="text-amber-400 font-semibold capitalize">
                {ejeTematico.toLowerCase()}
              </span>
            </p>
          )}
        </div>
        {isSimulated && (
          <p className="text-[10px] italic text-amber-400/20">datos simulados</p>
        )}
      </motion.div>

      {/* ── Grid de propuestas ─────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <p className="text-sm text-white/30 italic">Sin propuestas registradas.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 flex-1">
          {sorted.map((p, i) => (
            <motion.article
              key={`${p.orden}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.07 }}
              className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5 flex flex-col gap-3"
            >
              {/* Número de orden */}
              <div className="text-4xl font-black text-white/10 leading-none select-none">
                {String(p.orden).padStart(2, "0")}
              </div>

              {/* Sector pill */}
              {p.sector && (
                <span className="self-start text-[10px] font-semibold uppercase tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                  {p.sector}
                </span>
              )}

              {/* Título */}
              <h3 className="text-base font-bold text-white leading-tight mt-1">
                {p.titulo}
              </h3>

              {/* Descripción */}
              <p className="text-sm text-white/50 leading-relaxed">
                {p.descripcion_corta}
              </p>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}

/** Visibilidad — true si hay al menos una propuesta. */
export function isSlidePropuestasVisible(f2: ConsultorFormFase2): boolean {
  return (f2.fase1_rapida?.propuestas?.length ?? 0) > 0;
}
