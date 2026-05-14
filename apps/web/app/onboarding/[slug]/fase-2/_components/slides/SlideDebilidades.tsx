"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeData } from "../chrome/SlideChromeData";
import { DataTable } from "../chrome/DataTable";
import {
  RiesgoStamp,
  severityToLevel,
  statusToLevel,
} from "../chrome/RiesgoStamp";

/**
 * Slide data — Debilidades y Riesgos.
 * Layout 2-col:
 *   - Izq (60%): tabla de fuentes auditadas (denuncias, Google, reputación, JNE)
 *   - Der (40%): lista libre del consultor ordenada por severidad alta→baja
 * Stamp grande arriba-derecha si hay nivel_riesgo_global del perfil 5N.
 */
interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

type FuenteKey = "denuncias" | "google" | "reputacion_redes" | "jne_observaciones";

const FUENTE_LABEL: Record<FuenteKey, string> = {
  denuncias: "Denuncias",
  google: "Google",
  reputacion_redes: "Reputación redes",
  jne_observaciones: "JNE",
};

type GlobalLevel = "critico" | "alto" | "medio" | "bajo";

function globalRiskToLevel(
  nivel: "bajo" | "medio" | "alto" | "critico" | undefined,
): GlobalLevel | null {
  if (!nivel) return null;
  return nivel;
}

const SEV_ORDER: Record<"alta" | "media" | "baja", number> = {
  alta: 0,
  media: 1,
  baja: 2,
};

export function SlideDebilidades({ ctx, f2 }: Props) {
  const fuentes = f2.debilidades?.fuentes ?? [];
  const listaLibre = [...(f2.debilidades?.lista_libre ?? [])].sort(
    (a, b) => SEV_ORDER[a.severidad] - SEV_ORDER[b.severidad],
  );

  const nivelGlobal = globalRiskToLevel(
    f2.perfil_candidato?.n3_riesgo?.nivel_riesgo_global,
  );

  // Construir rows de la tabla.
  const rows: Array<Record<string, ReactNode>> = fuentes.map((f) => {
    const stampLevel = statusToLevel(f.estado) ?? "medio";
    const hallazgos = f.hallazgos ?? [];
    return {
      fuente: FUENTE_LABEL[f.key],
      estado: (
        <span className="inline-block">
          <RiesgoStamp level={stampLevel} size="sm" rotate={-8} />
        </span>
      ),
      hallazgos:
        hallazgos.length > 0 ? (
          <span className="text-slate-700 leading-snug">
            {hallazgos.join(" · ")}
          </span>
        ) : (
          <span className="italic text-slate-400">—</span>
        ),
    };
  });

  // Subtitle/contexto del candidato
  const subtitle = ctx.user.full_name
    ? `Auditoría preventiva · ${ctx.user.full_name}`
    : "Auditoría preventiva";

  return (
    <SlideChromeData
      title="DEBILIDADES Y RIESGOS"
      subtitle={subtitle}
      chapter={2}
      chapterHint="auditoría preventiva"
    >
      <div className="relative h-full">
        {/* Stamp global arriba-derecha — solo si hay nivel global declarado */}
        {nivelGlobal ? (
          <div className="absolute -top-2 right-0 sm:right-2 pointer-events-none z-10">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-slate-500 font-bold hidden sm:inline">
                Riesgo global
              </span>
              <RiesgoStamp level={nivelGlobal} size="lg" rotate={-12} />
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 h-full">
          {/* Columna izquierda — 60% (3/5) */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lg:col-span-3"
          >
            <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-[#0a1f4a] mb-3">
              Fuentes auditadas
            </h3>
            {rows.length > 0 ? (
              <DataTable
                columns={[
                  { key: "fuente", label: "Fuente", width: "30%" },
                  { key: "estado", label: "Estado", width: "20%", align: "center" },
                  { key: "hallazgos", label: "Hallazgos" },
                ]}
                rows={rows}
                emphasizeFirst
                compact
              />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm italic text-slate-500">
                Sin fuentes auditadas todavía.
              </div>
            )}
          </motion.div>

          {/* Columna derecha — 40% (2/5) */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="lg:col-span-2"
          >
            <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-[#0a1f4a] mb-3">
              Riesgos identificados
            </h3>
            {listaLibre.length > 0 ? (
              <ul className="space-y-3">
                {listaLibre.map((item, i) => {
                  const level = severityToLevel(item.severidad);
                  return (
                    <motion.li
                      key={`${item.titulo}-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.25 + i * 0.06 }}
                      className="relative rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#0a1f4a] leading-snug">
                            {item.titulo}
                          </p>
                          {item.descripcion ? (
                            <p className="mt-1 text-sm text-slate-600 leading-snug">
                              {item.descripcion}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 pt-0.5">
                          <RiesgoStamp level={level} size="sm" rotate={-8} />
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm italic text-slate-500">
                Sin riesgos cargados.
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </SlideChromeData>
  );
}

/**
 * Determina si la slide es relevante para el deck del candidato.
 * - Hay fuentes con estado != "ok", OR
 * - lista_libre tiene al menos un item.
 */
export function isVisible(f2: ConsultorFormFase2): boolean {
  const fuentes = f2.debilidades?.fuentes ?? [];
  const hasConcernedFuente = fuentes.some((f) => f.estado !== "ok");
  const hasLista = (f2.debilidades?.lista_libre?.length ?? 0) > 0;
  return hasConcernedFuente || hasLista;
}
