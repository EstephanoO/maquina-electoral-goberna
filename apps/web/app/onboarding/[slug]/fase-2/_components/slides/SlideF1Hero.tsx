"use client";

import { motion } from "motion/react";
import type { Fase1Rapida } from "@/lib/onboarding-api";

const CARGO_LABEL: Record<string, string> = {
  alcalde_distrital:   "Alcalde Distrital",
  alcalde_provincial:  "Alcalde Provincial",
  regidor:             "Regidor",
  consejero_regional:  "Consejero Regional",
  gobernador_regional: "Gobernador Regional",
  congresista:         "Congresista",
  presidente:          "Presidente",
};

export function SlideF1Hero({ f1 }: { f1: Fase1Rapida }) {
  const nombre    = f1.candidato?.nombre_completo ?? "[Candidato]";
  const cargo     = CARGO_LABEL[f1.postulacion?.cargo_codigo ?? ""] ?? f1.postulacion?.cargo_codigo ?? "[Cargo]";
  const territorio = f1.postulacion?.nombre_territorio ?? "[Territorio]";
  const año       = f1.postulacion?.fecha_eleccion
    ? new Date(f1.postulacion.fecha_eleccion).getFullYear()
    : "—";
  const slogan    = f1.branding?.slogan ?? "";
  const color1    = f1.branding?.color_primario ?? "#fbc02d";
  const org       = f1.postulacion?.nombre_organizacion ?? "";

  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-180px)] px-6 sm:px-12">
      <div className="w-full max-w-4xl">
        {/* Accent line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6 }}
          className="h-1 w-full rounded-full mb-12"
          style={{ background: `linear-gradient(90deg, ${color1}, ${color1}40, transparent)` }}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          {/* Left: identity */}
          <div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-[10px] uppercase tracking-[0.4em] font-semibold mb-4"
              style={{ color: color1 }}
            >
              Presentación estratégica · Fase 2
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7 }}
              className="text-5xl sm:text-6xl md:text-7xl font-black text-white tracking-tight leading-[0.9] mb-6"
            >
              {nombre}
            </motion.h1>
            {slogan && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-xl italic font-semibold"
                style={{ color: color1 }}
              >
                "{slogan}"
              </motion.p>
            )}
          </div>

          {/* Right: metadata */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="space-y-4"
          >
            {[
              { label: "Cargo", value: cargo },
              { label: "Territorio", value: territorio },
              { label: "Elección", value: String(año) },
              ...(org ? [{ label: "Organización", value: org }] : []),
            ].map((row) => (
              <div key={row.label} className="flex flex-col gap-0.5 border-b border-white/10 pb-3">
                <span className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-semibold">
                  {row.label}
                </span>
                <span className="text-lg font-bold text-white">{row.value}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="h-px w-full mt-10"
          style={{ background: `${color1}30` }}
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-4 text-xs uppercase tracking-[0.4em] text-gray-600"
        >
          Goberna · Consultoría Política Estratégica
        </motion.p>
      </div>
    </div>
  );
}
