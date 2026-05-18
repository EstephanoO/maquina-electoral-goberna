"use client";

/**
 * SlideContextoTerritorial — rebuilt with MapLibre polygon + EditorialHeader.
 *
 * Layout: 2-col grid (55% map | 45% data).
 * Map is lazy-loaded via dynamic() to prevent SSR issues with MapLibre.
 * Falls back to stats-only layout when geojson/bbox are not available.
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import {
  fetchDistritoDetail,
  formatSoles,
  type DistritoDetail,
} from "@/lib/onboarding-fase1-api";
import { EditorialHeader } from "./shared/EditorialHeader";

// Lazy-load SlideMap — MapLibre requires window, cannot SSR
const SlideMapDynamic = dynamic(
  () => import("./shared/SlideMap").then(mod => ({ default: mod.SlideMap })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-white/5 rounded-xl animate-pulse" />
    ),
  }
);

// ── Urgency config ─────────────────────────────────────────────────────────────
const URGENCY_COLORS = ["#ef4444", "#f97316", "#fbbf24"] as const;
const URGENCY_WIDTHS = ["90%", "70%", "55%"] as const;

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

  // ── Map data from ctx snapshot ─────────────────────────────────────────────
  const mapGeojson = ctx.geojson as (GeoJSON.Polygon | GeoJSON.MultiPolygon) | null;
  const mapBbox = ctx.bbox ?? null;
  const hasMap = !!(mapGeojson && mapBbox);

  // ── Stats with fallback chain ──────────────────────────────────────────────
  const seed = ctx.user.full_name || distritoNombre;
  const sim = simTerritorio(seed);

  const fase1ctx = f2?.fase1_rapida?.contexto_territorio;

  const poblacionDB = detail?.poblacion_total_2025 ?? null;
  const poblacionF1 = fase1ctx?.poblacion_aproximada ?? null;
  const poblacion = poblacionDB ?? poblacionF1 ?? sim.poblacion;

  const areaDB = detail?.area_km2 ?? null;
  const area = areaDB ?? sim.areakm2;
  const areaSim = !areaDB;

  const densidad = poblacion && area ? Math.round(poblacion / area) : null;

  const padronDB = detail?.padron?.poblacion_electoral ?? null;
  const padron = padronDB ?? sim.padron;
  const padronSim = !padronDB;
  const padronLabel = detail?.padron?.eleccion_nombre ?? "Padrón electoral";

  const pimRaw = detail?.presupuesto?.pim ? Number(detail.presupuesto.pim) : null;
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
      : [sim.problemasTop, "Infraestructura vial", "Salud pública"];

  return (
    <div
      className="relative flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#020a1e]"
    >
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[55%_45%] gap-0">
        {/* ── Left col: Map (only when data present) ─────────────────────── */}
        {hasMap && !loading && (
          <div className="relative min-h-[320px] lg:min-h-0 p-4">
            <SlideMapDynamic
              geojson={mapGeojson}
              bbox={mapBbox}
              height="100%"
            />
          </div>
        )}

        {/* When no map, make right col full width */}
        <div
          className={`flex flex-col px-8 py-8 gap-6 ${!hasMap || loading ? "lg:col-span-2" : ""}`}
        >
          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-white/30 text-sm animate-pulse">
              Cargando datos territoriales…
            </div>
          )}

          {/* Editorial header */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <EditorialHeader
              microLabel="ACTO II · TERRITORIO"
              headline={`${distritoNombre} — ${padronSim ? "~" : ""}${fmt(padron)} electores.`}
              accentColor="#ef4444"
            />
          </motion.div>

          {/* Mega number: padrón */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="flex flex-col"
          >
            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">
              {padronLabel}
            </span>
            <span className="text-5xl font-black text-white tabular-nums leading-none">
              {fmt(padron)}
            </span>
            {padronSim && (
              <span className="text-[10px] italic text-amber-400/30 mt-1">estimado (sim)</span>
            )}
          </motion.div>

          {/* Urgency bars for problems */}
          {problemasDisplay.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex flex-col gap-3"
            >
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">
                Problemas urgentes
              </p>
              {problemasDisplay.map((prob, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-xs text-white/70">{prob}</span>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: URGENCY_WIDTHS[i] ?? "40%",
                        backgroundColor: URGENCY_COLORS[i] ?? "#6b7280",
                      }}
                    />
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Stats 2×2 grid */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="grid grid-cols-2 gap-3"
          >
            <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-1">Área</p>
              <p className="text-xl font-black text-white">{fmt(area)} km²</p>
              {densidad && <p className="text-[10px] text-white/30">{fmt(densidad)} hab/km²{areaSim ? " (est.)" : ""}</p>}
            </div>
            <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-1">PIM 2026</p>
              <p className="text-xl font-black text-white">{pimFormatted}</p>
              {pimSim && <p className="text-[10px] text-amber-400/30 italic">estimado (sim)</p>}
            </div>
            <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-1">Ranking</p>
              <p className="text-xl font-black text-white">#{rankingPos}</p>
              <p className="text-[10px] text-white/30">de {fmt(rankingTotal)}{rankingSim ? " (est.)" : ""}</p>
            </div>
            <div className="bg-white/[0.04] border border-white/8 rounded-xl p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-semibold mb-1">Densidad</p>
              <p className="text-xl font-black text-white">
                {densidad ? `${fmt(densidad)}` : "—"}
              </p>
              <p className="text-[10px] text-white/30">hab/km²</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Predicate visible para registrar en el deck. */
export function isSlideContextoTerritorialVisible(ctx: CandidatoContext): boolean {
  return Boolean(ctx.jurisdiccion.distrito?.id);
}
