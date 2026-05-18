"use client";

/**
 * SlideVotosNecesarios — slide CRÍTICO de meta electoral.
 *
 * Estilo CRÍTICO: bg #020a1e · panel #0a1e4a · gold amber-400.
 *
 * Layout:
 * - Izquierda: historial electoral (tabla oscura) o placeholder.
 * - Derecha: pipeline 3 columnas (ganador anterior → gap → meta 2026).
 *
 * Prioridad datos:
 *   f2.votos_para_ganar > DistritoDetail.padron > simTerritorio()
 *
 * CountUp se dispara cuando la card entra en el viewport.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import {
  fetchDistritoDetail,
  type DistritoDetail,
} from "@/lib/onboarding-fase1-api";

// ── Simulador ─────────────────────────────────────────────────────────────────

function simTerritorio(seed: string) {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    padron: Math.floor(((h % 400) + 30) * 1000 * 0.7),
    votosEmitidos: Math.floor(((h % 400) + 30) * 1000 * 0.7 * 0.72),
    votosGanador: Math.floor(((h % 400) + 30) * 1000 * 0.7 * 0.72 * 0.35),
    metaVotos: Math.floor(((h % 400) + 30) * 1000 * 0.7 * 0.72 * 0.36),
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("es-PE");
const fmt = (n: number | undefined | null) =>
  typeof n === "number" && Number.isFinite(n) ? nf.format(n) : "—";

// ── CountUp ───────────────────────────────────────────────────────────────────

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

  return (
    <span className={`tabular-nums ${className ?? ""}`}>{nf.format(current)}</span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  f2: ConsultorFormFase2;
  /** Si se provee, busca padrón en onboarding_fase1 cuando no esté en el form. */
  ctx?: CandidatoContext;
}

