"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import type { Semaforo } from "@/lib/onboarding-schema";
import { SEMAFORO_BG, SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/onboarding-schema";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

interface DataRow {
  label: string;
  value: string | undefined;
}

export function SlideN1Identidad({ f2 }: Props) {
  const n1 = f2.perfil?.n1_identidad;
  const semaforo: Semaforo = n1?.semaforo ?? "amarillo";

  const rows: DataRow[] = [
    { label: "Nombre completo", value: n1?.nombres_completos },
    { label: "Fecha de nacimiento", value: n1?.fecha_nacimiento },
    { label: "Lugar de nacimiento", value: n1?.lugar_nacimiento },
    { label: "DNI / Doc.", value: n1?.dni },
    { label: "Profesión declarada", value: n1?.profesion_declarada },
  ];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>N1 · Identidad del candidato</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          {n1?.nombres_completos ?? "Sin nombre"}
        </h2>
        {n1?.profesion_declarada && (
          <p className="text-sm text-white/40 mt-1">{n1.profesion_declarada}</p>
        )}
      </motion.div>

      {/* ── Body: foto + datos ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="flex gap-5 flex-1"
      >
        {/* Foto */}
        {n1?.foto_actual_url && (
          <div className="flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={n1.foto_actual_url}
              alt={n1.nombres_completos ?? "Candidato"}
              className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl object-cover border border-white/10"
            />
          </div>
        )}

        {/* Datos */}
        <div className="flex-1 flex flex-col gap-2">
          {rows.map((row) =>
            row.value ? (
              <div key={row.label} className="flex flex-col gap-0.5">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/25 font-semibold">
                  {row.label}
                </p>
                <p className="text-sm text-white/80">{row.value}</p>
              </div>
            ) : null,
          )}
        </div>

        {/* Semáforo */}
        <div className="flex-shrink-0">
          <div
            className={`rounded-xl border px-3 py-2 text-center ${SEMAFORO_BG[semaforo]}`}
          >
            <p className="text-[8px] uppercase tracking-widest text-white/30 mb-0.5">N1</p>
            <p className={`text-sm font-black ${SEMAFORO_COLOR[semaforo]}`}>
              {SEMAFORO_LABEL[semaforo]}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Notas semáforo ────────────────────────────────────────────────── */}
      {n1?.notas_semaforo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="border-t border-white/5 pt-4"
        >
          <p className="text-[10px] text-white/30 italic leading-relaxed">
            {n1.notas_semaforo}
          </p>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideN1Visible(f2: ConsultorFormFase2): boolean {
  return !!(f2.perfil?.n1_identidad?.nombres_completos);
}
