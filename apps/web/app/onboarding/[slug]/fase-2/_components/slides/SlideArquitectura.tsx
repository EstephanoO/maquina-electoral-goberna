"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

/**
 * Slide ARQUITECTURA — tres pilares de campaña: Tierra, Mar, Aire.
 * Muestra los pesos reales si existen en formula_electoral.
 * Resalta el frente_principal con badge y borde brillante.
 */

const pilares = [
  {
    key: "tierra" as const,
    label: "Tierra",
    icon: "🏘",
    descripcion: "Contacto directo, puerta a puerta",
    acciones: ["Canvassing", "Mítines", "Volanteo", "Líderes barriales"],
    color: "emerald",
    pesoKey: "peso_tierra" as const,
  },
  {
    key: "mar" as const,
    label: "Mar",
    icon: "📱",
    descripcion: "Redes sociales y presencia digital",
    acciones: ["Facebook Ads", "WhatsApp masivo", "TikTok", "SEO"],
    color: "blue",
    pesoKey: "peso_mar" as const,
  },
  {
    key: "aire" as const,
    label: "Aire",
    icon: "📺",
    descripcion: "Medios masivos y prensa",
    acciones: ["Radio local", "TV cable", "Prensa escrita", "Notas de prensa"],
    color: "purple",
    pesoKey: "peso_aire" as const,
  },
] as const;

type ColorKey = (typeof pilares)[number]["color"];

const COLOR_MAP: Record<ColorKey, { text: string; border: string; borderBright: string; dot: string; bar: string }> = {
  emerald: {
    text: "text-emerald-400",
    border: "border-emerald-500/20",
    borderBright: "border-emerald-400/60",
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
  },
  blue: {
    text: "text-blue-400",
    border: "border-blue-500/20",
    borderBright: "border-blue-400/60",
    dot: "bg-blue-400",
    bar: "bg-blue-400",
  },
  purple: {
    text: "text-purple-400",
    border: "border-purple-500/20",
    borderBright: "border-purple-400/60",
    dot: "bg-purple-400",
    bar: "bg-purple-400",
  },
};

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideArquitectura({ f2 }: Props) {
  const fe = f2.formula_electoral ?? {};
  // API returns uppercase ("TIERRA" | "MAR" | "AIRE"); we normalize to lowercase for comparison
  const frentePrincipalRaw = f2.fase1_rapida?.estrategia?.frente_principal;

  const pesos: Record<"peso_aire" | "peso_mar" | "peso_tierra", number | null> = {
    peso_aire:   typeof fe.peso_aire   === "number" ? fe.peso_aire   : null,
    peso_mar:    typeof fe.peso_mar    === "number" ? fe.peso_mar    : null,
    peso_tierra: typeof fe.peso_tierra === "number" ? fe.peso_tierra : null,
  };
  const hasPesos = pesos.peso_aire !== null || pesos.peso_tierra !== null || pesos.peso_mar !== null;

  return (
    <div className="relative flex-1 flex flex-col rounded-2xl overflow-hidden border border-white/5 shadow-2xl min-h-[70vh] bg-[#020a1e]">
      {/* Header */}
      <header className="px-8 sm:px-12 py-6 sm:py-7 border-b border-amber-400/20">
        <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/60 font-semibold text-center mb-2">
          La Maquina Electoral
        </p>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-center text-white leading-tight">
          Arquitectura de Campana
        </h2>
        <div className="absolute left-0 right-0 bottom-0 h-px bg-amber-400/20" />
      </header>

      {/* Body */}
      <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
          {pilares.map((pilar, i) => {
            const isPrincipal = frentePrincipalRaw?.toLowerCase() === pilar.key;
            const peso = pesos[pilar.pesoKey];
            const colors = COLOR_MAP[pilar.color];

            return (
              <motion.div
                key={pilar.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className={`relative bg-[#0a1e4a] rounded-2xl p-6 border transition-colors ${
                  isPrincipal ? colors.borderBright : colors.border
                }`}
              >
                {/* Badge frente principal */}
                {isPrincipal && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 bg-amber-400 text-[#020a1e] text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-full shadow-lg shadow-amber-500/30">
                      Frente Principal
                    </span>
                  </div>
                )}

                <div className="text-4xl mb-3">{pilar.icon}</div>
                <h3 className={`text-xl font-black mb-2 ${colors.text}`}>{pilar.label}</h3>
                <p className="text-sm text-white/60 mb-4 leading-relaxed">{pilar.descripcion}</p>

                {/* Peso bar — solo si hay datos */}
                {hasPesos && peso !== null && (
                  <div className="mb-4 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors.bar}`}
                        style={{ width: `${Math.max(0, Math.min(100, peso))}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-white/70 tabular-nums min-w-[2rem] text-right">
                      {peso}%
                    </span>
                  </div>
                )}

                <ul className="space-y-1.5">
                  {pilar.acciones.map((a) => (
                    <li key={a} className="text-xs text-white/50 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                      {a}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Heuristica de visibilidad — true si hay justificacion, pesos, o estrategia f1. */
export function isSlideArquitecturaVisible(f2: ConsultorFormFase2): boolean {
  const fe = f2.formula_electoral ?? {};
  const hasJust = !!fe.justificacion?.trim();
  const hasPesos =
    typeof fe.peso_aire   === "number" ||
    typeof fe.peso_tierra === "number" ||
    typeof fe.peso_mar    === "number";
  const estrategia = f2.fase1_rapida?.estrategia ?? {};
  const hasEstrategia =
    !!estrategia.tipo_campana ||
    !!estrategia.eje_emocional ||
    !!estrategia.frente_principal ||
    (estrategia.frentes_secundarios?.length ?? 0) > 0;
  return hasJust || hasPesos || hasEstrategia;
}
