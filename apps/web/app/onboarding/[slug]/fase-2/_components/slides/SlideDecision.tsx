"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

const AMENAZA_CLS = {
  alto:  "bg-red-500/10 border-red-500/30 text-red-400",
  medio: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  bajo:  "bg-slate-500/10 border-slate-500/30 text-slate-400",
} as const;

function formatNum(n: number | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("es-PE");
}

export function SlideDecision({ f2 }: Props) {
  const t = f2.terreno;
  const d1 = t?.d1_universo;
  const d2 = t?.d2_historial;
  const d3 = t?.d3_oferta;

  const candidatos = d3?.candidatos ?? [];
  const elecciones = (d2?.elecciones ?? []).slice(0, 5);

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Dimensión D · Decisión</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          La decisión electoral
        </h2>
        <p className="text-sm text-white/40 mt-1">Universo, oferta y comportamiento histórico</p>
      </motion.div>

      {/* ── Fila top: 3 números grandes ─────────────────────────────────── */}
      {d1 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { label: "Padrón", value: formatNum(d1.padron_total ?? d1.padron_habilitado) },
            { label: "Votos necesarios", value: formatNum(d1.votos_necesarios) },
            { label: "Abstención hist.", value: d1.abstencion_historica_pct != null ? `${d1.abstencion_historica_pct}%` : "—" },
          ].map((stat, si) => (
            <div
              key={`stat-${si}`}
              className="bg-[#0a1e4a] border border-white/10 rounded-xl p-3 flex flex-col gap-0.5"
            >
              <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold leading-tight">
                {stat.label}
              </p>
              <p className="text-xl sm:text-2xl font-black text-white tabular-nums leading-tight">
                {stat.value}
              </p>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── D3 Candidatos / Oferta política ─────────────────────────────── */}
      {candidatos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            D3 · Oferta política
          </p>
          {candidatos.map((cand, ci) => {
            const nivel = cand.nivel_amenaza ?? "bajo";
            const cls = AMENAZA_CLS[nivel];
            return (
              <motion.div
                key={`cand-${ci}`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + ci * 0.07 }}
                className="flex items-center gap-3 bg-[#0a1e4a] border border-white/10 rounded-xl px-4 py-3"
              >
                <span className="text-[10px] font-black text-white/20 tabular-nums w-4">
                  {ci + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white leading-snug">{cand.nombre}</p>
                  {cand.partido && (
                    <p className="text-[10px] text-white/40">{cand.partido}</p>
                  )}
                </div>
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${cls}`}
                >
                  {nivel}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ── D2 Historial electoral ───────────────────────────────────────── */}
      {elecciones.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            D2 · Historial electoral
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-white/25">
                  <th className="text-left pb-1.5 pr-3 font-semibold">Año</th>
                  <th className="text-left pb-1.5 pr-3 font-semibold">Ganador</th>
                  <th className="text-right pb-1.5 font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {elecciones.map((el, ei) => (
                  <tr key={`el-${ei}`} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 text-white/50 tabular-nums font-mono">
                      {el.anio}
                    </td>
                    <td className="py-1.5 pr-3 text-white/70 leading-snug">{el.ganador}</td>
                    <td className="py-1.5 text-right text-white/40 tabular-nums">
                      {el.pct_ganador != null ? `${el.pct_ganador}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideDecisionVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.terreno?.d1_universo || f2.terreno?.d3_oferta);
}
