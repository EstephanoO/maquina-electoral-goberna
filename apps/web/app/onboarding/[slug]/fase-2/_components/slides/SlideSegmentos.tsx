"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

const SIM_SEGMENTOS = [
  {
    id: "sim-1",
    nombre: "Adulto mayor rural",
    pct_aprox: 28,
    problema_principal: "Acceso a salud",
    medio_info_preferido: "Radio",
    valores: [] as string[],
  },
  {
    id: "sim-2",
    nombre: "Joven urbano 18-29",
    pct_aprox: 22,
    problema_principal: "Empleo y oportunidades",
    medio_info_preferido: "Redes sociales",
    valores: [] as string[],
  },
  {
    id: "sim-3",
    nombre: "Ama de casa",
    pct_aprox: 35,
    problema_principal: "Seguridad y alimentación",
    medio_info_preferido: "TV local",
    valores: [] as string[],
  },
];

/**
 * Paleta de barras rotando: amber-400, blue-400, emerald-400, luego slate.
 */
const BAR_COLORS = [
  { bg: "#fbbf24", label: "text-[#020a1e]" }, // amber-400
  { bg: "#60a5fa", label: "text-[#020a1e]" }, // blue-400
  { bg: "#34d399", label: "text-[#020a1e]" }, // emerald-400
  { bg: "#94a3b8", label: "text-[#020a1e]" }, // slate-400
  { bg: "#475569", label: "text-white"     }, // slate-600
];

const FOOTER_TEXT =
  "La victoria no depende solo de fortalecer la base, sino de persuadir en territorios fragmentados y generar confianza en los sectores que aún dudan.";

/**
 * Slide "Segmentos Objetivos" — reskin CRÍTICO.
 * Barra horizontal de proporciones + lista detallada de segmentos.
 */
