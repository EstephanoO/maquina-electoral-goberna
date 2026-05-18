"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import type { Semaforo } from "@/lib/onboarding-schema";
import { SEMAFORO_BG, SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/onboarding-schema";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideResumenEjecutivo({ f2 }: Props) {
  const resumen = f2.perfil?.resumen_ejecutivo;
  const hallazgos = resumen?.hallazgos_criticos ?? [];
  const semaforoGlobal: Semaforo = resumen?.semaforo_global ?? "amarillo";

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
          <EditorialHeader
            microLabel="ACTO I · SÍNTESIS"
            headline="Todo lo esencial en una sola página."
            accentColor="#fbbf24"
          />
        </div>

        {/* Semáforo global prominente */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
          className={`flex-shrink-0 rounded-xl border px-4 py-3 text-center ${SEMAFORO_BG[semaforoGlobal]}`}
        >
          <p className="text-[8px] uppercase tracking-widest text-white/30 mb-0.5">
            Semáforo global
          </p>
          <p className={`text-lg font-black ${SEMAFORO_COLOR[semaforoGlobal]}`}>
            {SEMAFORO_LABEL[semaforoGlobal]}
          </p>
        </motion.div>
      </motion.div>

      {/* ── Hallazgos críticos ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 flex-1">
        {hallazgos.slice(0, 3).map((hallazgo, hi) => (
          <motion.div
            key={`h-${hi}`}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + hi * 0.1 }}
            className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5 flex gap-4 items-start"
          >
            <div className="text-5xl font-black text-white/8 leading-none select-none tabular-nums">
              #{hi + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 leading-relaxed">{hallazgo}</p>
            </div>
          </motion.div>
        ))}

        {hallazgos.length > 3 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-xs text-white/25 italic text-center"
          >
            +{hallazgos.length - 3} hallazgo{hallazgos.length - 3 !== 1 ? "s" : ""} adicional
            {hallazgos.length - 3 !== 1 ? "es" : ""}
          </motion.p>
        )}

        {hallazgos.length === 0 && (
          <p className="text-xs text-white/20 italic">Sin hallazgos registrados.</p>
        )}
      </div>
    </div>
  );
}

export function isSlideResumenEjecutivoVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.perfil?.resumen_ejecutivo?.hallazgos_criticos?.length);
}
