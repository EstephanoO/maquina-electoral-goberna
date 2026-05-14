"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeData } from "../chrome/SlideChromeData";
import { DataTable } from "../chrome/DataTable";

interface Props {
  f2: ConsultorFormFase2;
}

const FOOTER_TEXT =
  "La victoria no depende solo de fortalecer la base, sino de persuadir en territorios fragmentados y generar confianza en los sectores que aún dudan.";

/**
 * Paleta de barras — 1° navy, 2° amber-400, 3° slate-400, 4°+ slate-600.
 * Acotada a 3 segmentos visibles + "+ otros" si hay overflow.
 */
const BAR_COLORS = [
  { bg: "#0a1f4a", text: "text-white" },
  { bg: "#fbbf24", text: "text-[#0a1f4a]" }, // amber-400
  { bg: "#94a3b8", text: "text-[#0a1f4a]" }, // slate-400
  { bg: "#475569", text: "text-white" },      // slate-600
];

/**
 * Slide "División del voto" — replica el patrón p.15 del deck Goberna:
 * barra horizontal de proporciones (3 segmentos visibles + "+ otros") encima
 * de la tabla detallada (Segmento · Características clave · Objetivo estratégico),
 * alimentada por `territorio_ecd.c2_segmentos[]` y cruzada contra
 * `nucleo_goberna.segmentos_prioritarios` para el objetivo estratégico.
 */
export function SlideSegmentos({ f2 }: Props) {
  const segmentos = f2.territorio_ecd?.c2_segmentos ?? [];
  const prioritarios =
    f2.territorio_ecd?.nucleo_goberna?.segmentos_prioritarios ?? [];

  // ── Cálculo de proporciones ────────────────────────────────────────────
  const allHavePct = segmentos.length > 0
    && segmentos.every((s) => typeof s.pct_aprox === "number" && (s.pct_aprox ?? 0) > 0);
  const equalShare = segmentos.length > 0 ? 100 / segmentos.length : 0;

  // 3 visibles + "+ otros" si hay overflow
  const MAX_VISIBLE = 3;
  const visible = segmentos.slice(0, MAX_VISIBLE);
  const overflow = segmentos.slice(MAX_VISIBLE);

  const visibleBars = visible.map((seg, idx) => {
    const pct = allHavePct
      ? seg.pct_aprox ?? equalShare
      : equalShare;
    return {
      key: seg.id || `seg-${idx}`,
      nombre: seg.nombre,
      pct,
      problema: seg.problema_principal ?? "",
      color: BAR_COLORS[idx]!,
    };
  });

  const overflowPct = overflow.reduce((acc, seg) => {
    const pct = allHavePct
      ? seg.pct_aprox ?? equalShare
      : equalShare;
    return acc + pct;
  }, 0);

  // Normalización: si las proporciones no suman 100 (datos parciales o equalShare con resto),
  // las renderizamos a escala — flex-grow basado en pct hace el ajuste visual.
  const totalDisplayed = visibleBars.reduce((a, b) => a + b.pct, 0) + overflowPct;
  const norm = totalDisplayed > 0 ? 100 / totalDisplayed : 1;

  // ── Tabla detallada ────────────────────────────────────────────────────
  const rows = segmentos.map((seg) => {
    const valores = seg.valores ?? [];
    const problema = seg.problema_principal ?? "";
    const caracteristicas = [...valores, problema]
      .filter((s) => s && s.trim().length > 0)
      .join(" · ");

    const match = prioritarios.find((p) => p.segmento_id === seg.id);
    const objetivo = match?.mensaje_central?.trim() || "—";

    return {
      segmento: seg.nombre,
      caracteristicas: caracteristicas || "—",
      objetivo,
    };
  });

  return (
    <SlideChromeData
      title="DIVISIÓN DEL VOTO"
      chapter={4}
      chapterHint="cómo se distribuye el electorado"
      footer={<span className="font-semibold text-[#0a1f4a]">{FOOTER_TEXT}</span>}
    >
      <div className="flex flex-col gap-8 max-w-5xl mx-auto">
        {/* ── Barra de proporciones ──────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Labels encima del bar */}
          <div className="flex gap-1">
            {visibleBars.map((b) => (
              <div
                key={`label-${b.key}`}
                className="flex flex-col items-start"
                style={{ flexGrow: b.pct * norm, flexBasis: 0, minWidth: 0 }}
              >
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide text-[#0a1f4a] truncate max-w-full">
                  {b.nombre}
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 tabular-nums">
                  {Math.round(b.pct * norm)}%
                </span>
              </div>
            ))}
            {overflow.length > 0 && (
              <div
                className="flex flex-col items-start"
                style={{ flexGrow: overflowPct * norm, flexBasis: 0, minWidth: 0 }}
              >
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide text-slate-500 truncate max-w-full">
                  + otros
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 tabular-nums">
                  {Math.round(overflowPct * norm)}%
                </span>
              </div>
            )}
          </div>

          {/* Barra horizontal — h-12 con segmentos lado a lado */}
          <div className="flex h-12 w-full rounded-lg overflow-hidden border border-slate-200 shadow-sm">
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
                className={`group relative flex items-center justify-center ${b.color.text} font-black text-sm`}
              >
                <span className="tabular-nums px-2 truncate">
                  {Math.round(b.pct * norm)}%
                </span>

                {/* Tooltip CSS — hover muestra problema_principal */}
                {b.problema && b.problema.trim().length > 0 ? (
                  <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                    <div className="bg-[#0a1f4a] text-white text-xs font-medium px-3 py-2 rounded-md shadow-lg max-w-[240px] whitespace-normal leading-snug">
                      {b.problema}
                      <div className="absolute left-1/2 -translate-x-1/2 top-full size-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-[#0a1f4a]" />
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
                  background: "#475569",
                  flexGrow: overflowPct * norm,
                  flexBasis: 0,
                  transformOrigin: "0% 50%",
                }}
                className="flex items-center justify-center text-white font-black text-sm"
              >
                <span className="tabular-nums px-2 truncate">
                  {Math.round(overflowPct * norm)}%
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* ── Tabla detallada ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + visibleBars.length * 0.15 + 0.2, duration: 0.45 }}
        >
          <DataTable
            columns={[
              { key: "segmento", label: "Segmento", width: "22%" },
              { key: "caracteristicas", label: "Características clave", width: "46%" },
              { key: "objetivo", label: "Objetivo estratégico", width: "32%" },
            ]}
            rows={rows}
            emphasizeFirst
          />
        </motion.div>
      </div>
    </SlideChromeData>
  );
}

SlideSegmentos.isVisible = (f2: ConsultorFormFase2): boolean => {
  return (f2.territorio_ecd?.c2_segmentos?.length ?? 0) > 0;
};
