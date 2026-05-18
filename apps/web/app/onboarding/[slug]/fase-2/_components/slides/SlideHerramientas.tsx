"use client";

import { motion } from "motion/react";
import { EditorialHeader } from "./shared/EditorialHeader";

/**
 * Slide HERRAMIENTAS — muestra la plataforma Goberna con 6 feature cards.
 * Diseno dark premium orientado a conversion.
 */

const herramientas = [
  {
    icon: "🗺",
    nombre: "Mapa Electoral",
    descripcion: "Visualiza tu territorio, padron y distritos en tiempo real",
    tag: "DB Live",
  },
  {
    icon: "📋",
    nombre: "Cuaderno de Campo",
    descripcion: "App para tus agentes de canvassing. Sin papel.",
    tag: "Mobile",
  },
  {
    icon: "📊",
    nombre: "Dashboard de Campana",
    descripcion: "KPIs, conversiones y avance diario de tu equipo",
    tag: "Nuevo",
  },
  {
    icon: "🎯",
    nombre: "Deck de Analisis",
    descripcion: "Esta presentacion — generada con tus datos reales",
    tag: "IA",
  },
  {
    icon: "💬",
    nombre: "WhatsApp Campaign",
    descripcion: "Mensajeria masiva segmentada por zona",
    tag: "Integrado",
  },
  {
    icon: "🔔",
    nombre: "CRM Electoral",
    descripcion: "Gestiona leads, voluntarios y agenda",
    tag: "CRM",
  },
] as const;

export function SlideHerramientas() {
  return (
    <div className="relative flex-1 flex flex-col rounded-2xl overflow-hidden border border-white/5 shadow-2xl bg-[#020a1e]">
      {/* Header */}
      <header className="relative px-8 sm:px-12 py-6 sm:py-7 border-b border-amber-400/20">
        <EditorialHeader
          microLabel="ACTO IV · GOBERNA"
          headline="La plataforma que acompaña toda la campaña."
          accentColor="#22c55e"
        />
      </header>

      {/* Body */}
      <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto w-full">
          {herramientas.map((h, i) => (
            <motion.div
              key={h.nombre}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ borderColor: "rgba(251, 191, 36, 0.3)" }}
              className="bg-[#0a1e4a] border border-white/10 rounded-2xl p-5 transition-colors"
            >
              <div className="text-3xl mb-3">{h.icon}</div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-sm font-bold text-white">{h.nombre}</h3>
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                  {h.tag}
                </span>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">{h.descripcion}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Heuristica de visibilidad — siempre visible (slide estatica). */
export function isSlideHerramientasVisible(): boolean {
  return true;
}
