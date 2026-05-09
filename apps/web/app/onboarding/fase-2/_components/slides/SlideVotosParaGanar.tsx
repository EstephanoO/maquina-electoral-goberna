"use client";

import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { SlideShell } from "./SlideShell";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

export function SlideVotosParaGanar({ ctx }: Props) {
  const jurisdiccion =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre;

  // Hasta que la capa 1 (INFOGOB / ONPE) esté cargada, mostramos
  // placeholders elegantes. Cuando llegue la data, el server llena
  // estos campos.
  const ganadorAnterior = "[A completar]";
  const votosGanador = "[A completar]";
  const porcentajeGanador = "[A completar]";
  const padronElectoral = "[A completar]";
  const votosNecesarios = "[A completar]";

  return (
    <SlideShell
      kicker="Análisis electoral · Slide 4"
      title={`¿CUÁNTOS VOTOS HACEN FALTA PARA GANAR EN ${jurisdiccion.toUpperCase()}?`}
    >
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed"
        >
          La pregunta más concreta de toda campaña: ¿cuál es el número?
          Aquí lo calculamos a partir del padrón electoral y del histórico
          del cargo en {jurisdiccion}.
        </motion.p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Cuánto sacó el ganador anterior */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="bg-white/[0.04] border border-amber-400/30 rounded-md p-5 sm:p-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="size-5 text-amber-400" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-bold">
                Última elección
              </span>
            </div>
            <div className="text-5xl sm:text-6xl font-black text-amber-400 leading-none mb-1">
              {votosGanador}
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/60 font-bold">
              Votos del ganador
            </div>
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold mb-1">
                Quién ganó
              </div>
              <div className="text-base text-white font-bold">{ganadorAnterior}</div>
              <div className="text-sm text-amber-400 font-bold mt-1">
                {porcentajeGanador} del voto válido
              </div>
            </div>
          </motion.div>

          {/* Padrón electoral */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="bg-white/[0.04] border border-white/15 rounded-md p-5 sm:p-6"
          >
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-bold mb-3">
              Padrón actual (RENIEC)
            </div>
            <div className="text-5xl sm:text-6xl font-black text-white leading-none mb-1">
              {padronElectoral}
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/60 font-bold">
              Electores hábiles
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5 text-sm text-gray-400">
              <div>
                <span className="text-amber-400/80 font-bold">·</span> Tasa histórica de participación
              </div>
              <div>
                <span className="text-amber-400/80 font-bold">·</span> Voto en blanco / nulo (descontamos)
              </div>
              <div>
                <span className="text-amber-400/80 font-bold">·</span> Distribución por mesa
              </div>
            </div>
          </motion.div>

          {/* El número que importa */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.5 }}
            className="bg-gradient-to-br from-amber-400 to-amber-500 text-[#0a1e4a] rounded-md p-5 sm:p-6 shadow-2xl shadow-amber-400/20"
          >
            <div className="text-[10px] uppercase tracking-[0.25em] font-black mb-3">
              Tu meta
            </div>
            <div className="text-6xl sm:text-7xl font-black leading-none mb-1">
              {votosNecesarios}
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] font-black">
              Votos para ganar
            </div>
            <p className="mt-4 pt-3 border-t border-[#0a1e4a]/20 text-sm leading-relaxed font-semibold">
              Calculado con margen de seguridad sobre el ganador anterior + escenario
              de competencia fragmentada.
            </p>
          </motion.div>
        </div>

        {/* Nota de fuente */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 text-xs text-white/40 italic"
        >
          Fuente: ONPE · INFOGOB · Padrón RENIEC. Cálculo Goberna sobre datos públicos.
        </motion.p>
      </div>
    </SlideShell>
  );
}
