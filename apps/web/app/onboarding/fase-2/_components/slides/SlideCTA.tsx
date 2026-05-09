"use client";

import { motion } from "motion/react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

interface SlideCTAProps {
  onContinue: () => void;
}

const RECOMENDACIONES = [
  "Construir tu marca personal sólida y diferenciada",
  "Implementar comunicación política integral",
  "Aplicar cartografía electoral y análisis territorial",
  "Activar tecnología para datos y segmentación",
];

export function SlideCTA({ onContinue }: SlideCTAProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-180px)] px-4 sm:px-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 border border-amber-400/40 px-5 py-2 text-xs uppercase tracking-[0.3em] text-amber-400 font-semibold mb-8"
      >
        Recomendaciones finales
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6 }}
        className="text-5xl sm:text-7xl md:text-8xl font-black text-white uppercase tracking-tight leading-[0.95] max-w-5xl"
      >
        Listo. Ahora <span className="text-amber-400">elige cómo compites</span>.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6 text-base sm:text-lg text-gray-300 max-w-2xl"
      >
        Con este diagnóstico ya sabes contra quién juegas. El último paso: definir cómo se va a mover tu campaña.
      </motion.p>

      {/* Lista de recomendaciones */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl w-full">
        {RECOMENDACIONES.map((r, i) => (
          <motion.div
            key={r}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.08 }}
            className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-[#0a1e4a]/60 px-4 py-3 text-left"
          >
            <CheckCircle2 className="size-5 text-amber-400 shrink-0" />
            <p className="text-sm text-gray-200">{r}</p>
          </motion.div>
        ))}
      </div>

      {/* CTA gigante */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85 }}
        className="mt-12"
      >
        <motion.button
          type="button"
          onClick={onContinue}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center gap-3 px-12 py-5 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-[#0a1e4a] font-black text-xl uppercase tracking-wider shadow-[0_20px_60px_rgba(251,191,36,0.5)] hover:shadow-[0_25px_80px_rgba(251,191,36,0.7)] transition-shadow"
        >
          Configurar mi estrategia
          <ArrowRight className="size-6" />
        </motion.button>

        <p className="mt-6 text-xs uppercase tracking-[0.4em] text-amber-400/60">
          Fase 3 de 3
        </p>
      </motion.div>
    </div>
  );
}
