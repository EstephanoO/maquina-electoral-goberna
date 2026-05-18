"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideNucleoGoberna({ f2 }: Props) {
  const nucleo = f2.territorio_ecd?.nucleo_goberna;
  const propuesta = nucleo?.propuesta_central ?? null;
  const diferenciador = nucleo?.diferenciador_clave ?? null;
  const segmentos = nucleo?.segmentos_prioritarios ?? [];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Editorial Header ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <EditorialHeader
          microLabel="ACTO IV · CÓMO GANÁS"
          headline="La propuesta central define la campaña."
          accentColor="#22c55e"
        />
      </motion.div>

      {propuesta ? (
        <>
          {/* ── Main proposal card (~70% of remaining height) ─────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55 }}
            className="flex-1 flex flex-col bg-black border rounded-2xl p-8 gap-4"
            style={{ borderLeft: "4px solid #22c55e", borderTopColor: "rgba(255,255,255,0.06)", borderRightColor: "rgba(255,255,255,0.06)", borderBottomColor: "rgba(255,255,255,0.06)" }}
          >
            <p
              className="font-black text-white leading-snug"
              style={{ fontSize: "clamp(18px, 2.5vw, 24px)" }}
            >
              {propuesta}
            </p>
            {diferenciador && (
              <p className="text-sm text-white/60 leading-relaxed border-t border-white/5 pt-4">
                {diferenciador}
              </p>
            )}
          </motion.div>

          {/* ── Segmentos prioritarios pills ──────────────────────────────── */}
          {segmentos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex flex-wrap gap-2"
            >
              {segmentos.slice(0, 3).map((seg, i) => (
                <span
                  key={seg.segmento_id ?? i}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    color: "#22c55e",
                    backgroundColor: "#22c55e18",
                    border: "1px solid #22c55e40",
                  }}
                >
                  {seg.accion_inmediata ?? seg.segmento_id}
                </span>
              ))}
            </motion.div>
          )}
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white/[0.03] border border-white/10 rounded-xl p-6 flex-1 flex items-center justify-center"
        >
          <p className="text-sm text-white/40 italic text-center">
            Completá la sección Núcleo Goberna en el perfil ECD.
          </p>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideNucleoGobernaVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.territorio_ecd?.nucleo_goberna?.propuesta_central);
}
