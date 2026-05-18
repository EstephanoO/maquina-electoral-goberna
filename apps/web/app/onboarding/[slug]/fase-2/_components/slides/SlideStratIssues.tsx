"use client";

import { motion } from "motion/react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

export function SlideStratIssues({ data }: Props) {
  const { issues, segmentos } = data;

  // SVG donut geometry — kept exactly as original
  const circ = 2 * Math.PI * 45;
  let cumPct = 0;
  const donutSegs = Array.from(segmentos).map((seg) => {
    const dash = (seg.pct / 100) * circ;
    const offset = circ - (cumPct / 100) * circ;
    cumPct += seg.pct;
    return { seg, dash, offset };
  });

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">

      {/* Navy header band */}
      <div
        className="relative px-6 sm:px-10 py-3 shrink-0"
        style={{ background: "linear-gradient(to right, #061633, #0a1f4a, #061633)" }}
      >
        <div className="absolute bottom-0 inset-x-0 h-[4px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-0.5">
          AGENDA CIUDADANA
        </p>
        <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
          ISSUES Y SEGMENTOS ELECTORALES
        </h2>
      </div>

      {/* White body */}
      <div className="flex-1 overflow-auto px-6 sm:px-10 py-4 sm:py-5">
        <div className="grid grid-cols-2 gap-6 h-full">

          {/* Left — Issue bars */}
          <div className="flex flex-col gap-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-gray-400">
              ¿QUÉ LE PREOCUPA?
            </p>
            <div className="flex flex-col gap-2 flex-1 justify-center">
              {issues.map((issue, i) => (
                <motion.div
                  key={issue.tema}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.07, duration: 0.4 }}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-3"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold text-gray-800 flex-1">{issue.tema}</span>
                    <span
                      className="text-xs font-black shrink-0"
                      style={{ color: issue.color }}
                    >
                      {issue.pct}%
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: issue.color }}
                      initial={{ width: "0%" }}
                      animate={{ width: `${issue.pct}%` }}
                      transition={{ delay: 0.2 + i * 0.07, duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-[9px] text-amber-600 border-l-2 border-amber-400 pl-2 font-medium"
            >
              ★ Animalismo: nicho sin competencia — ventaja Valdez
            </motion.p>
          </div>

          {/* Right — Segmentos */}
          <div className="flex flex-col gap-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-gray-400">
              ¿A QUIÉN LE HABLAMOS?
            </p>

            {/* SVG donut — works well on white bg */}
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
                <text x={60} y={56} textAnchor="middle" fontSize={10} fontWeight={900} fill="#0f172a">
                  100%
                </text>
                <text x={60} y={68} textAnchor="middle" fontSize={7} fill="#6b7280">
                  electores
                </text>
              </svg>
            </div>

            {/* Segment pills as white cards with colored left border */}
            <div className="flex flex-col gap-1.5 flex-1">
              {segmentos.map((seg, i) => (
                <motion.div
                  key={seg.nombre}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
                  className="flex items-start gap-2 bg-white rounded-lg border border-gray-200 px-2.5 py-2 shadow-sm"
                  style={{ borderLeft: `4px solid ${seg.color}` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-gray-900 truncate">{seg.nombre}</span>
                      <span
                        className="text-[9px] font-black ml-auto shrink-0"
                        style={{ color: seg.color }}
                      >
                        {seg.pct}%
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-400 truncate">{seg.problema}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
