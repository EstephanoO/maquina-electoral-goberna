"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideNucleoGoberna({ f2 }: Props) {
  const sint = f2.terreno?.sintesis;
  const segmentos = sint?.segmentos_prioritarios ?? [];
  const mensajes = sint?.mensaje_diferenciado ?? {};
  const alianzas = sint?.alianzas ?? [];
  const riesgos = sint?.riesgos ?? [];
  const indicadores = sint?.indicadores ?? [];

  const mensajeEntries = Object.entries(mensajes);

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Núcleo Goberna · Outputs Estratégicos</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Estrategia central
        </h2>
        <p className="text-sm text-white/40 mt-1">
          Segmentos, mensajes y vectores de acción
        </p>
      </motion.div>

      {/* ── Segmentos prioritarios ────────────────────────────────────────── */}
      {segmentos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            Segmentos prioritarios
          </p>
          <div className="flex flex-wrap gap-2">
            {segmentos.map((seg, si) => (
              <span
                key={`seg-${si}`}
                className="inline-block bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold px-3 py-1 rounded-full"
              >
                {seg}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Mensajes diferenciados ────────────────────────────────────────── */}
      {mensajeEntries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            Mensajes diferenciados
          </p>
          <div className="flex flex-col gap-2">
            {mensajeEntries.map(([segmento, mensaje], mi) => (
              <div
                key={`msg-${mi}`}
                className="bg-[#0a1e4a] border border-white/10 rounded-xl px-4 py-3 flex flex-col gap-0.5"
              >
                <p className="text-[10px] font-semibold text-amber-400/60 uppercase tracking-wider">
                  {segmento}
                </p>
                <p className="text-xs text-white/70 leading-snug">{mensaje}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── 3 columnas: Alianzas / Riesgos / Indicadores ─────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="grid grid-cols-3 gap-3 flex-1"
      >
        {/* Alianzas */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-400">
            Alianzas
          </p>
          {alianzas.length === 0 ? (
            <p className="text-[10px] text-white/20 italic">—</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {alianzas.map((a, ai) => (
                <li key={`al-${ai}`} className="text-[10px] text-white/60 leading-snug">
                  · {a}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Riesgos */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-[9px] font-black uppercase tracking-wider text-red-400">
            Riesgos
          </p>
          {riesgos.length === 0 ? (
            <p className="text-[10px] text-white/20 italic">—</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {riesgos.map((r, ri) => (
                <li key={`ri-${ri}`} className="text-[10px] text-white/60 leading-snug">
                  · {r}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Indicadores */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex flex-col gap-2">
          <p className="text-[9px] font-black uppercase tracking-wider text-blue-400">
            Indicadores
          </p>
          {indicadores.length === 0 ? (
            <p className="text-[10px] text-white/20 italic">—</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {indicadores.map((ind, ii) => (
                <li key={`ind-${ii}`} className="text-[10px] text-white/60 leading-snug">
                  · {ind}
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function isSlideNucleoGobernaVisible(f2: ConsultorFormFase2): boolean {
  return !!(f2.terreno?.sintesis?.segmentos_prioritarios?.length);
}