// ── Slide ─────────────────────────────────────────────────────────────────────

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

  // Simulador como último fallback
  const seed = ctx?.user.full_name ?? ctx?.jurisdiccion.distrito?.nombre ?? "candidato";
  const sim = simTerritorio(seed);

  const padron = vpg.padron_actual ?? padronEnriquecido ?? sim.padron;
  const padronFuente =
    typeof vpg.padron_actual === "number"
      ? vpg.fuente ?? null
      : enrichment?.padron
        ? `${enrichment.padron.fuente} · ${enrichment.padron.eleccion_codigo}`
        : enrichment?.poblacion_total_2025
          ? "Estimación: 70% de la población 2025 (INEI)"
          : "Estimación simulada";

  const meta = vpg.votos_meta ?? sim.metaVotos;
  const ganadorAnterior = vpg.votos_ganador_anterior ?? sim.votosGanador;
  const isMeta = typeof vpg.votos_meta === "number";
  const isGanador = typeof vpg.votos_ganador_anterior === "number";
  const metaSim = !isMeta;
  const ganadorSim = !isGanador;

  // Año de referencia del historial más reciente
  const anioRef =
    entries.length > 0
      ? (entries.reduce((prev, e) => (e.anio > prev.anio ? e : prev)).anio)
      : new Date().getFullYear() - 3;

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

  const gap =
    typeof ganadorAnterior === "number" && typeof meta === "number"
      ? meta - ganadorAnterior
      : null;
  const gapPct =
    gap !== null && ganadorAnterior > 0
      ? Math.round((gap / ganadorAnterior) * 100)
      : null;

  // ── InView refs para CountUp ──────────────────────────────────────
  const anteriorRef = useRef<HTMLDivElement | null>(null);
  const metaRef = useRef<HTMLDivElement | null>(null);
  const anteriorInView = useInView(anteriorRef, { once: true, amount: 0.5 });
  const metaInView = useInView(metaRef, { once: true, amount: 0.5 });

  return (
    <div
      className="relative flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10"
      style={{ background: "#020a1e" }}
    >
      {/* Header */}
      <header className="relative px-8 sm:px-12 py-7 text-white">
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[11px] uppercase tracking-[0.2em] text-amber-400/60 font-semibold text-center mb-2"
        >
          Votos Para Ganar
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-center leading-tight text-white"
        >
          La Meta Electoral
        </motion.h2>
        {padron && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-2 text-xs text-white/40 text-center"
          >
            Padrón habilitado: <span className="text-white/70 font-semibold">{fmt(padron)}</span>
            {" "}electores
          </motion.p>
        )}
        <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-amber-400/60" />
      </header>

      {/* Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 px-8 sm:px-12 py-8 items-start">

        {/* Izquierda: historial electoral */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          {hasHistorial ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="mb-3 text-[11px] uppercase tracking-[0.2em] font-black text-amber-400/60">
                Historial electoral
              </p>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0a1e4a]">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      {["Año", "Cargo", "%", "Resultado"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-[10px] uppercase tracking-widest font-black text-amber-400/70 border-b border-white/10"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr
                        key={i}
                        className={i % 2 === 0 ? "bg-transparent" : "bg-white/[0.03]"}
                      >
                        <td className="px-3 py-2 font-bold text-white/90 text-sm border-t border-white/5">
                          {e.anio ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-white/60 text-xs border-t border-white/5">
                          {e.cargo ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-amber-400 text-sm font-semibold text-right border-t border-white/5">
                          {typeof e.porcentaje === "number"
                            ? `${e.porcentaje.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 border-t border-white/5">
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                              e.resultado?.toLowerCase().includes("gana") ||
                              e.resultado?.toLowerCase().includes("electo")
                                ? "bg-emerald-500/20 text-emerald-400"
                                : e.resultado?.toLowerCase().includes("pierde") ||
                                    e.resultado?.toLowerCase().includes("derrot")
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-white/10 text-white/50"
                            }`}
                          >
                            {e.resultado ?? "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="rounded-xl border border-white/10 bg-[#0a1e4a] p-6 text-center"
            >
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">
                Historial electoral
              </p>
              <p className="text-sm text-white/30">Sin historial electoral cargado.</p>
            </motion.div>
          )}

          {/* Padrón fuente */}
          {padronFuente && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="mt-4 text-[10px] text-white/25 italic"
            >
              Fuente padrón: {padronFuente}
            </motion.p>
          )}
        </div>

        {/* Derecha: pipeline 3 columnas */}
        <div className="lg:col-span-7 flex flex-col gap-3 justify-center">
          <p className="text-[11px] uppercase tracking-[0.2em] font-black text-amber-400/60 mb-1">
            Pipeline electoral
          </p>

          <div className="grid grid-cols-3 gap-3 items-center">
            {/* Col 1: Ganador anterior */}
            <motion.div
              ref={anteriorRef}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5 text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500/60" />
              <p className="text-[9px] uppercase tracking-widest text-white/40 mb-3">
                Ganador anterior
              </p>
              <CountUp
                value={ganadorAnterior}
                start={anteriorInView}
                className="text-3xl sm:text-4xl font-black text-red-400 leading-none block"
              />
              <p className="text-[10px] text-white/30 mt-1">
                votos · {anioRef}
              </p>
              {pctAnterior !== null && (
                <p className="text-[10px] text-red-400/60 mt-1 font-semibold">
                  {pctAnterior.toFixed(1)}% del padrón
                </p>
              )}
              {ganadorSim && (
                <p className="text-[9px] italic text-amber-400/20 mt-1">sim</p>
              )}
            </motion.div>

            {/* Col 2: Gap / flecha */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center text-center gap-2"
            >
              {gap !== null ? (
                <>
                  <p className="text-xl sm:text-2xl font-black text-amber-400 leading-none">
                    {gap > 0 ? "+" : ""}{fmt(gap)}
                  </p>
                  <p className="text-[9px] text-white/40 uppercase tracking-widest">
                    votos adicionales
                  </p>
                  {gapPct !== null && (
                    <span className="text-[10px] font-bold text-amber-400/70">
                      {gapPct > 0 ? "+" : ""}{gapPct}%
                    </span>
                  )}
                  <div className="flex gap-0.5 text-amber-400/60">
                    <span className="text-lg">→</span>
                  </div>
                </>
              ) : (
                <p className="text-[9px] text-white/30 uppercase tracking-widest leading-relaxed">
                  Cargá ambos datos
                </p>
              )}
            </motion.div>

            {/* Col 3: Meta 2026 */}
            <motion.div
              ref={metaRef}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="bg-amber-400/10 border border-amber-400/30 rounded-2xl p-5 text-center relative overflow-hidden"
            >
              {/* Sello META */}
              <div className="absolute -top-2 right-3">
                <span
                  className="bg-blue-700 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block"
                  style={{ transform: "rotate(-3deg)" }}
                >
                  META
                </span>
              </div>
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-400/60" />
              <p className="text-[9px] uppercase tracking-widest text-amber-400/60 mb-3">
                Objetivo 2026
              </p>
              <CountUp
                value={meta}
                start={metaInView}
                className="text-3xl sm:text-4xl font-black text-amber-400 leading-none block"
              />
              <p className="text-[10px] text-amber-400/50 mt-1">votos para ganar</p>
              {pctMeta !== null && (
                <p className="text-[10px] text-amber-400/70 mt-1 font-semibold">
                  {pctMeta}% del padrón
                </p>
              )}
              {metaSim && (
                <p className="text-[9px] italic text-amber-400/20 mt-1">sim</p>
              )}
            </motion.div>
          </div>

          {/* GAP bar — elemento central */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.9 }}
            className="flex flex-col gap-3"
          >
            <div className="flex justify-between w-full text-sm font-semibold">
              <span className="text-red-400">
                HOY: 0%{" "}
                <span className="text-xs text-white/30">(sin encuesta)</span>
              </span>
              <span className="text-amber-400">META: 50% del padrón</span>
            </div>
            <div className="relative w-full h-10 bg-white/5 rounded-xl overflow-hidden border border-white/[0.08]">
              <div
                className="absolute left-0 top-0 bottom-0"
                style={{
                  background:
                    "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(251,191,36,0.12) 4px,rgba(251,191,36,0.12) 5px)",
                  width: "50%",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-white/50">
                  {padron
                    ? `${Math.round(padron * 0.3).toLocaleString()} votos · GAP completo`
                    : "GAP completo"}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-white/25 text-center">
              La zona punteada representa los votos que necesitamos construir desde cero.
            </p>
          </motion.div>

          {/* Barra de padrón + participación estimada */}
          {padron && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1 }}
              className="grid grid-cols-2 gap-3 mt-1"
            >
              <div className="bg-[#0a1e4a] border border-white/10 rounded-xl px-4 py-3">
                <p className="text-[9px] uppercase tracking-widest text-white/30 font-semibold mb-1">
                  Padrón habilitado
                </p>
                <p className="text-base font-black text-white">{fmt(padron)}</p>
              </div>
              <div className="bg-[#0a1e4a] border border-white/10 rounded-xl px-4 py-3">
                <p className="text-[9px] uppercase tracking-widest text-white/30 font-semibold mb-1">
                  Participación estimada
                </p>
                <p className="text-base font-black text-white">
                  {fmt(Math.round(padron * 0.72))}
                  <span className="text-[10px] text-white/40 ml-1 font-normal">votos (72%)</span>
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
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
