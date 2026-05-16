"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

interface CruceConfig {
  key: keyof Pick<NonNullable<NonNullable<ConsultorFormFase2["terreno"]>["sintesis"]>, "exC" | "cxD" | "exD">;
  titulo: string;
  sub: string;
  cardCls: string;
  accentCls: string;
}

const CRUCES: CruceConfig[] = [
  {
    key: "exC",
    titulo: "E × C",
    sub: "Estructura y Conciencia — cómo la posición estructural explica las actitudes",
    cardCls: "bg-blue-500/10 border-blue-500/20",
    accentCls: "text-blue-400",
  },
  {
    key: "cxD",
    titulo: "C × D",
    sub: "Conciencia y Decisión — cómo las actitudes filtran el cálculo del voto",
    cardCls: "bg-emerald-500/10 border-emerald-500/20",
    accentCls: "text-emerald-400",
  },
  {
    key: "exD",
    titulo: "E × D",
    sub: "Estructura y Decisión — cómo el campo limita las opciones viables",
    cardCls: "bg-amber-500/10 border-amber-500/20",
    accentCls: "text-amber-400",
  },
];

const EMPTY_TEXT = (
  <p className="text-xs text-white/20 italic">Pendiente de análisis.</p>
);

export function SlideSintesis({ f2 }: Props) {
  const sint = f2.terreno?.sintesis;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Síntesis Goberna · Cruces ECD</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Análisis cruzado del territorio
        </h2>
        <p className="text-sm text-white/40 mt-1">
          Estructura × Conciencia × Decisión
        </p>
      </motion.div>

      {/* ── Cruces bilaterales ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {CRUCES.map((cruce, ci) => (
          <motion.div
            key={cruce.key}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + ci * 0.08 }}
            className={`rounded-2xl border ${cruce.cardCls} p-4 flex flex-col gap-2`}
          >
            <div className="flex items-baseline gap-2">
              <span className={`text-base font-black ${cruce.accentCls}`}>
                {cruce.titulo}
              </span>
              <span className="text-[10px] text-white/30 leading-snug">
                {cruce.sub}
              </span>
            </div>
            {sint?.[cruce.key] ? (
              <p className="text-sm text-white/70 leading-relaxed">
                {sint[cruce.key]}
              </p>
            ) : (
              EMPTY_TEXT
            )}
          </motion.div>
        ))}
      </div>

      {/* ── Triple cruce ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        className="bg-[#0a1e4a] border border-amber-400/20 rounded-2xl p-5 flex flex-col gap-3 flex-1"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/60">
          Triple Cruce E×C×D — Núcleo Goberna
        </p>
        {sint?.triple ? (
          <p className="text-sm text-white/80 leading-relaxed">{sint.triple}</p>
        ) : (
          EMPTY_TEXT
        )}
      </motion.div>
    </div>
  );
}

export function isSlideSintesisVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.terreno?.sintesis?.triple || f2.terreno?.sintesis?.exC);
}
