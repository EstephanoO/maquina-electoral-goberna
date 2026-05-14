"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import {
  fetchDistritoDetail,
  type DistritoDetail,
} from "@/lib/onboarding-fase1-api";

import { SlideChromeData } from "../chrome/SlideChromeData";
import { DataTable } from "../chrome/DataTable";
import { TagTilt } from "../chrome/TagTilt";

interface Props {
  f2: ConsultorFormFase2;
  /** Si se provee, busca padrón en onboarding_fase1 cuando no esté en el form. */
  ctx?: CandidatoContext;
}

const nf = new Intl.NumberFormat("es-PE");
const fmt = (n: number | undefined | null) =>
  typeof n === "number" && Number.isFinite(n) ? nf.format(n) : "—";

/**
 * CountUp inline — interpola de 0 a `value` en 1.4s (30 steps).
 * Se dispara cuando `start === true`. Mientras tanto muestra 0.
 */
function CountUp({
  value,
  start,
  className,
}: {
  value: number | undefined | null;
  start: boolean;
  className?: string;
}) {
  const target =
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!start || target === null) return;
    const steps = 30;
    const duration = 1400;
    const interval = duration / steps;
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      // Ease-out cubic para que la animación termine suavemente.
      const t = step / steps;
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(target * eased));
      if (step >= steps) {
        setCurrent(target);
        clearInterval(id);
      }
    }, interval);
    return () => clearInterval(id);
  }, [start, target]);

  if (target === null) {
    return <span className={className}>—</span>;
  }

  return <span className={`tabular-nums ${className ?? ""}`}>{nf.format(current)}</span>;
}

/**
 * Slide "Porcentaje de votos necesarios" — gap visual + counter animado.
 * Izquierda: histórico electoral (DataTable).
 * Derecha: pipeline vertical de 3 stages (Resultado anterior → Gap → Meta 2026).
 */
