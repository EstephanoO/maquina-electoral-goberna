"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideConciencia({ f2 }: Props) {
  const t = f2.terreno;
  const segmentos = t?.c2_psicografia ?? [];
  const issues = (t?.c4_issues ?? []).slice(0, 6);
  const encuestas = t?.c5_medios?.encuestas_disponibles ?? [];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Dimensión C · Conciencia</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Conciencia política del electorado
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {segmentos.length} segmento{segmentos.length !== 1 ? "s" : ""} psicográfico
          {segmentos.length !== 1 ? "s" : ""}
        </p>
      </motion.div>

      {/* ── Segmentos C2 ────────────────────────────────────────────────── */}
      {segmentos.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            C2 · Segmentos Psicográficos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {segmentos.map((seg, si) => (
              <motion.div
                key={seg.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + si * 0.08 }}
                className="bg-[#0a1e4a] border border-white/10 rounded-xl p-4 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white leading-tight">
                    {seg.nombre}
                  </span>
                  {seg.pct_aprox != null && (
                    <span className="text-xs font-black text-amber-400 tabular-nums shrink-0">
                      {seg.pct_aprox}%
                    </span>
                  )}
                </div>
                {seg.problema_principal && (
                  <p className="text-[11px] text-white/50 leading-snug">
                    {seg.problema_principal}
                  </p>
                )}
                {seg.valores && seg.valores.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {seg.valores.slice(0, 3).map((v, vi) => (
                      <span
                        key={`v-${vi}`}
                        className="text-[9px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/40"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Issues C4 ───────────────────────────────────────────────────── */}
      {issues.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col gap-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            C4 · Issues Principales
          </p>
          <div className="flex flex-col gap-2">
            {issues.map((iss, ii) => (
              <div key={`iss-${ii}`} className="flex items-center gap-3">
                <span className="text-[10px] font-black text-white/20 tabular-nums w-5 text-right">
                  #{iss.prioridad ?? ii + 1}
                </span>
                <span className="text-xs text-white/70 flex-1 leading-snug">
                  {iss.issue}
                </span>
                {iss.pct_menciona != null && (
                  <>
                    <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${iss.pct_menciona}%` }}
                        transition={{ duration: 0.55, delay: 0.4 + ii * 0.07, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-blue-500"
                      />
                    </div>
                    <span className="text-[10px] text-white/40 tabular-nums w-8 text-right">
                      {iss.pct_menciona}%
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Footer: encuestas ───────────────────────────────────────────── */}
      {encuestas.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="border-t border-white/5 pt-4 flex flex-wrap gap-2"
        >
          <span className="text-[10px] text-white/25 uppercase tracking-wider mr-1 self-center">
            Encuestas:
          </span>
          {encuestas.map((enc, ei) => (
            <span
              key={`enc-${ei}`}
              className="text-[10px] bg-white/5 border border-white/10 rounded px-2 py-0.5 text-white/40"
            >
              {enc.fuente}
              {enc.fecha ? ` · ${enc.fecha}` : ""}
            </span>
          ))}
        </motion.div>
      )}
    </div>
  );
}

export function isSlideConcienciaVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.terreno?.c2_psicografia?.length);
}
