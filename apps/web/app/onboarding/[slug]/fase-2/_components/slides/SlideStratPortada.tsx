"use client";

import { motion } from "motion/react";
import { CheckCircle2, GraduationCap, MapPin, Star } from "lucide-react";
import type { EstrategiaConfig } from "../../lib/estrategia-config";

interface Props {
  data: EstrategiaConfig;
}

interface TimelineItem {
  year: string;
  label: string;
  badge: string | null;
  subtext: string | null;
  dot: string;
  icon: React.ReactNode;
  solid: boolean;
}

export function SlideStratPortada({ data }: Props) {
  const { candidato, padron } = data;
  const { bio } = candidato;

  const timelineItems: TimelineItem[] = [
    {
      year: String(bio.nacimiento.year),
      label: bio.nacimiento.lugar,
      badge: null,
      subtext: "Nacimiento",
      dot: "#94a3b8",
      icon: <MapPin className="size-2.5" />,
      solid: true,
    },
    ...bio.formacion.map((f): TimelineItem => ({
      year: "Acad.",
      label: f.titulo,
      badge: null,
      subtext: f.inst,
      dot: f.color,
      icon: <GraduationCap className="size-2.5" />,
      solid: false,
    })),
    ...bio.carrera.map((c): TimelineItem => ({
      year: String(c.year),
      label: c.cargo,
      badge: c.elegido ? "ELEGIDO" : "CANDIDATO",
      subtext: null,
      dot: c.elegido ? "#22c55e" : "#fbbf24",
      icon: c.elegido ? <CheckCircle2 className="size-2.5" /> : <Star className="size-2.5" />,
      solid: true,
    })),
  ];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col">
      <div className="flex flex-1 overflow-hidden rounded-2xl mt-16 mb-4">

        {/* Left — photo 52% */}
        <div className="relative w-[52%] shrink-0 overflow-hidden">
          <img
            src={candidato.foto}
            alt={candidato.nombre}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#020a1e]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020a1e]/70 via-transparent to-transparent" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="absolute bottom-5 left-5"
          >
            <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-amber-400/60 mb-0.5">
              GOBERNA · DIAGNÓSTICO ELECTORAL 2026
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/40">
              Alcaldía Santiago de Surco · ERM 5 oct 2026
            </p>
          </motion.div>
        </div>

        {/* Right — bio 48% */}
        <div className="flex-1 flex flex-col px-6 py-5 gap-3 overflow-y-auto">

          {/* Section label */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="flex items-center gap-2"
          >
            <div className="h-[3px] w-6 rounded-full bg-amber-400" />
            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-amber-400">
              IDENTIDAD · PERFIL · IMAGEN DEL CANDIDATO
            </p>
          </motion.div>

          {/* Name block */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
          >
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-none tracking-tight">
              JORGE VALDEZ
              <span className="text-amber-400"> OYOLA</span>
            </h1>
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/50 mt-1">
              {candidato.partido} · Abogado · Sociólogo
            </p>
          </motion.div>

          {/* Vertical timeline */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="flex-1"
          >
            <div className="flex flex-col">
              {timelineItems.map((item, i) => (
                <div key={i} className="flex gap-2.5">
                  {/* Dot + vertical line */}
                  <div className="flex flex-col items-center shrink-0 w-3.5">
                    <div
                      className="w-3 h-3 rounded-full mt-0.5 shrink-0 flex items-center justify-center"
                      style={{
                        backgroundColor: item.solid ? item.dot : "transparent",
                        border: `2px solid ${item.dot}`,
                      }}
                    >
                      <span style={{ color: item.solid ? "#020a1e" : item.dot }}>
                        {item.icon}
                      </span>
                    </div>
                    {i < timelineItems.length - 1 && (
                      <div className="w-[2px] flex-1 bg-white/10 my-[3px] min-h-[8px]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-2 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[8px] font-black uppercase tracking-widest"
                        style={{ color: item.dot }}
                      >
                        {item.year}
                      </span>
                      {item.badge && (
                        <span
                          className="text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none"
                          style={{ backgroundColor: item.dot + "22", color: item.dot }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-white leading-tight">{item.label}</p>
                    {item.subtext && (
                      <p className="text-[9px] text-white/40 leading-tight">{item.subtext}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Stats footer — Población / Padrón / Elección */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.4 }}
            className="border-t border-white/10 pt-3 grid grid-cols-3 gap-2"
          >
            {([
              { label: "Población INEI 2025",    value: padron.poblacion_inei_2025.toLocaleString("es-PE"), accent: "#22c55e" },
              { label: "Padrón RENIEC",           value: padron.total.toLocaleString("es-PE"),               accent: "#fbbf24" },
              { label: "Elección general",        value: "5 oct 2026",                                        accent: "#3b82f6" },
            ] as const).map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.07 }}
                className="rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-center"
              >
                <div className="w-1.5 h-1.5 rounded-full mx-auto mb-1" style={{ backgroundColor: s.accent }} />
                <p className="text-[11px] font-black text-white leading-none">{s.value}</p>
                <p className="text-[7px] uppercase tracking-wider text-white/40 mt-0.5 leading-tight">{s.label}</p>
              </motion.div>
            ))}
          </motion.div>

        </div>
      </div>
    </div>
  );
}
