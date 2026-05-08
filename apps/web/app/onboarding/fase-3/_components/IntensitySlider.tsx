"use client";

import { motion } from "motion/react";

import type { EstrategiaCategoria } from "@/lib/mocks/estrategia-mock";

interface IntensitySliderProps {
  categoria: EstrategiaCategoria;
  value: number;
  onChange: (n: number) => void;
}

/**
 * Slider visual con:
 *  - 10 segmentos arriba que se llenan amber según el valor
 *  - Número grande a la derecha
 *  - Costo en vivo abajo
 *  - Ejemplos que se "desbloquean" cada 2-3 niveles
 */
export function IntensitySlider({ categoria, value, onChange }: IntensitySliderProps) {
  const costo = value * categoria.costoPorPuntoPen;

  // Ejemplos se "desbloquean" en niveles distribuidos:
  // ej[0] desde nivel 1, ej[1] desde nivel 4, ej[2] desde nivel 7
  const unlockLevel = (i: number) => {
    if (i === 0) return 1;
    if (i === 1) return 4;
    return 7;
  };

  return (
    <div className="rounded-2xl border-2 border-amber-400/20 bg-[#0a1e4a]/50 backdrop-blur-sm p-5 sm:p-6 hover:border-amber-400/40 transition-colors">
      {/* Header: nombre + valor grande */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-xl sm:text-2xl text-white font-bold leading-tight">
            {categoria.nombre}
          </h3>
          <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{categoria.descripcion}</p>
        </div>
        <div className="shrink-0 size-14 sm:size-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-[#0a1e4a] font-black text-2xl sm:text-3xl tabular-nums flex items-center justify-center shadow-lg shadow-amber-500/30">
          {value}
        </div>
      </div>

      {/* Costo en vivo */}
      <div className="mt-3 inline-flex items-baseline gap-1.5 rounded-full bg-amber-400/10 border border-amber-400/30 px-3 py-1">
        <span className="text-base sm:text-lg font-bold text-amber-400 tabular-nums">
          {formatPen(costo)}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-amber-400/70">presupuesto</span>
      </div>

      {/* 10 segmentos */}
      <div className="mt-5 grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => {
          const segValue = i + 1;
          const isFilled = segValue <= value;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(segValue)}
              className={`h-7 rounded-md transition-all ${
                isFilled
                  ? "bg-gradient-to-t from-amber-500 to-amber-400 shadow-md shadow-amber-500/40"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
              aria-label={`Nivel ${segValue}`}
            />
          );
        })}
      </div>

      {/* Slider input (accesibilidad + drag) */}
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full h-1.5 appearance-none cursor-pointer bg-gray-800 rounded-full
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-5
          [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-amber-400
          [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-[#0a1e4a]
          [&::-webkit-slider-thumb]:shadow-lg
          [&::-moz-range-thumb]:w-5
          [&::-moz-range-thumb]:h-5
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-amber-400
          [&::-moz-range-thumb]:border-2
          [&::-moz-range-thumb]:border-[#0a1e4a]"
      />

      {/* Etiquetas low/high */}
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest text-gray-500">
        <span>Bajo</span>
        <span>Medio</span>
        <span className="text-amber-400/80">Alto</span>
      </div>

      {/* Ejemplos que se desbloquean */}
      <div className="mt-5 pt-4 border-t border-amber-400/10 space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-amber-400/70 font-semibold mb-2">
          Qué activás a este nivel
        </p>
        {categoria.ejemplos.map((ej, i) => {
          const unlocked = value >= unlockLevel(i);
          return (
            <motion.div
              key={ej}
              initial={false}
              animate={{
                opacity: unlocked ? 1 : 0.3,
                x: unlocked ? 0 : -4,
              }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className={`size-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  unlocked ? "bg-amber-400 text-[#0a1e4a]" : "bg-gray-800 text-gray-600"
                }`}
              >
                {unlocked ? "✓" : ""}
              </span>
              <span className={unlocked ? "text-gray-200" : "text-gray-600 line-through"}>
                {ej}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}
