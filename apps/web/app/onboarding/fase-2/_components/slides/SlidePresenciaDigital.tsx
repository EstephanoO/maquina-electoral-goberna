"use client";

import { motion } from "motion/react";
import { Search, Globe, AlertCircle, CheckCircle2 } from "lucide-react";
import { SlideShell } from "./SlideShell";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

const CHECKS = [
  {
    icon: Globe,
    label: "Página web oficial",
    explica: "Si no la tienes, los votantes que te googlean encuentran a tu rival primero.",
    estado_default: "missing" as const,
  },
  {
    icon: Search,
    label: "Resultados de Google al buscar tu nombre",
    explica: "Los primeros 5 resultados son tu carta de presentación. ¿Qué sale hoy?",
    estado_default: "review" as const,
  },
  {
    icon: AlertCircle,
    label: "Redes sociales oficiales (verificadas)",
    explica: "Cuentas con check + handle limpio. Sin esto las cuentas falsas te ganan.",
    estado_default: "review" as const,
  },
  {
    icon: CheckCircle2,
    label: "Información clave visible",
    explica: "Edad, profesión, cargo al que postulas, propuesta principal — los 4 datos que el votante busca.",
    estado_default: "review" as const,
  },
];

const ESTADO_STYLES = {
  ok: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-400/40",
    icon: "text-emerald-400",
    label: "OK",
    labelBg: "bg-emerald-500/20 text-emerald-300",
  },
  review: {
    bg: "bg-amber-400/10",
    border: "border-amber-400/40",
    icon: "text-amber-400",
    label: "Revisar",
    labelBg: "bg-amber-400/20 text-amber-300",
  },
  missing: {
    bg: "bg-red-500/10",
    border: "border-red-400/40",
    icon: "text-red-400",
    label: "Falta",
    labelBg: "bg-red-500/20 text-red-300",
  },
};

export function SlidePresenciaDigital({ ctx }: Props) {
  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? "tú";

  return (
    <SlideShell
      kicker="Presencia digital"
      title={`¿QUÉ DICE GOOGLE DE ${firstName.toUpperCase()}?`}
    >
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed"
        >
          El primer movimiento del votante moderno es googlearte. Si no encuentra
          tu página oficial en 5 segundos, encuentra otra cosa — y la otra cosa
          probablemente no te conviene.
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {CHECKS.map((c, i) => {
            const Icon = c.icon;
            const style = ESTADO_STYLES[c.estado_default];
            return (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
                className={`relative ${style.bg} ${style.border} border rounded-md px-4 py-4 sm:px-5 sm:py-5`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`size-6 ${style.icon} shrink-0 mt-0.5`} strokeWidth={2.2} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-base font-extrabold text-white leading-tight">
                        {c.label}
                      </h3>
                      <span
                        className={`text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-sm ${style.labelBg}`}
                      >
                        {style.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed">{c.explica}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA inferior */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-8 px-5 py-4 bg-gradient-to-r from-amber-400/10 via-amber-400/5 to-transparent border-l-4 border-amber-400 rounded-sm"
        >
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400 font-bold mb-1">
            Acción rápida
          </div>
          <p className="text-base text-white leading-relaxed">
            Goberna audita tu presencia digital antes de cada elección y te genera
            un plan de 30 días para que cuando te googleen, salgas tú primero.
          </p>
        </motion.div>
      </div>
    </SlideShell>
  );
}
