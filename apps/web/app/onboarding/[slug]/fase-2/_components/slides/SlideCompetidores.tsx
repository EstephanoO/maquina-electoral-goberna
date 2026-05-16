"use client";

import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { CriticoSello, SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

const SIM_COMPETIDORES = [
  {
    nombre: "Carlos Mendoza Torres",
    partido: "Alianza para el Progreso",
    nivel_amenaza: "alto" as const,
    notas: "Bien organizado, buena presencia en redes",
  },
  {
    nombre: "María García Quispe",
    partido: "Fuerza Popular",
    nivel_amenaza: "medio" as const,
    notas: "Candidata conocida en la zona norte",
  },
  {
    nombre: "Pedro Huanca Flores",
    partido: "Perú Libre",
    nivel_amenaza: "bajo" as const,
    notas: "Candidato sin organización sólida",
  },
];

const NIVEL_CONFIG = {
  alto:  { barCls: "bg-red-600",   pct: "100%", label: "ALTO" },
  medio: { barCls: "bg-amber-600", pct: "60%",  label: "MEDIO" },
  bajo:  { barCls: "bg-slate-600", pct: "25%",  label: "BAJO" },
} as const;

export function SlideCompetidores({ ctx, f2 }: Props) {
  const raw = f2.fase1_rapida?.diagnostico_inicial?.principales_competidores ?? [];
  const isSimulated = raw.length === 0;
  const competidores = isSimulated ? SIM_COMPETIDORES : raw;

  const lugar =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    "el territorio";

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Análisis de Competencia</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Los competidores en el terreno
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {lugar} · {competidores.length} competidor
          {competidores.length !== 1 ? "es" : ""} identificado
          {competidores.length !== 1 ? "s" : ""}
        </p>
      </motion.div>

      {/* ── Cards ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 flex-1">
        {competidores.map((competidor, i) => {
          const nivel = competidor.nivel_amenaza ?? "bajo";
          const cfg = NIVEL_CONFIG[nivel];

          return (
            <motion.div
              key={`${competidor.nombre}-${i}`}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.1 + i * 0.1 }}
              className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5 relative"
            >
              <div className="flex items-start gap-4">
                {/* Ranking number */}
                <div className="text-4xl font-black text-white/10 leading-none select-none">
                  #{String(i + 1).padStart(2, "0")}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm leading-snug">
                    {competidor.nombre}
                  </p>
                  {competidor.partido && (
                    <p className="text-xs text-white/50 mt-0.5">
                      {competidor.partido}
                    </p>
                  )}

                  {/* Threat bar */}
                  <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: cfg.pct }}
                      transition={{
                        duration: 0.6,
                        delay: 0.3 + i * 0.1,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className={`h-full rounded-full ${cfg.barCls}`}
                    />
                  </div>
                  <p className="text-[10px] text-white/40 mt-1">
                    Nivel de amenaza:{" "}
                    <span className="font-semibold">{cfg.label}</span>
                  </p>

                  {/* Notas */}
                  {competidor.notas && (
                    <p className="text-[11px] text-white/30 mt-2 leading-snug italic">
                      {competidor.notas}
                    </p>
                  )}
                </div>

                {/* Sello crítico para nivel alto */}
                {nivel === "alto" && (
                  <div className="flex-shrink-0">
                    <CriticoSello tipo="critico" />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">
          Fuente: datos del consultor · {competidores.length} competidores
          identificados
        </p>
        {isSimulated && (
          <p className="text-[10px] italic text-amber-400/20">datos simulados</p>
        )}
      </motion.div>
    </div>
  );
}

/** Visible si hay competidores cargados — siempre muestra (con simulados si vacío). */
export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
