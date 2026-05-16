"use client";

/**
 * SlideContextoTerritorial — slide enriquecida con data de onboarding_fase1.
 *
 * Estilo CRÍTICO: bg #020a1e · panel #0a1e4a · gold amber-400.
 *
 * Muestra el distrito del candidato con estadísticas:
 * - Población 2025 (curada por el geógrafo)
 * - Área km²
 * - Padrón electoral último corte
 * - PIM 2026 + ranking nacional
 * - Principales problemas (de fase1_rapida)
 *
 * Prioridad de datos: DB (DistritoDetail) > fase1_rapida > simulación.
 * Si no hay distrito en la postulación → slide se oculta (predicate visible).
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import {
  fetchDistritoDetail,
  formatSoles,
  type DistritoDetail,
} from "@/lib/onboarding-fase1-api";

// ── Simulador de datos para fallback ──────────────────────────────────────────

function simTerritorio(seed: string) {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    poblacion: ((h % 500) + 50) * 1000,
    padron: Math.floor(((h % 400) + 30) * 1000 * 0.7),
    areakm2: (h % 800) + 50,
    pimMillones: (h % 150) + 20,
    rankingPim: (h % 50) + 5,
    totalDistritos: 50 + (h % 100),
    problemasTop: ["Agua y saneamiento", "Seguridad ciudadana", "Empleo"][h % 3]!,
  };
}

function fmt(n: number) {
  return n.toLocaleString("es-PE");
}

// ── Componentes internos ───────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  simulated?: boolean;
  delay?: number;
}

function StatCard({ label, value, sub, simulated = false, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5"
    >
      <p className="text-[10px] uppercase tracking-widest text-amber-400/50 font-semibold mb-2">
        {label}
      </p>
      <p className="text-3xl font-black text-white leading-none">{value}</p>
      {sub && (
        <p className={`text-xs mt-1 ${simulated ? "italic text-amber-400/25" : "text-white/40"}`}>
          {sub}
        </p>
      )}
    </motion.div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  ctx: CandidatoContext;
  f2?: ConsultorFormFase2;
}

// ── Slide ─────────────────────────────────────────────────────────────────────

export function SlideContextoTerritorial({ ctx, f2 }: Props) {
  const [detail, setDetail] = useState<DistritoDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const idDistrito = ctx.jurisdiccion.distrito?.id ?? null;

  useEffect(() => {
    if (!idDistrito) { setLoading(false); return; }
    let cancelled = false;
    fetchDistritoDetail(idDistrito, { simplify: 0, anio: 2026 })
      .then((d) => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idDistrito]);

  if (!idDistrito) return null;

  const distritoNombre =
    detail?.distrito ?? ctx.jurisdiccion.distrito?.nombre ?? "—";
  const provinciaNombre =
    detail?.provincia ?? ctx.jurisdiccion.provincia?.nombre ?? "";
  const departamentoNombre =
    detail?.departamento ?? ctx.jurisdiccion.departamento?.nombre ?? "";

  // ── Datos con fallback chain ──────────────────────────────────────

  const seed = ctx.user.full_name || distritoNombre;
  const sim = simTerritorio(seed);

  const fase1ctx = f2?.fase1_rapida?.contexto_territorio;

  const poblacionDB = detail?.poblacion_total_2025 ?? null;
  const poblacionF1 = fase1ctx?.poblacion_aproximada ?? null;
  const poblacion = poblacionDB ?? poblacionF1 ?? sim.poblacion;
  const poblacionSim = !poblacionDB && !poblacionF1;

  const areaDB = detail?.area_km2 ?? null;
  const area = areaDB ?? sim.areakm2;
  const areaSim = !areaDB;

  const densidad =
    poblacion && area ? Math.round(poblacion / area) : null;

  const padronDB = detail?.padron?.poblacion_electoral ?? null;
  const padron = padronDB ?? sim.padron;
  const padronSim = !padronDB;
  const padronLabel = detail?.padron?.eleccion_nombre ?? "Padrón electoral";

  const pimRaw = detail?.presupuesto?.pim
    ? Number(detail.presupuesto.pim)
    : null;
  const pimFormatted = pimRaw ? formatSoles(pimRaw) : `S/ ${sim.pimMillones} M`;
  const pimSim = !pimRaw;

  const ranking = detail?.ranking_pim ?? null;
  const rankingPos = ranking?.posicion ?? sim.rankingPim;
  const rankingTotal = ranking?.total ?? sim.totalDistritos;
  const rankingSim = !ranking;

  const problemasF1: string[] = fase1ctx?.principales_problemas ?? [];
  const problemasDisplay =
    problemasF1.length > 0
      ? problemasF1.slice(0, 3)
      : [sim.problemasTop, "Infraestructura vial", "Salud pública"].slice(0, 3);
  const problemasSim = problemasF1.length === 0;

  return (
    <div
      className="relative flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 min-h-[70vh]"
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
          Inteligencia Territorial
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-center leading-tight text-white"
        >
          {distritoNombre}
        </motion.h2>
        {(provinciaNombre || departamentoNombre) && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-2 text-xs sm:text-sm text-white/50 text-center font-medium"
          >
            {[provinciaNombre, departamentoNombre].filter(Boolean).join(" · ")}
          </motion.p>
        )}
        {/* Ranking pill */}
        {(ranking || rankingSim) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex justify-center mt-3"
          >
            <span className="inline-flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/30 rounded-full px-4 py-1 text-[11px] font-semibold text-amber-400">
              {rankingSim && (
                <span className="italic text-amber-400/40">~</span>
              )}
              Ranking #{rankingPos} de {fmt(rankingTotal)} distritos por presupuesto
            </span>
          </motion.div>
        )}
        {/* Amber underline */}
        <div className="absolute left-0 right-0 bottom-0 h-[2px] bg-amber-400/60" />
      </header>

      {/* Body */}
      <div className="flex-1 px-8 sm:px-12 py-8">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center h-32 text-white/30 text-sm animate-pulse">
            Cargando datos territoriales…
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {/* 2×2 stat grid */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label="Población Total"
                value={fmt(poblacion)}
                sub={poblacionSim ? "estimado (sim)" : "hab. (est. 2025)"}
                simulated={poblacionSim}
                delay={0.1}
              />
              <StatCard
                label="Área"
                value={`${fmt(area)} km²`}
                sub={
                  densidad
                    ? `${fmt(densidad)} hab/km²`
                    : areaSim
                      ? "estimado (sim)"
                      : undefined
                }
                simulated={areaSim}
                delay={0.15}
              />
              <StatCard
                label={padronLabel}
                value={fmt(padron)}
                sub={padronSim ? "estimado (sim)" : "electores habilitados"}
                simulated={padronSim}
                delay={0.2}
              />
              <StatCard
                label="PIM 2026"
                value={pimFormatted}
                sub={pimSim ? "estimado (sim)" : "Presupuesto Inst. Modificado"}
                simulated={pimSim}
                delay={0.25}
              />
            </div>

            {/* Principales problemas */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.35 }}
              className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5"
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/60 font-semibold mb-4">
                Principales problemas del territorio
                {problemasSim && (
                  <span className="ml-2 text-[10px] italic text-amber-400/25 normal-case tracking-normal">
                    (sim)
                  </span>
                )}
              </p>
              <div className="space-y-2.5">
                {problemasDisplay.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-white text-[10px] font-black">
                      {i + 1}
                    </span>
                    <span className="text-sm text-white/80">{p}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Entidad presupuestal */}
            {detail?.presupuesto?.nombre_entidad && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.45 }}
                className="px-5 py-3 border border-white/5 rounded-xl bg-white/[0.03]"
              >
                <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">
                  Entidad presupuestal
                </p>
                <p className="text-xs text-white/60">
                  {detail.presupuesto.nombre_entidad}
                  {detail.presupuesto.codigo_pliego
                    ? ` · Pliego ${detail.presupuesto.codigo_pliego}`
                    : ""}
                </p>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Predicate visible para registrar en el deck. */
export function isSlideContextoTerritorialVisible(ctx: CandidatoContext): boolean {
  return Boolean(ctx.jurisdiccion.distrito?.id);
}
