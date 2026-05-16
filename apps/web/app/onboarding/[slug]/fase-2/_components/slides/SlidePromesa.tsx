"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  f2: ConsultorFormFase2;
}

const SIM_PROPUESTAS = [
  { icono: "🏗", titulo: "Infraestructura para todos"    },
  { icono: "📚", titulo: "Educación de calidad cercana"  },
  { icono: "🏥", titulo: "Salud accesible en tu barrio"  },
];

export function SlidePromesa({ f2 }: Props) {
  const slogan     = f2.fase1_rapida?.branding?.slogan ?? "";
  const propuestas = f2.fase1_rapida?.propuestas ?? [];
  const isSimSlogan = !slogan.trim();
  const isSimProps  = propuestas.length === 0;

  const displaySlogan = isSimSlogan ? "Construimos el futuro juntos" : slogan;
  const displayProps  = isSimProps
    ? SIM_PROPUESTAS
    : propuestas.slice(0, 3).map((p) => ({ icono: p.icono ?? "⭐", titulo: p.titulo }));

  // Split slogan at **word** for gold highlight
  const sloganParts = displaySlogan.split(/\*\*(.+?)\*\*/g);

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col items-center justify-center px-8 py-12 gap-10 text-center relative">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Propuesta de Campaña</SlideLabel>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="text-3xl sm:text-5xl font-black text-white leading-tight max-w-2xl"
      >
        {sloganParts.map((part, i) =>
          i % 2 === 1
            ? <span key={i} className="text-amber-400">{part}</span>
            : <span key={i}>{part}</span>
        )}
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="flex flex-wrap gap-3 justify-center max-w-xl"
      >
        {displayProps.map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-2 bg-[#0a1e4a] border border-white/10 rounded-full"
          >
            <span className="text-base">{p.icono}</span>
            <span className="text-sm font-semibold text-white/80">{p.titulo}</span>
          </div>
        ))}
      </motion.div>

      {(isSimSlogan || isSimProps) && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute bottom-6 right-6 text-[10px] italic text-amber-400/20"
        >
          · dato estimado
        </motion.p>
      )}
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
