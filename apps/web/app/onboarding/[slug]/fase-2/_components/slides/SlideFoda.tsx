"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

/**
 * Slide FODA — reskin CRÍTICO (azul marino + gold + sellos).
 * Grid 2×2: Fortalezas / Oportunidades / Debilidades / Amenazas.
 */

interface Props {
  f2: ConsultorFormFase2;
}

const SIM_FORTALEZAS    = ["Experiencia en gestión pública", "Conocimiento del territorio", "Red de alianzas locales"];
const SIM_DEBILIDADES   = ["Baja presencia en redes sociales", "Sin web oficial", "Poca visibilidad mediática"];
const SIM_OPORTUNIDADES = ["Alta demanda de cambio en el electorado", "Espacio en el segmento joven"];
const SIM_AMENAZAS      = ["Candidato consolidado con estructura", "Recursos limitados vs adversarios"];

interface CuadranteConfig {
  key: "fortalezas" | "debilidades" | "oportunidades" | "amenazas";
  letra: string;
  label: string;
  /** Tailwind classes for card bg + border */
  cardCls: string;
  /** Tailwind classes for header text accent */
  headerCls: string;
  /** Bullet point color */
  bulletCls: string;
  icon: string;
}

const CUADRANTES: CuadranteConfig[] = [
  {
    key:       "fortalezas",
    letra:     "F",
    label:     "Fortalezas",
    cardCls:   "bg-emerald-500/10 border-emerald-500/20",
    headerCls: "text-emerald-400",
    bulletCls: "text-emerald-400",
    icon:      "✓",
  },
  {
    key:       "oportunidades",
    letra:     "O",
    label:     "Oportunidades",
    cardCls:   "bg-blue-500/10 border-blue-500/20",
    headerCls: "text-blue-400",
    bulletCls: "text-blue-400",
    icon:      "⬆",
  },
  {
    key:       "debilidades",
    letra:     "D",
    label:     "Debilidades",
    cardCls:   "bg-red-500/10 border-red-500/20",
    headerCls: "text-red-400",
    bulletCls: "text-red-400",
    icon:      "✗",
  },
  {
    key:       "amenazas",
    letra:     "A",
    label:     "Amenazas",
    cardCls:   "bg-orange-500/10 border-orange-500/20",
    headerCls: "text-orange-400",
    bulletCls: "text-orange-400",
    icon:      "⚠",
  },
];

const SIM_DATA: Record<CuadranteConfig["key"], string[]> = {
  fortalezas:    SIM_FORTALEZAS,
  oportunidades: SIM_OPORTUNIDADES,
  debilidades:   SIM_DEBILIDADES,
  amenazas:      SIM_AMENAZAS,
};

export function SlideFoda({ f2 }: Props) {
  const d = f2.fase1_rapida?.diagnostico_inicial ?? {};

  const rawData: Record<CuadranteConfig["key"], string[]> = {
    fortalezas:    d.fortalezas    ?? [],
    oportunidades: d.oportunidades ?? [],
    debilidades:   d.debilidades   ?? [],
    amenazas:      d.amenazas      ?? [],
  };

  const hasAnyData = Object.values(rawData).some((arr) => arr.length > 0);
  const isSimulated = !hasAnyData;

  const data: Record<CuadranteConfig["key"], string[]> = isSimulated
    ? SIM_DATA
    : rawData;

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
          <SlideLabel>Diagnóstico inicial</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Análisis FODA
          </h2>
          <p className="text-sm text-white/40 mt-1">
            el terreno donde competís
          </p>
        </div>
        {isSimulated && (
          <p className="text-[10px] italic text-amber-400/20">datos simulados</p>
        )}
      </motion.div>

      {/* ── Grid 2×2 ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 flex-1">
        {CUADRANTES.map((q, qi) => {
          const items = data[q.key];
          return (
            <motion.div
              key={q.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + qi * 0.08 }}
              className={`rounded-2xl border ${q.cardCls} p-5 flex flex-col gap-3`}
            >
              {/* Cuadrante header */}
              <header className={`flex items-center gap-3 border-b border-white/10 pb-3 ${q.headerCls}`}>
                <span className="text-3xl font-black leading-none">{q.letra}</span>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-semibold opacity-60">
                    {q.icon}
                  </span>
                  <span className="text-sm font-black uppercase tracking-wide">
                    {q.label}
                  </span>
                </div>
                <span className="ml-auto text-[10px] font-bold text-white/20 tabular-nums">
                  {items.length}
                </span>
              </header>

              {/* Items */}
              {items.length === 0 ? (
                <p className="text-xs text-white/20 italic">Sin datos.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((text, ti) => (
                    <li key={`${q.key}-${ti}`} className="flex items-start gap-2">
                      <span className={`shrink-0 text-xs font-bold mt-0.5 ${q.bulletCls}`}>
                        {q.icon}
                      </span>
                      <span className="text-sm text-white/70 leading-snug">{text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** Visibilidad — true si al menos un cuadrante tiene items. */
export function isSlideFodaVisible(f2: ConsultorFormFase2): boolean {
  const d = f2.fase1_rapida?.diagnostico_inicial ?? {};
  return (
    (d.fortalezas?.length ?? 0) +
      (d.debilidades?.length ?? 0) +
      (d.oportunidades?.length ?? 0) +
      (d.amenazas?.length ?? 0) >
    0
  );
}
