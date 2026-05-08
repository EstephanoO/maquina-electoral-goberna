"use client";

import { motion } from "motion/react";

import type { EstrategiaTrack, EstrategiaIntensidades } from "@/lib/mocks/estrategia-mock";
import { SlideShell } from "@/app/onboarding/fase-2/_components/slides/SlideShell";

import { IntensitySlider } from "../IntensitySlider";

interface SlideTrackProps {
  track: EstrategiaTrack;
  kicker: string;
  subtotal: number;
  intensidades: EstrategiaIntensidades;
  onChange: (categoriaId: string, value: number) => void;
}

/**
 * Slide con todas las sub-categorías de un track (Digital o Territorial)
 * y el subtotal en vivo arriba a la derecha.
 */
export function SlideTrack({
  track,
  kicker,
  subtotal,
  intensidades,
  onChange,
}: SlideTrackProps) {
  return (
    <SlideShell kicker={kicker} title={track.nombre}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <p className="text-base sm:text-lg text-gray-300 max-w-2xl">{track.tagline}</p>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="shrink-0 text-right"
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400/70">Subtotal</p>
          <p className="text-2xl sm:text-3xl text-white font-black tabular-nums leading-tight">
            {formatPen(subtotal)}
          </p>
        </motion.div>
      </div>

      <div className={`grid gap-4 ${track.categorias.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {track.categorias.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <IntensitySlider
              categoria={cat}
              value={intensidades[cat.id] ?? 5}
              onChange={(v) => onChange(cat.id, v)}
            />
          </motion.div>
        ))}
      </div>
    </SlideShell>
  );
}

function formatPen(n: number): string {
  if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
  return `S/ ${n}`;
}
