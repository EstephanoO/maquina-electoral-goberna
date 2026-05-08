"use client";

import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";

import { SlideShell } from "./SlideShell";

interface SlideCTAProps {
  onContinue: () => void;
}

export function SlideCTA({ onContinue }: SlideCTAProps) {
  return (
    <SlideShell bare>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center px-6 max-w-3xl"
      >
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 text-xs uppercase tracking-widest text-amber-400 mb-8">
          <Sparkles className="size-3" />
          Recomendaciones finales
        </div>

        <h2 className="text-4xl sm:text-6xl md:text-7xl font-bold text-white tracking-tight uppercase leading-tight">
          Listo. Ahora <span className="text-amber-400">elegí tu estrategia</span>.
        </h2>

        <p className="mt-6 text-base sm:text-lg text-gray-300 leading-relaxed max-w-xl mx-auto">
          Con este diagnóstico ya sabés en qué terreno competís y a quiénes
          tenés que ganarle. El último paso: definir cómo va a moverse tu
          campaña — Digital + Territorial — y entrar a tu plataforma.
        </p>

        <div className="mt-10">
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-3 px-10 py-4 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-[#0a1e4a] font-bold text-lg shadow-2xl shadow-amber-500/40 hover:shadow-amber-500/60 transition-all"
          >
            Configurar mi estrategia
            <ArrowRight className="size-5" />
          </button>
        </div>

        <p className="mt-8 text-xs text-gray-500 uppercase tracking-widest">
          Fase 3 de 3
        </p>
      </motion.div>
    </SlideShell>
  );
}
