"use client";

import { motion } from "motion/react";
import type { EstrategiaTrack, EstrategiaIntensidades } from "@/lib/mocks/estrategia-mock";

interface TrackCardProps {
  track: EstrategiaTrack;
  icon: React.ReactNode;
  subtotal: number;
  intensidades: EstrategiaIntensidades;
  onChange: (categoriaId: string, value: number) => void;
}

export function TrackCard({ track, icon, subtotal, intensidades, onChange }: TrackCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-2xl border-2 border-gray-700/50 bg-gradient-to-br from-gray-900/80 to-black/40 backdrop-blur-sm p-5 sm:p-7"
    >
      <div className="flex items-start justify-between gap-4 mb-5 pb-5 border-b border-gray-800">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 size-12 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center justify-center">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl text-white font-semibold leading-tight">
              {track.nombre}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{track.tagline}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-amber-400/70">Subtotal</p>
          <p className="text-lg sm:text-xl text-white font-bold tabular-nums">
            {formatPen(subtotal)}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {track.categorias.map((cat) => {
          const value = intensidades[cat.id] ?? 5;
          const costo = value * cat.costoPorPuntoPen;
          return (
            <div key={cat.id}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <h3 className="text-base text-white font-medium">{cat.nombre}</h3>
                <span className="text-sm text-gray-400 tabular-nums shrink-0">
                  {formatPen(costo)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{cat.descripcion}</p>

              {/* Slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600 tabular-nums w-3 text-right">1</span>
                <div className="relative flex-1">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={value}
                    onChange={(e) => onChange(cat.id, Number(e.target.value))}
                    className="
                      w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-5
                      [&::-webkit-slider-thumb]:h-5
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-amber-400
                      [&::-webkit-slider-thumb]:border-2
                      [&::-webkit-slider-thumb]:border-black
                      [&::-webkit-slider-thumb]:shadow-lg
                      [&::-webkit-slider-thumb]:shadow-amber-500/40
                      [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-moz-range-thumb]:w-5
                      [&::-moz-range-thumb]:h-5
                      [&::-moz-range-thumb]:rounded-full
                      [&::-moz-range-thumb]:bg-amber-400
                      [&::-moz-range-thumb]:border-2
                      [&::-moz-range-thumb]:border-black
                      [&::-moz-range-thumb]:cursor-pointer
                    "
                    style={{
                      background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${(value - 1) * 11.11}%, #1f2937 ${(value - 1) * 11.11}%, #1f2937 100%)`,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-600 tabular-nums w-5">10</span>
                <div className="ml-1 size-8 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 font-bold text-sm flex items-center justify-center tabular-nums">
                  {value}
                </div>
              </div>

              {/* Ejemplos */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {cat.ejemplos.map((ej) => (
                  <span
                    key={ej}
                    className="rounded-full border border-gray-700/50 bg-black/40 px-2 py-0.5 text-[10px] text-gray-500"
                  >
                    {ej}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}
