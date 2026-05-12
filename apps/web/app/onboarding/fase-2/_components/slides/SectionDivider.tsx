"use client";

import { motion } from "motion/react";

import { EditableT } from "../EditableT";

interface SectionDividerProps {
  /** Número de sección visible (01, 02, etc) */
  sectionNumber: string;
  /** Subtítulo pequeño en mayúsculas (ej: "Análisis Electoral") */
  kicker: string;
  /** Pregunta gigante full-screen (ej: "¿Cómo le fue a Renovación Popular en Cañete?") */
  question: string;
  /** Highlight: parte de la pregunta que va en amarillo */
  highlight?: string;
  /** ID base para text_overrides. Si no se pasa, divider no es editable. */
  slideId?: string;
}

/**
 * Slide divisor estilo PDF Goberna: pantalla completa con pregunta gigante
 * blanca sobre cielo nublado. Lo usamos antes de cada sección de contenido
 * para que el flujo se sienta como capítulos.
 */
export function SectionDivider({
  sectionNumber,
  kicker,
  question,
  highlight,
  slideId,
}: SectionDividerProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-180px)] px-4 sm:px-8 text-center">
      {/* Section badge */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-3 mb-10"
      >
        <span className="text-amber-400 font-bold text-3xl sm:text-5xl tabular-nums tracking-tight">
          {slideId ? (
            <EditableT k={`${slideId}.section_number`}>{sectionNumber}</EditableT>
          ) : (
            sectionNumber
          )}
        </span>
        <span className="h-px w-16 sm:w-24 bg-amber-400/60" />
        <span className="text-amber-400/90 text-sm sm:text-base uppercase tracking-[0.3em] font-semibold">
          {slideId ? <EditableT k={`${slideId}.kicker`}>{kicker}</EditableT> : kicker}
        </span>
      </motion.div>

      {/* Pregunta gigante (editable como un solo texto — el highlight se aplica
          al texto que matchea, sea el original o el override). */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.6 }}
        className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white uppercase leading-[1.05] tracking-tight max-w-6xl"
      >
        {slideId ? (
          <EditableT k={`${slideId}.question`} multiline>
            {question}
          </EditableT>
        ) : (
          <RenderQuestion question={question} highlight={highlight} />
        )}
      </motion.h1>

      {/* Línea decorativa */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="mt-12 h-1 w-32 sm:w-48 bg-amber-400 origin-center"
      />
    </div>
  );
}

/** Render del question con highlight (versión no-editable). */
function RenderQuestion({
  question,
  highlight,
}: {
  question: string;
  highlight?: string;
}) {
  let beforeText = question;
  let afterText = "";
  let middleText = "";
  if (highlight) {
    const idx = question.indexOf(highlight);
    if (idx >= 0) {
      beforeText = question.slice(0, idx);
      middleText = highlight;
      afterText = question.slice(idx + highlight.length);
    }
  }
  return (
    <>
      {beforeText}
      {middleText && <span className="text-amber-400">{middleText}</span>}
      {afterText}
    </>
  );
}
