"use client";

import { motion } from "motion/react";
import { SlideShell } from "../../../../fase-2/_components/slides/SlideShell";
import type { Fase1Rapida } from "@/lib/onboarding-api";

const CUADRANTES = [
  { key: "fortalezas",    label: "Fortalezas",    color: "#4ade80", icon: "↑" },
  { key: "debilidades",   label: "Debilidades",   color: "#f87171", icon: "↓" },
  { key: "oportunidades", label: "Oportunidades", color: "#60a5fa", icon: "→" },
  { key: "amenazas",      label: "Amenazas",      color: "#fb923c", icon: "!" },
] as const;

export function SlideF1Foda({ f1 }: { f1: Fase1Rapida }) {
  const d = f1.diagnostico_inicial ?? {};
  const color1 = f1.branding?.color_primario ?? "#fbc02d";

  return (
    <SlideShell
      kicker={`Análisis · ${f1.candidato?.nombre_completo ?? "Candidato"}`}
      title="FODA — DIAGNÓSTICO INICIAL"
    >
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        {CUADRANTES.map((q, qi) => {
          const items: string[] = d[q.key] ?? [];
          return (
            <motion.div
              key={q.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + qi * 0.1 }}
              className="rounded-2xl p-4 sm:p-5 border"
              style={{
                background: `${q.color}08`,
                borderColor: `${q.color}25`,
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="size-7 rounded-lg flex items-center justify-center font-black text-lg"
                  style={{ background: `${q.color}20`, color: q.color }}
                >
                  {q.icon}
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.3em] font-black"
                  style={{ color: q.color }}
                >
                  {q.label}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-gray-700 italic">Sin datos</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
                      <span style={{ color: q.color }} className="mt-0.5 flex-shrink-0 text-xs">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          );
        })}
      </div>
    </SlideShell>
  );
}
