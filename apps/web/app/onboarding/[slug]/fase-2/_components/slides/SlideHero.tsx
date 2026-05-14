"use client";

import { motion } from "motion/react";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { SlideChromeCinematic } from "../chrome/SlideChromeCinematic";
import { TagTilt } from "../chrome/TagTilt";

interface Props {
  ctx: CandidatoContext;
}

/**
 * Slide cinematic de apertura — full-bleed cielo nublado navy con foto
 * del candidato a la izquierda y tags amarillos tilteados en cascada
 * a la derecha ("RUMBO / A LA / <ELECCION>"). Inspirado en pp. 1 y 3 del
 * deck "Roberto Sánchez - Segunda Vuelta".
 */
export function SlideHero({ ctx }: Props) {
  const fullName = ctx.user.full_name;
  const fotoUrl = ctx.user.foto_url;
  const eleccionLabel = deriveEleccionLabel(ctx);

  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <SlideChromeCinematic accent="amber">
      <div className="relative flex-1 flex flex-col px-6 sm:px-10 md:px-14 pt-10 sm:pt-14 pb-8">
        {/* Nombre del candidato — arriba, full-width, enorme */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white uppercase tracking-tight leading-[0.92] text-center"
          style={{ textShadow: "0 4px 30px rgba(2, 10, 30, 0.55)" }}
        >
          {fullName}
        </motion.h1>

        {/* Body: foto izquierda + tags derecha */}
        <div className="relative flex-1 mt-8 sm:mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10 items-end min-h-[420px]">
          {/* Foto del candidato */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex justify-center md:justify-start items-end h-full"
          >
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt={fullName}
                className="max-h-[60vh] w-auto object-contain object-bottom drop-shadow-[0_20px_40px_rgba(2,10,30,0.6)]"
              />
            ) : (
              <div className="relative w-full max-w-[420px] aspect-[3/4] bg-gradient-to-b from-[#0a1f4a] to-[#020a1e] border-2 border-amber-400/30 flex items-center justify-center">
                <span className="text-amber-400 text-7xl sm:text-8xl font-black tracking-tighter">
                  {initials}
                </span>
              </div>
            )}
          </motion.div>

          {/* Tags en cascada — derecha */}
          <div className="relative flex flex-col items-center md:items-end justify-end gap-4 sm:gap-5 pb-6 sm:pb-10">
            <motion.div
              initial={{ opacity: 0, x: 60, rotate: 0 }}
              animate={{ opacity: 1, x: 0, rotate: -3 }}
              transition={{ delay: 0.55, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <TagTilt label="RUMBO" tone="white" size="xl" rotate={-3} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 60, rotate: 0 }}
              animate={{ opacity: 1, x: 0, rotate: -1 }}
              transition={{ delay: 0.75, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="md:translate-x-[-30px]"
            >
              <TagTilt label="A LA" tone="amber" size="lg" rotate={-1} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 60, rotate: 0 }}
              animate={{ opacity: 1, x: 0, rotate: -5 }}
              transition={{ delay: 0.95, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="md:translate-x-[-10px]"
            >
              <TagTilt label={eleccionLabel} tone="white" size="xl" rotate={-5} />
            </motion.div>
          </div>
        </div>
      </div>
    </SlideChromeCinematic>
  );
}

/**
 * Derivar etiqueta de elección desde `ctx.cargo`. Devuelve siempre uppercase.
 * Ej: presidente → "PRESIDENCIA", alcalde_distrital → "ALCALDÍA",
 * gobernador_regional → "GOBERNACIÓN", congresista → "CONGRESO".
 */
function deriveEleccionLabel(ctx: CandidatoContext): string {
  const codigo = ctx.cargo.codigo?.toLowerCase() ?? "";
  if (codigo.startsWith("presidente")) return "PRESIDENCIA";
  if (codigo.startsWith("alcalde")) return "ALCALDÍA";
  if (codigo.startsWith("gobernador")) return "GOBERNACIÓN";
  if (codigo.startsWith("congresista")) return "CONGRESO";
  if (codigo.startsWith("regidor")) return "REGIDURÍA";
  if (codigo.startsWith("consejero")) return "CONSEJERÍA";
  // Fallback al nombre del cargo en uppercase
  const nombre = ctx.cargo.nombre?.toUpperCase().trim();
  return nombre && nombre.length > 0 ? nombre : "ELECCIÓN";
}
