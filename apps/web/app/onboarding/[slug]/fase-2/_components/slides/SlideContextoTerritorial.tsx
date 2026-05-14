"use client";

/**
 * SlideContextoTerritorial — slide enriquecida con data de onboarding_fase1.
 *
 * Muestra el distrito del candidato con maplibre + estadísticas:
 * - Población 2025 (curada por el geógrafo)
 * - PIM 2026 + ranking nacional (datos_externos.presupuesto_municipal)
 * - Área en km² (calculada de la geometría)
 * - Densidad poblacional
 * - Padrón electoral último corte (si hay)
 *
 * Si no hay distrito en la postulación → slide se oculta (predicate visible).
 * Si hay distrito pero no data externa → muestra solo lo geográfico.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { Building2, Users, Coins, TrendingUp } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";
import {
  fetchDistritoDetail,
  formatNumero,
  formatSoles,
  type DistritoDetail,
} from "@/lib/onboarding-fase1-api";

import { SlideChromeData } from "../chrome/SlideChromeData";

const JurisdictionMap = dynamic(
  () =>
    import("../../../../carta/_components/JurisdictionMap").then(
      (m) => m.JurisdictionMap,
    ),
  { ssr: false },
);

interface Props {
  ctx: CandidatoContext;
}

export function SlideContextoTerritorial({ ctx }: Props) {
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

  if (!idDistrito) {
    // Sin distrito en la jurisdicción → slide se oculta (predicate visible)
    return null;
  }

  const distritoNombre = detail?.distrito ?? ctx.jurisdiccion.distrito?.nombre ?? "—";
  const poblacion = detail?.poblacion_total_2025 ?? null;
  const areaKm2 = detail?.area_km2 ?? null;
  const densidad = poblacion && areaKm2 ? Math.round(poblacion / areaKm2) : null;
  const pim = detail?.presupuesto?.pim ?? null;
  const ranking = detail?.ranking_pim ?? null;
  const padron = detail?.padron ?? null;

  return (
    <SlideChromeData
      title="Contexto territorial"
      subtitle={`${distritoNombre} — ${ctx.jurisdiccion.provincia?.nombre ?? ""}`}
      chapter={2}
      chapterHint="diagnóstico territorial"
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 sm:p-10">
        {/* Mapa */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-3 rounded-2xl overflow-hidden border border-slate-200 min-h-[420px] relative"
        >
          {detail ? (
            <JurisdictionMap
              geojson={detail.geojson}
              bbox={detail.bbox}
              centroid={detail.centroid}
              className="absolute inset-0"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400">
              {loading ? "Cargando mapa…" : "Sin datos geográficos"}
            </div>
          )}
        </motion.div>

        {/* KPIs */}
        <div className="lg:col-span-2 space-y-4">
          <KpiCard
            icon={<Users className="w-5 h-5" />}
            label="Población 2025"
            value={formatNumero(poblacion)}
            subtitle={areaKm2 ? `${formatNumero(areaKm2)} km² · ${formatNumero(densidad)} hab/km²` : undefined}
            tone="amber"
            delay={0.1}
          />
          <KpiCard
            icon={<Coins className="w-5 h-5" />}
            label="PIM 2026"
            value={pim ? formatSoles(pim) : "Sin data MEF"}
            subtitle={
              ranking
                ? `#${ranking.posicion} de ${formatNumero(ranking.total)} distritos`
                : pim
                  ? "Presupuesto Institucional Modificado"
                  : undefined
            }
            tone="navy"
            delay={0.2}
          />
          {padron && (
            <KpiCard
              icon={<TrendingUp className="w-5 h-5" />}
              label={`Padrón ${padron.eleccion_codigo}`}
              value={formatNumero(padron.poblacion_electoral)}
              subtitle={`${padron.fuente} · ${padron.eleccion_nombre}`}
              tone="slate"
              delay={0.3}
            />
          )}
          {detail?.presupuesto?.nombre_entidad && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 mt-0.5 text-slate-400" />
                <div>
                  <div className="font-medium text-slate-800">{detail.presupuesto.nombre_entidad}</div>
                  <div className="mt-1 text-slate-500">
                    Pliego {detail.presupuesto.codigo_pliego ?? "—"} · {detail.presupuesto.fuente}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SlideChromeData>
  );
}

function KpiCard({
  icon,
  label,
  value,
  subtitle,
  tone,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone: "amber" | "navy" | "slate";
  delay: number;
}) {
  const styles = {
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", icon: "text-amber-600" },
    navy:  { bg: "bg-[#0a1f4a]", border: "border-[#0a1f4a]", text: "text-white", icon: "text-amber-400" },
    slate: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-900", icon: "text-slate-500" },
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`rounded-2xl border ${styles.border} ${styles.bg} px-5 py-4`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={styles.icon}>{icon}</span>
        <span className={`text-xs uppercase tracking-wider font-medium ${tone === "navy" ? "text-white/70" : "text-slate-500"}`}>
          {label}
        </span>
      </div>
      <div className={`text-3xl font-bold ${styles.text}`}>{value}</div>
      {subtitle && (
        <div className={`text-xs mt-1 ${tone === "navy" ? "text-white/60" : "text-slate-500"}`}>{subtitle}</div>
      )}
    </motion.div>
  );
}

/** Predicate visible para registrar en el deck. */
export function isSlideContextoTerritorialVisible(ctx: CandidatoContext): boolean {
  return Boolean(ctx.jurisdiccion.distrito?.id);
}