export function SlideVotosNecesarios({ f2, ctx }: Props) {
  const vpg = f2.votos_para_ganar ?? {};
  const entries = f2.historial?.entries ?? [];
  const hasHistorial = entries.length > 0;

  // Fallback chain: form > último padrón ONPE > 70% de población total 2025
  const [enrichment, setEnrichment] = useState<DistritoDetail | null>(null);
  const idDistrito = ctx?.jurisdiccion?.distrito?.id ?? null;
  useEffect(() => {
    if (!idDistrito || typeof vpg.padron_actual === "number") return;
    let cancelled = false;
    fetchDistritoDetail(idDistrito, { simplify: 0.01 })
      .then((d) => { if (!cancelled) setEnrichment(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [idDistrito, vpg.padron_actual]);

  const padronEnriquecido =
    enrichment?.padron?.poblacion_electoral ??
    (enrichment?.poblacion_total_2025
      ? Math.round(enrichment.poblacion_total_2025 * 0.7)
      : null);

  const padron = vpg.padron_actual ?? padronEnriquecido ?? null;
  const padronFuente =
    typeof vpg.padron_actual === "number"
      ? vpg.fuente ?? null
      : enrichment?.padron
        ? `${enrichment.padron.fuente} · ${enrichment.padron.eleccion_codigo}`
        : enrichment?.poblacion_total_2025
          ? "Estimación: 70% de la población 2025 (INEI)"
          : null;
  const meta = vpg.votos_meta;
  const ganadorAnterior = vpg.votos_ganador_anterior;

  const pctMeta =
    typeof meta === "number" && typeof padron === "number" && padron > 0
      ? Math.round((meta / padron) * 100)
      : null;

  const pctAnterior =
    typeof ganadorAnterior === "number" &&
    typeof padron === "number" &&
    padron > 0
      ? Math.round((ganadorAnterior / padron) * 10) / 10
      : null;

  const hasBoth =
    typeof ganadorAnterior === "number" &&
    typeof meta === "number" &&
    ganadorAnterior > 0;
  const gap = hasBoth ? meta! - ganadorAnterior! : null;
  const gapPct = hasBoth
    ? Math.round(((meta! - ganadorAnterior!) / ganadorAnterior!) * 100)
    : null;

  const historicoRows = entries.map((e) => ({
    anio: e.anio ?? "—",
    cargo: e.cargo ?? "—",
    pct:
      typeof e.porcentaje === "number" ? `${e.porcentaje.toFixed(2)}%` : "—",
    resultado: e.resultado ?? "—",
  }));

  const footer = padronFuente ? (
    <span>
      <span className="font-semibold text-[#0a1f4a]">Fuente padrón:</span> {padronFuente}
    </span>
  ) : undefined;

  // Refs para disparar CountUp cuando cada card entra en viewport.
  const anteriorRef = useRef<HTMLDivElement | null>(null);
  const metaRef = useRef<HTMLDivElement | null>(null);
  const anteriorInView = useInView(anteriorRef, { once: true, amount: 0.5 });
  const metaInView = useInView(metaRef, { once: true, amount: 0.5 });

  return (
    <SlideChromeData
      title="Porcentaje de votos necesarios"
      chapter={4}
      chapterHint="cuánto te falta"
      footer={footer}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center h-full">
        {/* Izquierda: histórico electoral */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          {hasHistorial ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="mb-4 text-sm uppercase tracking-[0.18em] font-black text-[#0a1f4a]">
                Historial electoral
              </p>
              <DataTable
                columns={[
                  { key: "anio", label: "Año", width: "16%" },
                  { key: "cargo", label: "Cargo", width: "40%" },
                  { key: "pct", label: "%", width: "18%", align: "right" },
                  { key: "resultado", label: "Resultado", width: "26%" },
                ]}
                rows={historicoRows}
                emphasizeFirst
                compact
              />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500"
            >
              Sin historial electoral cargado todavía.
            </motion.div>
          )}
        </div>

        {/* Derecha: pipeline electoral 3-stage */}
        <div className="lg:col-span-7 flex flex-col justify-center gap-2">
          {/* Stage 1 — Resultado anterior (navy) */}
          <motion.div
            ref={anteriorRef}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-2xl overflow-hidden shadow-xl ring-1 ring-[#0a1f4a]/20"
            style={{
              background:
                "linear-gradient(135deg, #0a1f4a 0%, #020a1e 100%)",
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400" />
            <div className="px-7 py-5 sm:px-8 sm:py-6">
              <div className="text-[10px] uppercase tracking-[0.28em] font-bold text-white/60">
                Tu última elección
              </div>
              <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                <CountUp
                  value={ganadorAnterior}
                  start={anteriorInView}
                  className="text-5xl sm:text-6xl font-black text-white leading-none"
                />
                <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/55">
                  votos
                </span>
              </div>
              {pctAnterior !== null ? (
                <div className="mt-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-amber-400/90">
                  {pctAnterior.toFixed(1)}% del padrón
                </div>
              ) : null}
            </div>
          </motion.div>

          {/* Stage 2 — GAP visual centrado */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center justify-center py-3"
          >
            {hasBoth ? (
              <>
                <TagTilt
                  label={`+${nf.format(gap!)} votos · ${gapPct}% más`}
                  tone="amber"
                  size="md"
                  rotate={-3}
                />
                <p className="mt-3 text-sm sm:text-base font-bold text-[#0a1f4a] text-center">
                  Es la diferencia entre ganar y perder.
                </p>
              </>
            ) : (
              <div className="text-xs text-slate-400 uppercase tracking-[0.2em]">
                Carga ambos datos para ver la diferencia
              </div>
            )}
          </motion.div>

          {/* Stage 3 — Meta 2026 (amber highlight) */}
          <motion.div
            ref={metaRef}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-2xl overflow-hidden shadow-2xl ring-2 ring-amber-400 bg-amber-400"
          >
            <div className="px-7 py-5 sm:px-8 sm:py-6">
              <div className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#0a1f4a]/70">
                Lo que necesitás
              </div>
              <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                <CountUp
                  value={meta}
                  start={metaInView}
                  className="text-6xl sm:text-7xl font-black text-[#0a1f4a] leading-none"
                />
                <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-[#0a1f4a]/70">
                  votos necesarios
                </span>
              </div>
              {pctMeta !== null ? (
                <div className="mt-2 text-[11px] uppercase tracking-[0.18em] font-bold text-[#0a1f4a]/80">
                  ({pctMeta}% del padrón)
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      </div>
    </SlideChromeData>
  );
}

SlideVotosNecesarios.isVisible = (
  f2: ConsultorFormFase2,
  ctx?: CandidatoContext,
): boolean => {
  const vpg = f2.votos_para_ganar;
  if (typeof vpg?.padron_actual === "number") return true;
  if (typeof vpg?.votos_meta === "number") return true;
  // Si hay distrito en la jurisdicción, podemos derivar padrón aunque el
  // form no lo tenga → slide igual aparece.
  return Boolean(ctx?.jurisdiccion?.distrito?.id);
};
