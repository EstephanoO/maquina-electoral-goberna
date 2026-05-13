"use client";

import { motion } from "motion/react";
import { SlideShell } from "../../../../fase-2/_components/slides/SlideShell";
import type { Fase1Rapida } from "@/lib/onboarding-api";

export function SlideF1Propuestas({ f1 }: { f1: Fase1Rapida }) {
  const propuestas = f1.propuestas ?? [];
  const color1 = f1.branding?.color_primario ?? "#fbc02d";

  return (
    <SlideShell
      kicker={`Agenda programática · ${f1.postulacion?.nombre_territorio ?? "Territorio"}`}
      title="PROPUESTAS DE CAMPAÑA"
    >
      {propuestas.length === 0 ? (
        <p className="text-gray-600 italic text-sm">Sin propuestas registradas.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {propuestas.map((p, i) => (
            <motion.div
              key={p.orden}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="bg-[#0a1e4a]/50 border border-white/8 rounded-2xl p-5 flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{p.icono ?? "⭐"}</span>
                <div
                  className="size-7 rounded-full flex items-center justify-center font-black text-[11px]"
                  style={{ background: `${color1}20`, color: color1, border: `1px solid ${color1}40` }}
                >
                  {p.orden}
                </div>
              </div>
              <h3 className="font-extrabold text-white text-base leading-tight">{p.titulo}</h3>
              <p className="text-sm text-gray-400 leading-relaxed flex-1">{p.descripcion_corta}</p>
              {p.sector && (
                <span
                  className="text-[10px] uppercase tracking-[0.2em] font-bold px-2.5 py-1 rounded-full self-start"
                  style={{ background: `${color1}15`, color: color1, border: `1px solid ${color1}30` }}
                >
                  {p.sector}
                </span>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </SlideShell>
  );
}
