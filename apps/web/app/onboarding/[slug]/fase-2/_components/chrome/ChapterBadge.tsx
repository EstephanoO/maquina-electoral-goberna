"use client";

import { motion } from "motion/react";

/**
 * Badge de "capítulo" — anclas narrativas en la cabecera del deck.
 * Define los 6 actos del relato Fase 2:
 *
 *   1. Presentación   → carta, hero
 *   2. Diagnóstico    → quien-es, presencia, debilidades, ficha
 *   3. Territorio     → foda, propuestas
 *   4. Estrategia     → segmentos, votos, reorganizar
 *   5. Ejecución      → arquitectura, herramientas
 *   6. Cierre         → cierre
 *
 * Sirve para que el consultor sepa "dónde está" en el pitch y construye
 * tensión narrativa entre slides.
 */
export type ChapterId = 1 | 2 | 3 | 4 | 5 | 6;

const CHAPTER_LABEL: Record<ChapterId, string> = {
  1: "Presentación",
  2: "Diagnóstico",
  3: "Territorio",
  4: "Estrategia",
  5: "Ejecución",
  6: "Cierre",
};

interface Props {
  chapter: ChapterId;
  /** Subtítulo opcional para reforzar el storytelling del slide específico. */
  hint?: string;
}

export function ChapterBadge({ chapter, hint }: Props) {
  const label = CHAPTER_LABEL[chapter];
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="inline-flex items-center gap-2"
    >
      <span className="inline-flex items-center justify-center size-5 rounded-full bg-amber-400 text-[#0a1f4a] text-[10px] font-black tabular-nums leading-none">
        {chapter}
      </span>
      <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-amber-400/90">
        Capítulo {chapter} · {label}
      </span>
      {hint ? (
        <span className="hidden sm:inline text-[10px] uppercase tracking-[0.22em] text-white/45 ml-1">
          · {hint}
        </span>
      ) : null}
    </motion.div>
  );
}
