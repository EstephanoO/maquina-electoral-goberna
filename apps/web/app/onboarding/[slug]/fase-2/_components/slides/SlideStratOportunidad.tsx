"use client";

import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useEffect } from "react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratOportunidad({ data }: Props) {
  const { oportunidad, padron } = data;

  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => v.toFixed(2) + "%");

  useEffect(() => {
    const ctrl = animate(count, oportunidad.bruce_pct, {
      duration: 1.8,
      delay: 0.4,
      ease: "easeOut",
    });
    return ctrl.stop;
  }, [count, oportunidad.bruce_pct]);

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col pt-16 pb-4 px-4 sm:px-8 gap-5">
      {/* Hero number */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center flex flex-col items-center gap-2"
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-green-400/60">
          LA OPORTUNIDAD
        </p>
        <motion.span className="text-7xl sm:text-8xl font-black text-green-400 tabular-nums leading-none">
          {rounded}
        </motion.span>
        <p className="text-sm text-white/60 max-w-lg leading-relaxed">
          Votos que ganó <span className="text-white font-semibold">Carlos Bruce</span> en{" "}
          {oportunidad.bruce_eleccion} · Ahora postula a Lima ·{" "}
          <span className="text-green-400 font-bold">El voto no tiene dueño</span>
        </p>
      </motion.div>

      <div className="w-16 h-px bg-white/10 mx-auto" />

      {/* 3-col grid */}
      <div className="grid grid-cols-3 gap-4 flex-1">
        {/* Patrón histórico */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex flex-col gap-2"
        >
          <p className="text-[8px] font-black uppercase tracking-widest text-red-400">
            PATRÓN HISTÓRICO
          </p>
          <p className="text-3xl font-black text-white">{oportunidad.minimo_ganador_historico}%</p>
          <p className="text-xs text-white/50 leading-relaxed flex-1">
            Jean Pierre Combe ganó Surco {oportunidad.anio_referencia} con solo{" "}
            <span className="text-white font-bold">{oportunidad.minimo_ganador_historico}%</span> en
            campo de 18 candidatos. Sin incumbente = quien consolida primero, gana.
          </p>
        </motion.div>

        {/* Tu meta */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 flex flex-col gap-2"
        >
          <p className="text-[8px] font-black uppercase tracking-widest text-amber-400">TU META</p>
          <p className="text-2xl font-black text-amber-400 leading-tight">
            25–30%
            <br />
            <span className="text-lg">del voto válido</span>
          </p>
          <p className="text-xs text-white/50 leading-relaxed flex-1">
            ≈ <span className="text-white font-bold">70,000–84,000 votos</span>
          </p>
          <div className="border-t border-amber-400/20 pt-2 mt-auto">
            <p className="text-[9px] text-white/40">
              Padrón {padron.total.toLocaleString("es-PE")}
            </p>
            <p className="text-[9px] text-white/40">
              ~{padron.abstenciones_pct}% abs · ~{padron.blanco_nulo_pct}% bl/nulo
            </p>
          </div>
        </motion.div>

        {/* Competidores */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2"
        >
          <p className="text-[8px] font-black uppercase tracking-widest text-white/40">
            RIVALES · DEBILIDADES
          </p>
          <div className="flex flex-col gap-3 flex-1">
            {oportunidad.competidores_debilidades.map((comp) => (
              <div
                key={comp.nombre}
                className="border-b border-white/10 pb-2 last:border-0 last:pb-0"
              >
                <p className="text-xs font-bold text-white">{comp.nombre}</p>
                <p className="text-[9px] text-red-400/80 leading-snug mt-0.5">{comp.debilidad}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
