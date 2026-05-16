"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import type { Semaforo } from "@/lib/onboarding-schema";
import { SEMAFORO_BG, SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/onboarding-schema";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

type EstadoAntecedente = "limpio" | "proceso" | "condena";

const ESTADO_CLS: Record<EstadoAntecedente, string> = {
  limpio:  "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  proceso: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  condena: "bg-red-500/10 border-red-500/30 text-red-400",
};

const ESTADO_LABEL: Record<EstadoAntecedente, string> = {
  limpio:  "Limpio",
  proceso: "En proceso",
  condena: "Condena",
};

interface AntecedenteDef {
  label: string;
  key: "antecedentes_penales" | "antecedentes_policiales" | "antecedentes_fiscales" | "violencia_familiar";
}

const ANTECEDENTES: AntecedenteDef[] = [
  { label: "Penal",            key: "antecedentes_penales" },
  { label: "Policial",         key: "antecedentes_policiales" },
  { label: "Fiscal",           key: "antecedentes_fiscales" },
  { label: "Violencia fam.",   key: "violencia_familiar" },
];

export function SlideN3Riesgo({ f2 }: Props) {
  const n3 = f2.perfil?.n3_riesgo;
  const semaforo: Semaforo = n3?.semaforo ?? "amarillo";
  const escandalos = n3?.escandalos_mediaticos ?? [];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <SlideLabel>N3 · Riesgo legal del candidato</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Antecedentes y riesgos
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Evaluación legal y reputacional
          </p>
        </div>
        <div className={`flex-shrink-0 rounded-xl border px-3 py-2 text-center ${SEMAFORO_BG[semaforo]}`}>
          <p className="text-[8px] uppercase tracking-widest text-white/30 mb-0.5">N3</p>
          <p className={`text-sm font-black ${SEMAFORO_COLOR[semaforo]}`}>
            {SEMAFORO_LABEL[semaforo]}
          </p>
        </div>
      </motion.div>

      {/* ── Grid antecedentes ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {ANTECEDENTES.map((ant, ai) => {
          const registro = n3?.[ant.key];
          const estado: EstadoAntecedente = registro?.estado ?? "limpio";
          const cls = ESTADO_CLS[estado];
          return (
            <motion.div
              key={ant.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + ai * 0.07 }}
              className={`rounded-xl border p-3 flex flex-col gap-1.5 ${cls}`}
            >
              <p className="text-[9px] uppercase tracking-wider font-semibold opacity-60">
                {ant.label}
              </p>
              <p className="text-sm font-black">{ESTADO_LABEL[estado]}</p>
              {registro?.descripcion && (
                <p className="text-[9px] opacity-50 leading-snug">{registro.descripcion}</p>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Escándalos mediáticos ─────────────────────────────────────────── */}
      {escandalos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            Escándalos mediáticos
          </p>
          <div className="flex flex-col gap-2">
            {escandalos.map((esc, ei) => (
              <div
                key={`esc-${ei}`}
                className="bg-[#0a1e4a] border border-white/10 rounded-xl px-4 py-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/70 leading-snug">{esc.descripcion}</p>
                  {esc.fecha && (
                    <p className="text-[9px] text-white/25 mt-0.5">{esc.fecha}</p>
                  )}
                </div>
                {esc.vigente && (
                  <span className="flex-shrink-0 text-[8px] font-black bg-red-500/10 border border-red-500/30 text-red-400 px-2 py-0.5 rounded uppercase">
                    Vigente
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Notas ────────────────────────────────────────────────────────── */}
      {n3?.notas_semaforo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="border-t border-white/5 pt-4"
        >
          <p className="text-[10px] text-white/30 italic leading-relaxed">
            {n3.notas_semaforo}
          </p>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideN3Visible(f2: ConsultorFormFase2): boolean {
  return !!(f2.perfil?.n3_riesgo?.semaforo);
}
