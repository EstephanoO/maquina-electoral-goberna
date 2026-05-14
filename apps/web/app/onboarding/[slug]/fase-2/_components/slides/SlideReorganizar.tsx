"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

import { SlideChromeData } from "../chrome/SlideChromeData";
import { TagTilt } from "../chrome/TagTilt";

interface Props {
  f2: ConsultorFormFase2;
}

/**
 * Slide "¿Cómo reorganizar el voto?" — replica el layout de p.14 del deck
 * Goberna: stack vertical de hasta 3 cards amarillas grandes, cada una con
 * un TagTilt "PASO N" blanco overlap en la esquina superior izquierda.
 */
export function SlideReorganizar({ f2 }: Props) {
  const hitos = (f2.recorrido_estrategico?.hitos ?? []).slice(0, 3);

  return (
    <SlideChromeData title="¿Cómo reorganizar el voto?">
      <div className="relative max-w-4xl mx-auto flex flex-col gap-12 sm:gap-14 py-2">
        {hitos.map((hito, i) => (
          <motion.div
            key={hito.key ?? i}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 0.15 + i * 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative"
          >
            {/* Tag PASO N — overlap negativo arriba-izquierda */}
            <div
              className={`absolute -top-6 ${
                i % 2 === 0 ? "left-2 sm:left-6" : "right-2 sm:right-10"
              } z-10`}
            >
              <TagTilt
                label={`Paso ${i + 1}`}
                tone="white"
                size="lg"
                rotate={i % 2 === 0 ? -6 : 6}
              />
            </div>

            {/* Card amarilla */}
            <div className="rounded-3xl bg-amber-400 px-8 sm:px-12 pt-10 pb-7 sm:pt-12 sm:pb-9 shadow-[0_10px_30px_rgba(2,10,30,0.18)]">
              <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-[#0a1f4a] text-center leading-tight">
                {hito.titulo}
              </h3>
              {hito.descripcion ? (
                <p className="mt-3 text-sm sm:text-base text-[#0a1f4a]/85 text-center leading-relaxed whitespace-pre-line font-medium">
                  {hito.descripcion}
                </p>
              ) : null}
            </div>
          </motion.div>
        ))}
      </div>
    </SlideChromeData>
  );
}

SlideReorganizar.isVisible = (f2: ConsultorFormFase2): boolean => {
  return (f2.recorrido_estrategico?.hitos?.length ?? 0) >= 1;
};
