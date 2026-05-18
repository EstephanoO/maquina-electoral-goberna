"use client";

import type React from "react";
import { motion } from "motion/react";

import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { EditorialHeader } from "./shared/EditorialHeader";

/**
 * Slide CIERRE — slide de conversion premium.
 * Fondo gradient navy + anillos decorativos dorados concéntricos.
 * CTA principal gold solido hacia estrategia@goberna.us.
 */

interface Props {
  f2?: ConsultorFormFase2;
}

export function SlideCierre({ f2 }: Props) {
  const fechaEleccion = f2?.fase1_rapida?.postulacion?.fecha_eleccion;
  const { dias, esEstimado } = computeDaysToElection(fechaEleccion);

  const accionesRaw = (f2?.territorio_ecd?.nucleo_goberna?.segmentos_prioritarios ?? [])
    .slice(0, 3)
    .map((s, i) => ({
      num: `0${i + 1}`,
      text: s.accion_inmediata ?? `Acción ${i + 1}`,
      color: (["#fbbf24", "#ef4444", "#22c55e"] as const)[i] ?? "#fbbf24",
    }));
  const fallbackAcciones = [
    { num: "01", text: "Activar red de brigadistas en zonas fuertes", color: "#fbbf24" as const },
    { num: "02", text: "Lanzar campaña de comunicación digital", color: "#ef4444" as const },
    { num: "03", text: "Agendar reunión con líderes territoriales clave", color: "#22c55e" as const },
  ];
  const displayAcciones = accionesRaw.length >= 3 ? accionesRaw : fallbackAcciones;

  return (
    <div className="relative flex-1 flex flex-col rounded-2xl overflow-hidden border border-white/5 shadow-2xl min-h-[70vh] bg-[#020a1e]">
      {/* Gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 50%, #0a1e4a 0%, #020a1e 70%)",
        }}
      />

      {/* Anillos decorativos concentricos */}
      {[300, 500, 700, 900].map((size, i) => (
        <div
          key={i}
          className="absolute rounded-full border border-amber-400/10 pointer-events-none"
          style={{
            width: size,
            height: size,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}

      {/* Contenido central */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 py-14 text-center">
        <div className="max-w-xl w-full flex flex-col items-center gap-7">
          {/* Editorial header */}
          <div className="w-full">
            <EditorialHeader
              microLabel="ACTO IV · CIERRE"
              headline="La batalla se decide en los próximos días."
              accentColor="#22c55e"
            />
          </div>

          {/* Escudo / logo Goberna */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.34, 1.4, 0.64, 1] }}
          >
            {/* Escudo SVG inline — fallback si no existe el archivo */}
            <img
              src="/branding/goberna-escudo.svg"
              alt="Goberna"
              className="w-16 h-16 mx-auto opacity-90"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                // Si no existe el SVG, mostrar "G" estilizado
                const t = e.currentTarget;
                t.style.display = "none";
                const next = t.nextElementSibling as HTMLElement | null;
                if (next) next.style.display = "flex";
              }}
            />
            <div
              style={{ display: "none" }}
              className="w-16 h-16 mx-auto rounded-full bg-amber-400 items-center justify-center text-[#020a1e] text-2xl font-black"
            >
              G
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.18, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl sm:text-5xl font-black uppercase text-white leading-tight"
            style={{ textShadow: "0 6px 32px rgba(2,10,30,0.75)" }}
          >
            Tu Maquina Electoral
            <br />
            <span className="text-amber-400">Esta Lista</span>
          </motion.h1>

          {/* Countdown dias — solo si hay fecha */}
          {dias > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="flex flex-col items-center"
            >
              <div
                className="flex flex-col items-center px-8 py-4 rounded-xl"
                style={{
                  background: "#fbbf24",
                  boxShadow: "0 8px 32px rgba(245,158,11,0.35)",
                }}
              >
                <motion.span
                  className="text-5xl font-black text-[#020a1e] leading-none tabular-nums"
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: [0.4, 0, 0.6, 1], times: [0, 0.5, 1] }}
                >
                  {dias}
                </motion.span>
                <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em] text-[#020a1e]">
                  Dias para la eleccion{esEstimado ? " · Estimado" : ""}
                </span>
              </div>
            </motion.div>
          )}

          {/* 3 acciones inmediatas */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="flex flex-col gap-2 w-full max-w-sm"
          >
            {displayAcciones.map((a) => (
              <div key={a.num} className="flex items-center gap-3 text-left">
                <span
                  className="text-xs font-black tabular-nums shrink-0"
                  style={{ color: a.color }}
                >
                  {a.num}
                </span>
                <span className="text-sm text-white/70">{a.text}</span>
              </div>
            ))}
          </motion.div>

          {/* Body copy */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.55 }}
            className="text-white/60 text-sm sm:text-base leading-relaxed max-w-md"
          >
            Goberna te da la inteligencia electoral, la plataforma digital y el
            equipo estrategico.
            <br />
            <span className="text-white/80 font-semibold">
              Tu campana empieza ahora. No despues.
            </span>
          </motion.p>

          {/* CTA principal */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center gap-3"
          >
            <a
              href="mailto:estrategia@goberna.us"
              className="inline-flex items-center gap-2 bg-amber-400 text-[#020a1e] font-black text-sm sm:text-base px-8 py-4 rounded-full hover:bg-amber-300 transition-colors shadow-lg shadow-amber-500/30"
            >
              Agenda tu sesion estrategica →
            </a>
            <a
              href="https://goberna.us"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-2 border-white/30 hover:border-white/60 text-white font-bold text-sm px-6 py-[14px] rounded-full transition-colors"
            >
              goberna.us
            </a>
          </motion.div>

          {/* Caption contacto */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85, duration: 0.6 }}
            className="text-white/25 text-xs"
          >
            estrategia@goberna.us · goberna.us
          </motion.p>
        </div>
      </div>

      {/* Franja amber inferior */}
      <div className="relative h-1.5 w-full bg-amber-400" />
    </div>
  );
}

/** Visibilidad — siempre visible. */
export function isSlideCierreVisible(): boolean {
  return true;
}

/**
 * Calcular dias restantes a la fecha de eleccion.
 * Si no hay fecha o es invalida, devuelve 0 (sin mostrar el countdown).
 */
function computeDaysToElection(fecha: string | undefined): {
  dias: number;
  esEstimado: boolean;
} {
  if (!fecha) return { dias: 0, esEstimado: true };
  const target = new Date(fecha);
  if (Number.isNaN(target.getTime())) {
    return { dias: 0, esEstimado: true };
  }
  const diffMs = target.getTime() - Date.now();
  const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (dias <= 0) return { dias: 0, esEstimado: false };
  return { dias, esEstimado: false };
}
