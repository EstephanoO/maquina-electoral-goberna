"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import type { Semaforo } from "@/lib/onboarding-schema";
import { SEMAFORO_BG, SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/onboarding-schema";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideN4Patrimonio({ f2 }: Props) {
  const n4 = f2.perfil?.n4_patrimonio;
  const semaforo: Semaforo = n4?.semaforo ?? "amarillo";
  const empresas = n4?.empresas ?? [];
  const inmuebles = n4?.inmuebles ?? [];
  const vehiculos = n4?.vehiculos ?? [];
  const offshore = n4?.offshore;

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
          <SlideLabel>N4 · Patrimonio del candidato</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Declaración patrimonial
          </h2>
          <p className="text-sm text-white/40 mt-1">
            Empresas, bienes e inconsistencias
          </p>
        </div>
        <div className={`flex-shrink-0 rounded-xl border px-3 py-2 text-center ${SEMAFORO_BG[semaforo]}`}>
          <p className="text-[8px] uppercase tracking-widest text-white/30 mb-0.5">N4</p>
          <p className={`text-sm font-black ${SEMAFORO_COLOR[semaforo]}`}>
            {SEMAFORO_LABEL[semaforo]}
          </p>
        </div>
      </motion.div>

      {/* ── Counters: inmuebles y vehículos ─────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-3"
      >
        {[
          { label: "Empresas", count: empresas.length },
          { label: "Inmuebles", count: inmuebles.length },
          { label: "Vehículos", count: vehiculos.length },
        ].map((item, ii) => (
          <div
            key={`cnt-${ii}`}
            className="bg-[#0a1e4a] border border-white/10 rounded-xl p-3 text-center"
          >
            <p className="text-[9px] uppercase tracking-wider text-white/25 font-semibold mb-1">
              {item.label}
            </p>
            <p className="text-3xl font-black text-white tabular-nums">{item.count}</p>
          </div>
        ))}
      </motion.div>

      {/* ── Offshore badge ───────────────────────────────────────────────── */}
      {offshore?.existencia && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 280 }}
          className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
        >
          <span className="text-red-400 font-black text-sm uppercase tracking-wider">
            Offshore detectado
          </span>
          {offshore.descripcion && (
            <p className="text-[10px] text-red-400/60 leading-snug flex-1">
              {offshore.descripcion}
            </p>
          )}
        </motion.div>
      )}

      {/* ── Lista de empresas ────────────────────────────────────────────── */}
      {empresas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            Empresas vinculadas
          </p>
          <div className="flex flex-col gap-1.5">
            {empresas.map((emp, ei) => (
              <div
                key={`emp-${ei}`}
                className="flex items-center gap-3 bg-[#0a1e4a] border border-white/10 rounded-xl px-3 py-2"
              >
                <p className="text-xs font-semibold text-white/70 flex-1">{emp.nombre}</p>
                {emp.rol && (
                  <span className="text-[9px] text-white/30 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 uppercase tracking-wide">
                    {emp.rol}
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Notas ────────────────────────────────────────────────────────── */}
      {n4?.notas_semaforo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="border-t border-white/5 pt-4"
        >
          <p className="text-[10px] text-white/30 italic leading-relaxed">
            {n4.notas_semaforo}
          </p>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideN4Visible(f2: ConsultorFormFase2): boolean {
  return !!(f2.perfil?.n4_patrimonio?.semaforo);
}