export function SlideSegmentos({ f2 }: Props) {
  const raw = f2.territorio_ecd?.c2_segmentos ?? [];
  const isSimulated = raw.length === 0;
  const segmentos = isSimulated ? SIM_SEGMENTOS : raw;

  const prioritarios =
    f2.territorio_ecd?.nucleo_goberna?.segmentos_prioritarios ?? [];

  // ── Cálculo de proporciones ────────────────────────────────────────────
  const allHavePct =
    segmentos.length > 0 &&
    segmentos.every(
      (s) => typeof s.pct_aprox === "number" && (s.pct_aprox ?? 0) > 0,
    );
  const equalShare = segmentos.length > 0 ? 100 / segmentos.length : 0;

  const MAX_VISIBLE = 3;
  const visible = segmentos.slice(0, MAX_VISIBLE);
  const overflow = segmentos.slice(MAX_VISIBLE);

  const visibleBars = visible.map((seg, idx) => {
    const pct = allHavePct ? (seg.pct_aprox ?? equalShare) : equalShare;
    return {
      key: seg.id || `seg-${idx}`,
      nombre: seg.nombre,
      pct,
      problema: seg.problema_principal ?? "",
      color: BAR_COLORS[idx % BAR_COLORS.length]!,
    };
  });

  const overflowPct = overflow.reduce((acc, seg) => {
    const pct = allHavePct ? (seg.pct_aprox ?? equalShare) : equalShare;
    return acc + pct;
  }, 0);

  const totalDisplayed =
    visibleBars.reduce((a, b) => a + b.pct, 0) + overflowPct;
  const norm = totalDisplayed > 0 ? 100 / totalDisplayed : 1;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-end justify-between"
      >
        <div>
          <SlideLabel>Segmentos Objetivos</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            ¿A quién le hablamos?
          </h2>
          <p className="text-sm text-white/40 mt-1">
            cómo se distribuye el electorado
          </p>
        </div>
        {isSimulated && (
          <p className="text-[10px] italic text-amber-400/20">datos simulados</p>
        )}
      </motion.div>

      <div className="flex flex-col gap-8 flex-1">
        {/* ── Barra de proporciones ──────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Labels encima */}
          <div className="flex gap-1">
            {visibleBars.map((b) => (
              <div
                key={`label-${b.key}`}
                className="flex flex-col items-start"
                style={{ flexGrow: b.pct * norm, flexBasis: 0, minWidth: 0 }}
              >
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide text-white/70 truncate max-w-full">
                  {b.nombre}
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-white/40 tabular-nums">
                  {Math.round(b.pct * norm)}%
                </span>
              </div>
            ))}
            {overflow.length > 0 && (
              <div
                className="flex flex-col items-start"
                style={{ flexGrow: overflowPct * norm, flexBasis: 0, minWidth: 0 }}
              >
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide text-white/30 truncate max-w-full">
                  + otros
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-white/30 tabular-nums">
                  {Math.round(overflowPct * norm)}%
                </span>
              </div>
            )}
          </div>

          {/* Barra horizontal */}
          <div className="flex h-12 w-full rounded-xl overflow-hidden border border-white/10">
            {visibleBars.map((b, idx) => (
              <motion.div
                key={`bar-${b.key}`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  delay: 0.1 + idx * 0.15,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  background: b.color.bg,
                  flexGrow: b.pct * norm,
                  flexBasis: 0,
                  transformOrigin: "0% 50%",
                }}
                className={`group relative flex items-center justify-center ${b.color.label} font-black text-sm`}
              >
                <span className="tabular-nums px-2 truncate">
                  {Math.round(b.pct * norm)}%
                </span>

                {/* Tooltip — problema_principal on hover */}
                {b.problema && b.problema.trim().length > 0 ? (
                  <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                    <div className="bg-[#0a1e4a] border border-white/10 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg max-w-[240px] whitespace-normal leading-snug">
                      {b.problema}
                      <div className="absolute left-1/2 -translate-x-1/2 top-full size-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-[#0a1e4a]" />
                    </div>
                  </div>
                ) : null}
              </motion.div>
            ))}
            {overflow.length > 0 && (
              <motion.div
                key="bar-overflow"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  delay: 0.1 + visibleBars.length * 0.15,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  background: "#334155",
                  flexGrow: overflowPct * norm,
                  flexBasis: 0,
                  transformOrigin: "0% 50%",
                }}
                className="flex items-center justify-center text-white/60 font-black text-sm"
              >
                <span className="tabular-nums px-2 truncate">
                  {Math.round(overflowPct * norm)}%
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* ── Lista detallada de segmentos ───────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.1 + visibleBars.length * 0.15 + 0.2,
            duration: 0.45,
          }}
          className="flex flex-col gap-3"
        >
          <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-amber-400/60">
            Detalle por segmento
          </h3>

          {segmentos.map((seg, idx) => {
            const pct = allHavePct
              ? (seg.pct_aprox ?? equalShare)
              : equalShare;
            const barColor = BAR_COLORS[idx % BAR_COLORS.length]!;
            const match = prioritarios.find((p) => p.segmento_id === seg.id);
            const objetivo = match?.mensaje_central?.trim() ?? null;

            return (
              <motion.div
                key={seg.id || `seg-detail-${idx}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + idx * 0.07 }}
                className="bg-[#0a1e4a] border border-white/10 rounded-xl p-4"
              >
                <div className="flex items-center gap-4">
                  {/* % con color de barra */}
                  <div
                    className="text-2xl font-black tabular-nums shrink-0 w-14 text-right"
                    style={{ color: barColor.bg }}
                  >
                    {Math.round(pct * norm)}%
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm leading-snug">
                      {seg.nombre}
                    </p>
                    {seg.problema_principal && (
                      <p className="text-xs text-white/50 mt-0.5">
                        Problema: {seg.problema_principal}
                      </p>
                    )}
                    {objetivo && (
                      <p className="text-xs text-amber-400/70 mt-0.5 italic">
                        Objetivo: {objetivo}
                      </p>
                    )}
                  </div>

                  {/* Medio info preferido */}
                  {seg.medio_info_preferido && (
                    <div className="shrink-0 hidden sm:block">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                        {seg.medio_info_preferido}
                      </span>
                    </div>
                  )}
                </div>

                {/* Barra proporcional */}
                <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(pct * norm)}%` }}
                    transition={{
                      duration: 0.6,
                      delay: 0.5 + idx * 0.1,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="h-full rounded-full"
                    style={{ background: barColor.bg }}
                  />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.7 }}
        className="border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20 leading-snug">{FOOTER_TEXT}</p>
      </motion.div>
    </div>
  );
}

SlideSegmentos.isVisible = (f2: ConsultorFormFase2): boolean => {
  return (f2.territorio_ecd?.c2_segmentos?.length ?? 0) > 0;
};
