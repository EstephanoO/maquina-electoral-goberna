"use client";

import { motion } from "motion/react";
import { Search, Gavel, MessageSquareWarning, ShieldAlert } from "lucide-react";
import { SlideShell } from "./SlideShell";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

const FUENTES = [
  {
    icon: Gavel,
    titulo: "Denuncias policiales / fiscales",
    descripcion: "Carpetas abiertas, juicios pendientes, antecedentes.",
    fuente: "INFOGOB · JNE · Poder Judicial",
    estado_default: "review" as const,
  },
  {
    icon: Search,
    titulo: "Resultados negativos en Google",
    descripcion: "Las primeras 3 páginas al buscar tu nombre — qué dicen.",
    fuente: "Auditoría Goberna",
    estado_default: "review" as const,
  },
  {
    icon: MessageSquareWarning,
    titulo: "Mala reputación en redes sociales",
    descripcion: "Comentarios negativos, hashtags adversos, virales en contra.",
    fuente: "Monitoreo social",
    estado_default: "review" as const,
  },
  {
    icon: ShieldAlert,
    titulo: "Sentencias y observaciones JNE",
    descripcion: "Tachaduras, multas, observaciones formales en procesos previos.",
    fuente: "JNE · INFOGOB",
    estado_default: "review" as const,
  },
];

const ESTADO = {
  ok: { label: "Sin observaciones", bg: "bg-emerald-500/10", border: "border-emerald-400/40", text: "text-emerald-300" },
  review: { label: "Por auditar", bg: "bg-amber-400/10", border: "border-amber-400/40", text: "text-amber-300" },
  flag: { label: "Atención", bg: "bg-red-500/10", border: "border-red-400/40", text: "text-red-300" },
};

export function SlideDebilidades({ ctx }: Props) {
  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? "candidato";

  return (
    <SlideShell
      kicker="Auditoría · Debilidades"
      title={`¿QUÉ PUEDE USAR EN CONTRA DE ${firstName.toUpperCase()}?`}
    >
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed"
        >
          Antes de salir a campaña, mapeamos todo lo que el adversario podría usar para
          golpearte. Mejor saberlo nosotros primero — y prepararnos.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {FUENTES.map((f, i) => {
            const Icon = f.icon;
            const e = ESTADO[f.estado_default];
            return (
              <motion.div
                key={f.titulo}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className={`relative ${e.bg} ${e.border} border rounded-md p-5`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`size-7 ${e.text} shrink-0`} strokeWidth={2} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-lg font-extrabold text-white leading-tight">
                        {f.titulo}
                      </h3>
                      <span
                        className={`text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-sm bg-white/10 ${e.text}`}
                      >
                        {e.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed mb-2">{f.descripcion}</p>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 font-bold">
                      Fuente: {f.fuente}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div className="bg-white/[0.04] border border-white/10 rounded-md p-4">
            <div className="text-3xl font-black text-amber-400">[A]</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-bold mt-1">
              Hallazgos por auditar
            </div>
          </div>
          <div className="bg-white/[0.04] border border-white/10 rounded-md p-4">
            <div className="text-3xl font-black text-red-300">[B]</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-bold mt-1">
              Riesgos altos
            </div>
          </div>
          <div className="bg-white/[0.04] border border-white/10 rounded-md p-4">
            <div className="text-3xl font-black text-emerald-300">[C]</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-bold mt-1">
              Limpio / mitigado
            </div>
          </div>
        </motion.div>
      </div>
    </SlideShell>
  );
}
