"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";
import { GapBar } from "./shared/GapBar";

interface Props {
  f2: ConsultorFormFase2;
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE");
}

export function SlideConciencia({ f2 }: Props) {
  const ecd = f2.territorio_ecd;
  const pctActual = ecd?.c5_intencion_voto?.pct_nuestro_candidato ?? null;
  const rival = ecd?.c5_intencion_voto?.candidato_puntero ?? null;
  const padron = f2.votos_para_ganar?.padron_actual ?? null;
  const fechaEleccion = f2.fase1_rapida?.postulacion?.fecha_eleccion ?? null;

  // Compute weeks to election
  const weeksToElection = fechaEleccion
    ? Math.max(0, Math.ceil(
        (new Date(fechaEleccion).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
      ))
    : undefined;

  // Target: votos_meta as % of padron, or default 51
  const pctTarget =
    padron && f2.votos_para_ganar?.votos_meta
      ? Math.round((f2.votos_para_ganar.votos_meta / padron) * 100)
      : 51;

  const gap = pctActual !== null ? pctTarget - pctActual : null;
  const votosGap =
    padron && gap !== null ? Math.round(padron * gap / 100) : null;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      {/* ── Editorial Header ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <EditorialHeader
          microLabel="ACTO II · CONCIENCIA ELECTORAL"
          headline={
            pctActual !== null && gap !== null
              ? `Necesitás ${gap} punto${gap !== 1 ? "s" : ""} más. Hay un plan.`
              : "Posición electoral del candidato."
          }
          accentColor="#ef4444"
        />
      </motion.div>

      {/* ── GapBar (only when data present) ──────────────────────────────── */}
      {pctActual !== null ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <GapBar
            current={pctActual}
            target={pctTarget}
            weeks={weeksToElection}
            totalVotes={padron ?? undefined}
          />
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/[0.03] border border-white/10 rounded-xl p-6"
        >
          <p className="text-sm text-white/40 italic">
            Completá la sección C5 del perfil ECD para ver la simulación del GAP.
          </p>
        </motion.div>
      )}

      {/* ── Rival info ────────────────────────────────────────────────────── */}
      {rival && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3"
        >
          <div className="h-3 w-3 rounded-full bg-red-500 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-red-400/60 font-semibold">
              Candidato puntero
            </span>
            <span className="text-sm font-bold text-white">{rival}</span>
          </div>
        </motion.div>
      )}

      {/* ── Editorial note ────────────────────────────────────────────────── */}
      {pctActual !== null && padron && votosGap !== null && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="text-xs text-white/30 leading-relaxed border-t border-white/5 pt-4"
        >
          Para ganar con {pctTarget}% necesitás capturar{" "}
          <span className="text-white/60 font-semibold">{fmt(votosGap)} votos</span>{" "}
          adicionales de los{" "}
          <span className="text-white/60 font-semibold">{fmt(padron)}</span>{" "}
          electores habilitados.
        </motion.p>
      )}
    </div>
  );
}

export function isSlideConcienciaVisible(f2: ConsultorFormFase2): boolean {
  return f2.territorio_ecd?.c5_intencion_voto?.pct_nuestro_candidato != null;
}
