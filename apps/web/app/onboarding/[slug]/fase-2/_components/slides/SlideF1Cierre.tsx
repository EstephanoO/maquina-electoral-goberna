"use client";

import { motion } from "motion/react";
import type { Fase1Rapida } from "@/lib/onboarding-api";

export function SlideF1Cierre({ f1, onContinue }: { f1: Fase1Rapida; onContinue?: () => void }) {
  const slogan  = f1.branding?.slogan ?? "";
  const nombre  = f1.candidato?.nombre_completo ?? "[Candidato]";
  const color1  = f1.branding?.color_primario ?? "#fbc02d";
  const color2  = f1.branding?.color_secundario ?? "#0a1e4a";

  return (
    <div
      className="flex-1 flex items-center justify-center min-h-[calc(100vh-180px)]"
    >
      <div className="text-center px-6 max-w-3xl">
        {/* Brand circle */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto size-32 sm:size-40 mb-10"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-12px] rounded-full border-2 border-dashed"
            style={{ borderColor: `${color1}40` }}
          />
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center font-black text-5xl sm:text-6xl"
            style={{ background: `${color2}`, border: `3px solid ${color1}60`, color: color1 }}
          >
            {nombre.split(/\s+/)[0]?.[0] ?? "G"}
          </div>
        </motion.div>

        {slogan && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-2xl sm:text-3xl md:text-4xl font-black italic mb-3"
            style={{ color: color1 }}
          >
            "{slogan}"
          </motion.p>
        )}

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-8"
        >
          {nombre}
        </motion.h2>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          className="h-1 w-32 mx-auto rounded-full mb-8"
          style={{ background: color1 }}
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-xs uppercase tracking-[0.5em] text-gray-500 mb-10"
        >
          Goberna · Consultoría Política Estratégica
        </motion.p>

        {onContinue && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 }}
            onClick={onContinue}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-black text-sm shadow-2xl transition-all hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${color1}, ${color1}cc)`,
              color: "#0a1e4a",
              boxShadow: `0 10px 40px ${color1}40`,
            }}
          >
            Continuar con Goberna →
          </motion.button>
        )}
      </div>
    </div>
  );
}
