"use client";

import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useEffect } from "react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratOportunidad({ data }: Props) {
  const { oportunidad, padron } = data;

  // Count-up animation — kept exactly as original
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
    <div className="h-full bg-white flex flex-col overflow-hidden">

      {/* Navy header band */}
      <div
        className="relative px-6 sm:px-10 py-3 shrink-0"
        style={{ background: "linear-gradient(to right, #061633, #0a1f4a, #061633)" }}
      >
        <div className="absolute bottom-0 inset-x-0 h-[4px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-0.5">
          VENTANA ELECTORAL
        </p>
        <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
          LA OPORTUNIDAD: HEREDA EL VOTO DE BRUCE
        </h2>
      </div>

      {/* White body */}
      <div className="flex-1 overflow-auto px-6 sm:px-10 py-4 sm:py-5 flex flex-col gap-4">

        {/* Hero count-up in navy card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl p-6 text-center flex flex-col items-center gap-2 shrink-0"
          style={{ background: "#0a1f4a" }}
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-amber-400/70">
            LA OPORTUNIDAD
          </p>
          <motion.span className="text-7xl sm:text-8xl font-black text-amber-400 tabular-nums leading-none">
            {rounded}
          </motion.span>
          <p className="text-sm text-white/60 max-w-lg leading-relaxed">
            Votos que ganó <span className="text-white font-semibold">Carlos Bruce</span> en{" "}
            {oportunidad.bruce_eleccion} · Ahora postula a Lima ·{" "}
            <span className="text-amber-400 font-bold">El voto no tiene dueño</span>
          </p>
        </motion.div>

        <div className="w-16 h-px bg-gray-200 mx-auto shrink-0" />

        {/* 3-col grid */}
        <div className="grid grid-cols-3 gap-4 flex-1">

          {/* Patrón histórico */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2"
            style={{ borderLeft: "4px solid #ef4444" }}
          >
            <p className="text-[8px] font-black uppercase tracking-widest text-red-600">
              PATRÓN HISTÓRICO
            </p>
            <p className="text-3xl font-black text-gray-900">{oportunidad.minimo_ganador_historico}%</p>
            <p className="text-xs text-gray-500 leading-relaxed flex-1">
              Jean Pierre Combe ganó Surco {oportunidad.anio_referencia} con solo{" "}
              <span className="text-gray-900 font-bold">{oportunidad.minimo_ganador_historico}%</span> en
              campo de 18 candidatos. Sin incumbente = quien consolida primero, gana.
            </p>
          </motion.div>

          {/* Tu meta */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.4 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2"
            style={{ borderLeft: "4px solid #fbbf24" }}
          >
            <p className="text-[8px] font-black uppercase tracking-widest text-amber-600">TU META</p>
            <p className="text-2xl font-black text-amber-600 leading-tight">
              25–30%
              <br />
              <span className="text-lg text-gray-700">del voto válido</span>
            </p>
            <p className="text-xs text-gray-500 leading-relaxed flex-1">
              ≈ <span className="text-gray-900 font-bold">70,000–84,000 votos</span>
            </p>
            <div className="border-t border-gray-100 pt-2 mt-auto">
              <p className="text-[9px] text-gray-400">
                Padrón {padron.total.toLocaleString("es-PE")}
              </p>
              <p className="text-[9px] text-gray-400">
                ~{padron.abstenciones_pct}% abs · ~{padron.blanco_nulo_pct}% bl/nulo
              </p>
            </div>
          </motion.div>

          {/* Competidores */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2"
          >
            <p className="text-[8px] font-black uppercase tracking-widest text-gray-400">
              RIVALES · DEBILIDADES
            </p>
            <div className="flex flex-col gap-3 flex-1">
              {oportunidad.competidores_debilidades.map((comp) => (
                <div
                  key={comp.nombre}
                  className="border-b border-gray-100 pb-2 last:border-0 last:pb-0"
                >
                  <p className="text-xs font-bold text-gray-900">{comp.nombre}</p>
                  <p className="text-[9px] text-red-600 leading-snug mt-0.5">{comp.debilidad}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
