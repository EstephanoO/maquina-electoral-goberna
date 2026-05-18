"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2, D5MatrixRow } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props {
  f2: ConsultorFormFase2;
}

const PROB_CAMBIO_COLOR: Record<NonNullable<D5MatrixRow["prob_cambio"]>, string> = {
  alta: "#ef4444",
  media: "#fbbf24",
  baja: "#22c55e",
};

const PROB_CAMBIO_LABEL: Record<NonNullable<D5MatrixRow["prob_cambio"]>, string> = {
  alta: "ALTA",
  media: "MEDIA",
  baja: "BAJA",
};

export function SlideDecision({ f2 }: Props) {
  const d5 = f2.territorio_ecd?.d5_matrix ?? [];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Editorial Header ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <EditorialHeader
          microLabel="ACTO III · CONTRA QUIÉN"
          headline={`${d5.length > 0 ? d5.length : 3} segmento${d5.length !== 1 ? "s" : ""}. Cada uno necesita una estrategia diferente.`}
          accentColor="#3b82f6"
        />
      </motion.div>

      {/* ── D5 Battle Orders Table ────────────────────────────────────────── */}
      {d5.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="flex flex-col gap-2 flex-1"
        >
          {/* Table header */}
          <div className="grid grid-cols-[1fr_2fr_1fr_80px] gap-3 px-4 pb-2 border-b border-white/5">
            {["Segmento", "Mensaje clave", "Canal", "Prob. cambio"].map((h) => (
              <p key={h} className="text-[9px] uppercase tracking-[0.18em] text-white/25 font-semibold">
                {h}
              </p>
            ))}
          </div>

          {/* Table rows */}
          <div className="flex flex-col gap-1">
            {d5.map((row, i) => {
              const probColor = row.prob_cambio
                ? PROB_CAMBIO_COLOR[row.prob_cambio]
                : "#6b7280";
              const probLabel = row.prob_cambio
                ? PROB_CAMBIO_LABEL[row.prob_cambio]
                : "—";

              return (
                <motion.div
                  key={row.segmento_id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.07 }}
                  className="grid grid-cols-[1fr_2fr_1fr_80px] gap-3 items-start bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3"
                  style={{ borderLeft: `3px solid ${probColor}` }}
                >
                  <p className="text-xs font-bold text-white leading-snug">
                    {row.segmento_id}
                  </p>
                  <p className="text-xs text-white/70 leading-snug">
                    {row.mensaje_clave ?? "—"}
                  </p>
                  <p className="text-xs text-white/50 leading-snug">
                    {row.canal_efectivo ?? "—"}
                  </p>
                  <span
                    className="text-[9px] font-black uppercase px-2 py-1 rounded text-center"
                    style={{
                      color: probColor,
                      backgroundColor: `${probColor}18`,
                      border: `1px solid ${probColor}40`,
                    }}
                  >
                    {probLabel}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/[0.03] border border-white/10 rounded-xl p-6 flex-1 flex items-center justify-center"
        >
          <p className="text-sm text-white/40 italic text-center">
            Completá la sección D5 del análisis ECD para ver las órdenes de batalla.
          </p>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideDecisionVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.territorio_ecd?.d5_matrix?.length);
}
