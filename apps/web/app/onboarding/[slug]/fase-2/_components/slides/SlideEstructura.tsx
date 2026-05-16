"use client";

import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

const INTENSIDAD_CLS = {
  alta:  "bg-red-500/10 border-red-500/30 text-red-400",
  media: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  baja:  "bg-slate-500/10 border-slate-500/30 text-slate-400",
} as const;

const TREND_SYMBOL = {
  subiendo: "↑",
  estable:  "→",
  bajando:  "↓",
} as const;

export function SlideEstructura({ ctx, f2 }: Props) {
  const t = f2.terreno;
  const e1 = t?.e1_demografia;
  const e2 = t?.e2_capital_economico;
  const e3 = t?.e3_capital_cultural_social;
  const e4 = t?.e4_campo_politico;
  const e5 = t?.e5_cleavages;

  const lugar =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    "el territorio";

  const topPartidos = (e4?.partidos_fuertes ?? []).slice(0, 3);

  const cuadrantes = [
    {
      key: "e1",
      letra: "E1",
      titulo: "Demografía",
      detalle: e1?.distribucion_urbano_rural ?? e1?.grupos_etarios ?? "—",
      notas: e1?.notas,
      sub: e1?.poblacion_total
        ? `${e1.poblacion_total.toLocaleString()} hab.`
        : undefined,
    },
    {
      key: "e2",
      letra: "E2",
      titulo: "Capital Económico",
      detalle: e2?.principales_sectores?.slice(0, 2).join(" · ") ?? "—",
      notas: e2?.notas,
      sub: e2?.nivel_pobreza_pct != null
        ? `Pobreza ${e2.nivel_pobreza_pct}%`
        : undefined,
    },
    {
      key: "e3",
      letra: "E3",
      titulo: "Capital Cultural/Social",
      detalle: e3?.identidades_dominantes?.slice(0, 2).join(" · ") ?? "—",
      notas: e3?.notas,
      sub: e3?.organizaciones_clave?.length
        ? `${e3.organizaciones_clave.length} orgs. clave`
        : undefined,
    },
    {
      key: "e4",
      letra: "E4",
      titulo: "Campo Político",
      detalle: e4?.voto_historico_tendencia ?? "—",
      notas: e4?.notas,
      sub: e4?.nivel_polarizacion
        ? `Polarización: ${e4.nivel_polarizacion}`
        : undefined,
    },
  ] as const;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Dimensión E · Estructura</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Estructura del territorio
        </h2>
        <p className="text-sm text-white/40 mt-1">{lugar}</p>
      </motion.div>

      {/* ── Grid E1/E2/E3/E4 ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
        {cuadrantes.map((q, qi) => (
          <motion.div
            key={q.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + qi * 0.07 }}
            className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-amber-400/60 uppercase tracking-widest">
                {q.letra}
              </span>
              <span className="text-sm font-bold text-white">{q.titulo}</span>
              {q.sub && (
                <span className="ml-auto text-[10px] text-white/30 tabular-nums">
                  {q.sub}
                </span>
              )}
            </div>
            <p className="text-xs text-white/60 leading-snug">{q.detalle}</p>

            {/* E4: partidos con barras */}
            {q.key === "e4" && topPartidos.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
                {topPartidos.map((p, pi) => (
                  <div key={`p-${pi}`} className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50 truncate max-w-[100px]">
                      {p.nombre}
                    </span>
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${p.pct_aprox ?? 30}%` }}
                        transition={{ duration: 0.6, delay: 0.4 + pi * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-blue-500"
                      />
                    </div>
                    <span className="text-[10px] text-white/40 tabular-nums w-7 text-right">
                      {p.pct_aprox != null ? `${p.pct_aprox}%` : ""}
                    </span>
                    {p.trend && (
                      <span className="text-[10px] text-white/30">
                        {TREND_SYMBOL[p.trend]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {q.notas && (
              <p className="text-[10px] text-white/25 italic leading-snug border-t border-white/5 pt-2">
                {q.notas}
              </p>
            )}
          </motion.div>
        ))}
      </div>

      {/* ── E5 Cleavages ──────────────────────────────────────────────── */}
      {e5?.fracturas_vigentes && e5.fracturas_vigentes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="border-t border-white/5 pt-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30 mb-2">
            E5 · Fracturas / Cleavages
          </p>
          <div className="flex flex-wrap gap-2">
            {e5.fracturas_vigentes.map((f, fi) => {
              const intensidad = f.intensidad ?? "baja";
              const cls = INTENSIDAD_CLS[intensidad];
              return (
                <span
                  key={`cl-${fi}`}
                  className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-[11px] font-semibold ${cls}`}
                >
                  {f.nombre}
                  <span className="opacity-60 text-[9px] uppercase">{f.intensidad}</span>
                </span>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideEstructuraVisible(_ctx: CandidatoContext, f2: ConsultorFormFase2): boolean {
  return !!(
    f2.terreno?.e1_demografia ||
    f2.terreno?.e4_campo_politico ||
    f2.terreno?.e5_cleavages
  );
}
