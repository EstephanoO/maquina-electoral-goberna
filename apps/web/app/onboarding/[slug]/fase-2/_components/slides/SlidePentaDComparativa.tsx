"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2, CandidatoContext } from "@/lib/onboarding-api";
import type { PentaDEvaluacion } from "@/lib/onboarding-schema";
import { calcPentaD, calcBrecha } from "@/lib/onboarding-schema";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props { ctx: CandidatoContext; f2: ConsultorFormFase2 }

const EJES = [
  { key: "e1_presencia"  as const, label: "E1 · Presencia",  peso: "20%" },
  { key: "e2_desempenio" as const, label: "E2 · Desempeño",  peso: "25%" },
  { key: "e3_inversion"  as const, label: "E3 · Inversión",  peso: "15%" },
  { key: "e4_reputacion" as const, label: "E4 · Reputación", peso: "25%" },
  { key: "e5_operativa"  as const, label: "E5 · Operativa",  peso: "15%" },
];

const BRECHA_CONFIG = {
  estrategica: { label: "Brecha Estratégica",   color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",    desc: "≥2 pts — intervención urgente" },
  tactica:     { label: "Brecha Táctica",        color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/30", desc: "1–2 pts — cerrable en campaña" },
  paridad:     { label: "Paridad Digital",        color: "text-emerald-400",bg: "bg-emerald-500/10 border-emerald-500/30", desc: "<1 pt — resultado fuera de lo digital" },
};

function ScoreBar({ value, max = 10, color }: { value?: number; max?: number; color: string }) {
  const pct = value ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
}

export function SlidePentaDComparativa({ ctx, f2 }: Props) {
  const pr = f2.presencia;
  if (!pr) return null;

  const candidatos: Array<{ ev: PentaDEvaluacion; color: string; barColor: string }> = [
    { ev: pr.candidato_propio ?? {}, color: "text-amber-400", barColor: "bg-amber-400" },
    { ev: pr.competidor_1    ?? {}, color: "text-slate-400",  barColor: "bg-slate-500" },
    { ev: pr.competidor_2    ?? {}, color: "text-slate-500",  barColor: "bg-slate-600" },
  ];

  const scores = candidatos.map((c) => c.ev.puntaje_penta_d ?? calcPentaD(c.ev));
  const brecha = pr.brecha ?? calcBrecha(scores[0], scores[1], scores[2]);
  const brechaCfg = BRECHA_CONFIG[brecha];

  const nombreCandidato = pr.candidato_propio?.nombre ?? ctx.user.full_name;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <EditorialHeader
          microLabel="ACTO III · PRESENCIA DIGITAL"
          headline="Dónde está el candidato vs. la competencia."
          accentColor="#3b82f6"
        />
      </motion.div>

      {/* Tabla de ejes */}
      <div className="flex-1">
        <div className="grid grid-cols-4 gap-2 mb-3">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wide">Eje</span>
          {candidatos.map((c, i) => (
            <span key={i} className={`text-[10px] font-semibold uppercase tracking-wide text-right truncate ${c.color}`}>
              {i === 0 ? nombreCandidato : (c.ev.nombre ?? `Comp. ${i}`)}
            </span>
          ))}
        </div>
        {EJES.map((eje, ei) => (
          <motion.div
            key={eje.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 + ei * 0.06 }}
            className="grid grid-cols-4 gap-2 items-center py-2 border-b border-white/5"
          >
            <div>
              <p className="text-xs font-semibold text-white/70">{eje.label}</p>
              <p className="text-[10px] text-white/30">{eje.peso}</p>
            </div>
            {candidatos.map((c, ci) => {
              const score = c.ev[eje.key]?.puntaje_eje;
              return (
                <div key={ci} className="flex flex-col gap-1">
                  <span className={`text-sm font-bold tabular-nums text-right ${c.color}`}>
                    {score !== undefined ? score.toFixed(1) : "—"}
                  </span>
                  <ScoreBar value={score} color={c.barColor} />
                </div>
              );
            })}
          </motion.div>
        ))}

        {/* Puntajes finales */}
        <div className="grid grid-cols-4 gap-2 items-center pt-3 mt-1">
          <span className="text-xs font-black text-white/60 uppercase tracking-wide">Total Penta-D</span>
          {candidatos.map((c, i) => (
            <span key={i} className={`text-lg font-black tabular-nums text-right ${c.color}`}>
              {scores[i] ? scores[i].toFixed(1) : "—"}
            </span>
          ))}
        </div>
      </div>

      {/* Brecha */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className={`rounded-2xl border px-5 py-3 flex items-center justify-between ${brechaCfg.bg}`}
      >
        <div>
          <p className={`text-sm font-black ${brechaCfg.color}`}>{brechaCfg.label}</p>
          <p className="text-[11px] text-white/40">{brechaCfg.desc}</p>
        </div>
        <span className={`text-3xl font-black ${brechaCfg.color}`}>
          {Math.abs(scores[0] - Math.max(scores[1], scores[2])).toFixed(1)}
        </span>
      </motion.div>
    </div>
  );
}

export function isSlidePentaDComparativaVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.presencia?.candidato_propio?.puntaje_penta_d ??
            f2.presencia?.candidato_propio?.e1_presencia?.puntaje_eje);
}
