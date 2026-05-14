"use client";

import { motion } from "motion/react";
import { ArrowDown } from "lucide-react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeData } from "../chrome/SlideChromeData";
import { DataTable } from "../chrome/DataTable";

interface Props {
  f2: ConsultorFormFase2;
}

const nf = new Intl.NumberFormat("es-PE");
const fmt = (n: number | undefined | null) =>
  typeof n === "number" && Number.isFinite(n) ? nf.format(n) : "—";

/**
 * Slide "Porcentaje de votos necesarios" — replica el espíritu de p.16:
 * histórico a la izquierda + cards verticales con flecha amber descendente
 * a la derecha (RESULTADO ANTERIOR → META 2026).
 */
export function SlideVotosNecesarios({ f2 }: Props) {
  const vpg = f2.votos_para_ganar ?? {};
  const entries = f2.historial?.entries ?? [];
  const hasHistorial = entries.length > 0;

  const padron = vpg.padron_actual;
  const meta = vpg.votos_meta;
  const ganadorAnterior = vpg.votos_ganador_anterior;

  const pctMeta =
    typeof meta === "number" &&
    typeof padron === "number" &&
    padron > 0
      ? Math.round((meta / padron) * 100)
      : null;

  const historicoRows = entries.map((e) => ({
    anio: e.anio ?? "—",
    cargo: e.cargo ?? "—",
    pct:
      typeof e.porcentaje === "number"
        ? `${e.porcentaje.toFixed(2)}%`
        : "—",
    resultado: e.resultado ?? "—",
  }));

  const footer = vpg.fuente ? (
    <span>
      <span className="font-semibold text-[#0a1f4a]">Fuente:</span> {vpg.fuente}
    </span>
  ) : undefined;

  return (
    <SlideChromeData title="Porcentaje de votos necesarios" footer={footer}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch h-full">
        {/* Izquierda: histórico */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          {hasHistorial ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="mb-4 text-sm uppercase tracking-[0.18em] font-black text-[#0a1f4a]">
                Historial electoral
              </p>
              <DataTable
                columns={[
                  { key: "anio", label: "Año", width: "14%" },
                  { key: "cargo", label: "Cargo", width: "44%" },
                  { key: "pct", label: "% obtenido", width: "20%", align: "right" },
                  { key: "resultado", label: "Resultado", width: "22%" },
                ]}
                rows={historicoRows}
                emphasizeFirst
                compact
              />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500"
            >
              Sin historial electoral cargado todavía.
            </motion.div>
          )}
        </div>

        {/* Derecha: cards verticales con flecha amber */}
        <div className="lg:col-span-5 flex flex-col justify-center gap-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden"
          >
            <div className="bg-[#0a1f4a] px-5 py-2 text-[11px] uppercase tracking-[0.22em] font-black text-white">
              Resultado anterior
            </div>
            <div className="px-6 py-5 text-center">
              <div className="text-4xl sm:text-5xl font-black text-[#0a1f4a] leading-none tabular-nums">
                {fmt(ganadorAnterior)}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
                votos
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center"
          >
            <ArrowDown
              className="text-amber-400 drop-shadow-[0_4px_8px_rgba(251,191,36,0.45)]"
              strokeWidth={3}
              size={56}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.45 }}
            className="rounded-lg overflow-hidden shadow-lg ring-2 ring-amber-400"
          >
            <div className="bg-amber-400 px-5 py-2 text-[11px] uppercase tracking-[0.22em] font-black text-[#0a1f4a]">
              Meta 2026
            </div>
            <div className="bg-white px-6 py-5 text-center">
              <div className="text-5xl sm:text-6xl font-black text-[#0a1f4a] leading-none tabular-nums">
                {fmt(meta)}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
                votos necesarios
              </div>
              {pctMeta !== null ? (
                <div className="mt-2 text-xs text-slate-600 font-semibold">
                  ({pctMeta}% del padrón)
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      </div>
    </SlideChromeData>
  );
}

SlideVotosNecesarios.isVisible = (f2: ConsultorFormFase2): boolean => {
  const vpg = f2.votos_para_ganar;
  if (!vpg) return false;
  return (
    typeof vpg.padron_actual === "number" ||
    typeof vpg.votos_meta === "number"
  );
};
