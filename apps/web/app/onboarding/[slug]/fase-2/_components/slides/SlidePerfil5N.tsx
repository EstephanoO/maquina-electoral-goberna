"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2, CandidatoContext } from "@/lib/onboarding-api";
import type { Semaforo } from "@/lib/onboarding-schema";
import { SEMAFORO_BG, SEMAFORO_COLOR, SEMAFORO_LABEL } from "@/lib/onboarding-schema";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props { ctx: CandidatoContext; f2: ConsultorFormFase2 }

const NIVELES = [
  {
    key: "n1_identidad" as const,
    label: "N1 · Identidad",
    desc: "Documentación, consistencia de datos personales",
    criterios: { verde: "Identidad totalmente consistente", amarillo: "Inconsistencias menores en datos", rojo: "Documentación cuestionable o suplantación" },
  },
  {
    key: "n2_trayectoria" as const,
    label: "N2 · Trayectoria",
    desc: "Estudios verificados, historial laboral y político",
    criterios: { verde: "Verificados al 100%", amarillo: "Algún título sin verificar o cambios partidarios frecuentes", rojo: "Títulos inflados o falsos, vacíos sin explicar" },
  },
  {
    key: "n3_riesgo" as const,
    label: "N3 · Riesgo Legal",
    desc: "Antecedentes penales, deudas, escándalos",
    criterios: { verde: "Sin antecedentes ni escándalos relevantes", amarillo: "Proceso resuelto o escándalo antiguo", rojo: "Proceso en curso, sentencia firme o escándalo vigente" },
  },
  {
    key: "n4_patrimonio" as const,
    label: "N4 · Patrimonio",
    desc: "Coherencia entre ingresos declarados y patrimonio",
    criterios: { verde: "Patrimonio coherente con ingresos", amarillo: "Estructuras complejas o pequeñas inconsistencias", rojo: "Patrimonio inexplicable, offshore opacos, conflictos de interés" },
  },
  {
    key: "n5_salud" as const,
    label: "N5 · Salud",
    desc: "Capacidad funcional para el cargo",
    criterios: { verde: "Apto, informe médico positivo", amarillo: "Condición crónica controlada y declarada", rojo: "Condición que compromete capacidad o se intentó ocultar" },
  },
] as const;

export function SlidePerfil5N({ ctx, f2 }: Props) {
  const p = f2.perfil;
  const global = p?.resumen_ejecutivo?.semaforo_global;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex items-end justify-between"
      >
        <div>
          <EditorialHeader
            microLabel="ACTO I · PERFIL 5N"
            headline="Cinco dimensiones que definen la posición del candidato."
            accentColor="#fbbf24"
          />
        </div>
        {global && (
          <div className={`rounded-xl border px-4 py-2 text-sm font-bold ${SEMAFORO_BG[global]} ${SEMAFORO_COLOR[global]}`}>
            Global: {SEMAFORO_LABEL[global]}
          </div>
        )}
      </motion.div>

      <div className="flex flex-col gap-4 flex-1">
        {NIVELES.map((nivel, i) => {
          const data = p?.[nivel.key];
          const sem: Semaforo | undefined = data?.semaforo;
          return (
            <motion.div
              key={nivel.key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.07 }}
              className={`rounded-2xl border p-4 flex items-start gap-4 ${sem ? SEMAFORO_BG[sem] : "bg-white/5 border-white/10"}`}
            >
              <div className="text-3xl font-black text-white/10 leading-none select-none w-10 shrink-0 text-center">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-sm">{nivel.label}</span>
                  {sem && (
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${SEMAFORO_BG[sem]} ${SEMAFORO_COLOR[sem]}`}>
                      {SEMAFORO_LABEL[sem]}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-0.5">{nivel.desc}</p>
                {sem && (
                  <p className={`text-xs mt-1.5 ${SEMAFORO_COLOR[sem]}`}>
                    {nivel.criterios[sem]}
                  </p>
                )}
                {data?.notas_semaforo && (
                  <p className="text-[11px] text-white/30 mt-1 italic">{data.notas_semaforo}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {p?.resumen_ejecutivo?.hallazgos_criticos?.length && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="border-t border-white/5 pt-4"
        >
          <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Hallazgos críticos</p>
          <ul className="flex flex-col gap-1">
            {p.resumen_ejecutivo.hallazgos_criticos.slice(0, 3).map((h, i) => (
              <li key={i} className="text-xs text-white/60 flex items-start gap-2">
                <span className="text-red-400 font-bold">{i + 1}.</span>{h}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </div>
  );
}

export function isSlidePerfil5NVisible(f2: ConsultorFormFase2): boolean {
  const p = f2.perfil;
  return !!(p?.n1_identidad?.semaforo ?? p?.n2_trayectoria?.semaforo ?? p?.n3_riesgo?.semaforo);
}
