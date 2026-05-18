"use client";

import { motion } from "motion/react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratIssues({ data }: Props) {
  const { issues, segmentos } = data;

  const circ = 2 * Math.PI * 45;
  let cumPct = 0;
  const donutSegs = Array.from(segmentos).map((seg) => {
    const dash = (seg.pct / 100) * circ;
    const offset = circ - (cumPct / 100) * circ;
    cumPct += seg.pct;
    return { seg, dash, offset };
  });

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col pt-16 pb-4 px-4 sm:px-8 gap-4">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <h2 className="text-2xl sm:text-3xl font-black text-white">EL VECINO DE SURCO</h2>
        <p className="text-xs text-white/40 mt-1 uppercase tracking-widest">
          Problemas · Segmentos · Oportunidades
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-6 flex-1">
        {/* Left — Issues */}
        <div className="flex flex-col gap-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-amber-400/60">
            ¿QUÉ LE PREOCUPA?
          </p>
          <div className="flex flex-col gap-2 flex-1 justify-center">
            {issues.map((issue, i) => (
              <motion.div
                key={issue.tema}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                className="flex items-center gap-2"
              >
                <div className="w-36 shrink-0 text-right">
                  <span className="text-xs text-white/70">{issue.tema}</span>
                </div>
                <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: issue.color }}
                    initial={{ width: "0%" }}
                    animate={{ width: `${issue.pct}%` }}
                    transition={{ delay: 0.2 + i * 0.07, duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <span
                  className="text-xs font-black w-9 text-right shrink-0"
                  style={{ color: issue.color }}
                >
                  {issue.pct}%
                </span>
              </motion.div>
            ))}
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-[9px] text-amber-400/70 border-l-2 border-amber-400/40 pl-2"
          >
            ★ Animalismo: nicho sin competencia — ventaja Valdez
          </motion.p>
        </div>

        {/* Right — Segmentos */}
        <div className="flex flex-col gap-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-amber-400/60">
            ¿A QUIÉN LE HABLAMOS?
          </p>

          <div className="flex justify-center">
            <svg viewBox="0 0 120 120" className="w-28 h-28">
              {donutSegs.map(({ seg, dash, offset }) => (
                <circle
                  key={seg.nombre}
                  cx={60}
                  cy={60}
                  r={45}
                  fill="none"
                  strokeWidth={18}
                  stroke={seg.color}
                  strokeDasharray={`${dash} ${circ}`}
                  strokeDashoffset={offset}
                  transform="rotate(-90 60 60)"
                />
              ))}
              <text x={60} y={56} textAnchor="middle" fontSize={10} fontWeight={900} fill="white">
                100%
              </text>
              <text x={60} y={68} textAnchor="middle" fontSize={7} fill="white" opacity={0.4}>
                electores
              </text>
            </svg>
          </div>

          <div className="flex flex-col gap-1.5 flex-1">
            {segmentos.map((seg, i) => (
              <motion.div
                key={seg.nombre}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
                className="flex items-start gap-2 rounded-lg bg-white/5 border border-white/10 px-2.5 py-2"
              >
                <div
                  className="w-2 h-2 rounded-full mt-0.5 shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-white truncate">{seg.nombre}</span>
                    <span
                      className="text-[9px] font-black ml-auto shrink-0"
                      style={{ color: seg.color }}
                    >
                      {seg.pct}%
                    </span>
                  </div>
                  <p className="text-[9px] text-white/40 truncate">{seg.problema}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
