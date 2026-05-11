"use client";

import { motion } from "motion/react";
import { Tv, Smartphone, Footprints } from "lucide-react";
import { SlideShell } from "./SlideShell";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

const FRENTES = [
  {
    key: "aire" as const,
    icon: Tv,
    titulo: "AIRE",
    subtitulo: "Medios masivos",
    descripcion: "TV, radio, prensa nacional. Llega a todos a la vez pero cuesta más por contacto.",
    intensidad_default: 30,
    color: "#fbbf24",
  },
  {
    key: "mar" as const,
    icon: Smartphone,
    titulo: "MAR",
    subtitulo: "Digital y redes",
    descripcion: "Facebook, TikTok, WhatsApp, Google. Segmentable, medible, escalable.",
    intensidad_default: 35,
    color: "#60a5fa",
  },
  {
    key: "tierra" as const,
    icon: Footprints,
    titulo: "TIERRA",
    subtitulo: "Territorio",
    descripcion: "Brigadas, mercados, casa por casa. Convierte mejor pero no escala sin gente.",
    intensidad_default: 35,
    color: "#fb923c",
  },
];

export function SlideFormulaElectoral({ ctx }: Props) {
  const fe = ctx.consultor_form?.formula_electoral;
  const pesos: Record<"aire" | "mar" | "tierra", number> = {
    aire: typeof fe?.peso_aire === "number" ? fe.peso_aire : 30,
    mar: typeof fe?.peso_mar === "number" ? fe.peso_mar : 35,
    tierra: typeof fe?.peso_tierra === "number" ? fe.peso_tierra : 35,
  };
  const presupuestoTotal =
    typeof fe?.presupuesto_total === "number"
      ? fe.presupuesto_total.toLocaleString("es-PE", {
          style: "currency",
          currency: "PEN",
          maximumFractionDigits: 0,
        })
      : null;
  const justificacion = fe?.justificacion;
  return (
    <SlideShell kicker="Estrategia · Fórmula" title="¿POR DÓNDE QUIERES LUCHAR?">
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed"
        >
          Toda campaña ganadora elige cómo distribuir sus recursos entre tres frentes.
          Goberna te ayuda a calibrar la mezcla según tu jurisdicción, tu presupuesto y tu rival.
        </motion.p>

        {/* 3 columnas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {FRENTES.map((f, i) => {
            const Icon = f.icon;
            const peso = pesos[f.key];
            return (
              <motion.div
                key={f.titulo}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.15, duration: 0.6 }}
                className="relative bg-white/[0.04] border border-white/10 rounded-md overflow-hidden"
              >
                {/* Header con color del frente */}
                <div
                  className="px-5 py-4 flex items-center gap-3"
                  style={{
                    background: `linear-gradient(135deg, ${f.color}25 0%, transparent 100%)`,
                    borderBottom: `2px solid ${f.color}`,
                  }}
                >
                  <Icon className="size-7" style={{ color: f.color }} strokeWidth={2.2} />
                  <div>
                    <div
                      className="text-3xl font-black tracking-tight uppercase leading-none"
                      style={{ color: f.color }}
                    >
                      {f.titulo}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-white/70 font-semibold mt-0.5">
                      {f.subtitulo}
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="px-5 py-4">
                  <p className="text-sm text-gray-300 leading-relaxed mb-4">{f.descripcion}</p>

                  {/* Sugerido (placeholder hasta que el consultor lo defina) */}
                  <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/70 font-bold mb-1">
                    Mezcla sugerida
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${peso}%` }}
                      transition={{ delay: 0.6 + i * 0.15, duration: 0.8 }}
                      className="h-full"
                      style={{ background: f.color }}
                    />
                  </div>
                  <div className="text-right text-xs font-bold mt-1" style={{ color: f.color }}>
                    {peso}%
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer: tu presupuesto */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-8 border-t border-white/10 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80 font-bold mb-1">
              Presupuesto total
            </div>
            <div className="text-2xl font-black text-white">
              {presupuestoTotal ?? "¿Cuánto presupuesto tienes?"}
            </div>
            <p className="text-sm text-gray-400 mt-1">
              {presupuestoTotal
                ? "Goberna calcula la mezcla óptima para este monto entre los tres frentes."
                : "La mezcla cambia radicalmente entre 50K y 500K soles. Goberna calcula la mezcla óptima."}
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80 font-bold mb-1">
              {justificacion ? "Lógica de la mezcla" : "Próximo paso"}
            </div>
            <div className="text-base text-white leading-snug">
              {justificacion ??
                "En Fase 3 vas a elegir tus tácticas concretas dentro de cada frente (catálogo de estrategias Goberna)."}
            </div>
          </div>
        </motion.div>
      </div>
    </SlideShell>
  );
}
