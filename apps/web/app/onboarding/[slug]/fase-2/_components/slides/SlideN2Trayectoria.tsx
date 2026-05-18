"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";

interface Props {
  f2: ConsultorFormFase2;
}

const TIPO_LABEL: Record<string, string> = {
  colegio:       "Colegio",
  pregrado:      "Pregrado",
  posgrado:      "Posgrado",
  certificacion: "Certificación",
  otro:          "Otro",
};

export function SlideN2Trayectoria({ f2 }: Props) {
  const n2 = f2.perfil?.n2_trayectoria;
  const estudios = n2?.estudios ?? [];
  const trayPolitica = n2?.trayectoria_politica ?? [];

  const hasData = estudios.length > 0 || trayPolitica.length > 0;

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <EditorialHeader
          microLabel="ACTO I · N2 TRAYECTORIA"
          headline="Historial que respalda la candidatura."
          accentColor="#fbbf24"
        />
        {n2?.estado_civil && (
          <p className="text-sm text-white/40 mt-1">
            {n2.estado_civil}
            {n2.hijos != null ? ` · ${n2.hijos} hijo${n2.hijos !== 1 ? "s" : ""}` : ""}
          </p>
        )}
      </motion.div>

      {!hasData && (
        <p className="text-xs text-white/20 italic">Sin datos de trayectoria.</p>
      )}

      {/* ── Estudios ─────────────────────────────────────────────────────── */}
      {estudios.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            Formación académica
          </p>
          <div className="relative border-l border-white/10 ml-2 pl-4 flex flex-col gap-4">
            {estudios.map((est, ei) => (
              <motion.div
                key={`est-${ei}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + ei * 0.07 }}
                className="flex flex-col gap-0.5"
              >
                {/* Timeline dot */}
                <div className="absolute -left-[5px] w-2 h-2 rounded-full bg-amber-400/40 border border-amber-400/60" />

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] uppercase tracking-wider text-white/25 font-semibold">
                    {TIPO_LABEL[est.tipo] ?? est.tipo}
                  </span>
                  {est.anio && (
                    <span className="text-[9px] text-white/20 tabular-nums">{est.anio}</span>
                  )}
                  {est.verificado === true && (
                    <span className="text-[8px] font-black bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded uppercase">
                      Verificado
                    </span>
                  )}
                  {est.verificado === false && (
                    <span className="text-[8px] font-black bg-amber-500/10 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded uppercase">
                      Sin verificar
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/70 font-medium">{est.institucion}</p>
                {est.titulo && (
                  <p className="text-[11px] text-white/40">{est.titulo}</p>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Trayectoria política ──────────────────────────────────────────── */}
      {trayPolitica.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex flex-col gap-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
            Trayectoria política
          </p>
          <div className="relative border-l border-white/10 ml-2 pl-4 flex flex-col gap-4">
            {trayPolitica.map((cargo, ci) => (
              <motion.div
                key={`tp-${ci}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + ci * 0.07 }}
                className="flex flex-col gap-0.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {cargo.desde && (
                    <span className="text-[9px] text-white/20 tabular-nums">
                      {cargo.desde}{cargo.hasta ? ` — ${cargo.hasta}` : ""}
                    </span>
                  )}
                  {cargo.resultado && (
                    <span className="text-[8px] bg-white/5 border border-white/10 text-white/30 px-1.5 py-0.5 rounded uppercase tracking-wide">
                      {cargo.resultado}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/70 font-medium">{cargo.cargo}</p>
                <p className="text-[11px] text-white/40">{cargo.organizacion}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function isSlideN2Visible(f2: ConsultorFormFase2): boolean {
  return !!(
    f2.perfil?.n2_trayectoria?.estudios?.length ||
    f2.perfil?.n2_trayectoria?.trayectoria_politica?.length
  );
}
