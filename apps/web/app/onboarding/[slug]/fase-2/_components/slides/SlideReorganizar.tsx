"use client";

import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeData } from "../chrome/SlideChromeData";
import { TagTilt } from "../chrome/TagTilt";

interface Props {
  f2: ConsultorFormFase2;
}

/**
 * Slide "¿Cómo reorganizar el voto?" — layout horizontal de 3 pasos
 * con cards amarillas conectadas por ChevronRight amber. Inspirado en
 * p.14 del deck Goberna pero priorizando legibilidad horizontal.
 */
export function SlideReorganizar({ f2 }: Props) {
  const hitos = (f2.recorrido_estrategico?.hitos ?? []).slice(0, 3);
  const count = hitos.length;

  // Mapeo grid según cantidad de hitos.
  const gridCols =
    count === 1
      ? "md:grid-cols-1"
      : count === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-3";

  return (
    <SlideChromeData
      title="¿Cómo reorganizar el voto?"
      chapter={4}
      chapterHint="estrategia de 3 pasos"
    >
      <div
        className={`relative grid grid-cols-1 ${gridCols} gap-6 md:gap-8 h-full items-stretch py-4`}
      >
        {hitos.map((hito, i) => (
          <div key={hito.key ?? i} className="relative flex">
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.1 + i * 0.2,
                ease: [0.22, 1.05, 0.36, 1],
              }}
              className="relative flex-1"
            >
              {/* TagTilt PASO N overlap top-left */}
              <div className="absolute -top-4 -left-2 z-10">
                <TagTilt
                  label={`Paso ${i + 1}`}
                  tone="white"
                  size="md"
                  rotate={-6 + i * 4}
                />
              </div>

              {/* Card amarilla compacta */}
              <div className="group h-full rounded-3xl bg-amber-400 px-6 pt-10 pb-6 shadow-[0_10px_30px_rgba(2,10,30,0.18)] transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_18px_44px_rgba(2,10,30,0.28)]">
                <h3 className="text-lg sm:text-xl font-black uppercase text-[#0a1f4a] leading-tight">
                  {hito.titulo}
                </h3>
                {hito.descripcion ? (
                  <p className="mt-3 text-sm text-[#0a1f4a]/80 leading-relaxed whitespace-pre-line font-medium">
                    {hito.descripcion}
                  </p>
                ) : null}
              </div>
            </motion.div>

            {/* Connector arrow (hidden en mobile) */}
            {i < count - 1 ? (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.3 + i * 0.2,
                }}
                className="hidden md:flex absolute top-1/2 -right-6 md:-right-7 -translate-y-1/2 z-20 pointer-events-none"
              >
                <ChevronRight
                  className="text-amber-400 drop-shadow-[0_4px_8px_rgba(251,191,36,0.4)]"
                  strokeWidth={3}
                  size={40}
                />
              </motion.div>
            ) : null}
          </div>
        ))}
      </div>
    </SlideChromeData>
  );
}

SlideReorganizar.isVisible = (f2: ConsultorFormFase2): boolean => {
  return (f2.recorrido_estrategico?.hitos?.length ?? 0) >= 1;
};
