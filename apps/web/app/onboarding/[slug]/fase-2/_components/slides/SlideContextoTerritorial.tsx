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

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
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
  f2?: ConsultorFormFase2;
}

export function SlideContextoTerritorial({ ctx, f2 }: Props) {
  const [detail, setDetail] = useState<DistritoDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const idDistrito = ctx.jurisdiccion.distrito?.id ?? null;
  const ct = f2?.fase1_rapida?.contexto_territorio;

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
  // Use poblacion_aproximada from form as fallback when API doesn't return census data
  const poblacion = detail?.poblacion_total_2025 ?? ct?.poblacion_aproximada ?? null;
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
      {/* Contexto cualitativo desde Fase 1 */}
      {ct && ((ct.principales_problemas?.length ?? 0) > 0 || (ct.zonas_fuertes?.length ?? 0) > 0 || (ct.zonas_debiles?.length ?? 0) > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="px-6 sm:px-10 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-5 mt-2"
        >
          {(ct.principales_problemas?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] font-black text-slate-500 mb-2">Principales problemas</p>
              <div className="flex flex-wrap gap-1.5">
                {ct.principales_problemas!.map((p, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(ct.zonas_fuertes?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] font-black text-slate-500 mb-2">Zonas fuertes</p>
              <div className="flex flex-wrap gap-1.5">
                {ct.zonas_fuertes!.map((z, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                    {z}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(ct.zonas_debiles?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] font-black text-slate-500 mb-2">Zonas débiles</p>
              <div className="flex flex-wrap gap-1.5">
                {ct.zonas_debiles!.map((z, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                    {z}
                  </span>
                ))}
              </div>
            </div>
          )}
          {ct.notas_adicionales && (
            <div className="sm:col-span-3">
              <p className="text-xs text-slate-600 italic leading-relaxed border-l-2 border-slate-300 pl-3">
                {ct.notas_adicionales}
              </p>
            </div>
          )}
        </motion.div>
      )}
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

/** Predicate visible — true si hay distrito geográfico O datos de contexto_territorio. */
export function isSlideContextoTerritorialVisible(ctx: CandidatoContext, f2?: ConsultorFormFase2): boolean {
  if (ctx.jurisdiccion.distrito?.id) return true;
  const ct = f2?.fase1_rapida?.contexto_territorio;
  return Boolean(
    ct?.poblacion_aproximada ||
    (ct?.principales_problemas?.length ?? 0) > 0 ||
    (ct?.zonas_fuertes?.length ?? 0) > 0 ||
    (ct?.zonas_debiles?.length ?? 0) > 0,
  );
}
