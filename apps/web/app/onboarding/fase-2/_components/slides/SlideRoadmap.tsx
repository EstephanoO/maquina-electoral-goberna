"use client";

import { motion } from "motion/react";
import { MapPin, BarChart3, Users, FileSearch, Search } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";

interface SlideRoadmapProps {
  ctx: CandidatoContext;
}

const ROADMAP = [
  {
    n: "01",
    icon: <MapPin className="size-7" />,
    title: "Tu territorio",
    desc: "El terreno donde vas a competir.",
  },
  {
    n: "02",
    icon: <BarChart3 className="size-7" />,
    title: "Análisis electoral",
    desc: "Cómo le fue a tu partido en la zona.",
  },
  {
    n: "03",
    icon: <Users className="size-7" />,
    title: "Quiénes mandan",
    desc: "Los partidos con más votos.",
  },
  {
    n: "04",
    icon: <FileSearch className="size-7" />,
    title: "Tu historial",
    desc: "Tus elecciones anteriores en INFOGOB.",
  },
  {
    n: "05",
    icon: <Search className="size-7" />,
    title: "Quién sos",
    desc: "Cómo te ven en Google y redes.",
  },
];

export function SlideRoadmap({ ctx }: SlideRoadmapProps) {
  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? ctx.user.full_name;

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-180px)] px-4 sm:px-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 border border-amber-400/30 px-4 py-1.5 text-xs uppercase tracking-[0.3em] text-amber-400 font-semibold mb-6"
      >
        Diagnóstico estratégico
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-4xl sm:text-6xl md:text-7xl font-black text-white uppercase leading-tight tracking-tight text-center max-w-5xl"
      >
        Lo que <span className="text-amber-400">{firstName}</span> va a ver
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-4 text-base sm:text-lg text-gray-300 max-w-2xl text-center"
      >
        En los próximos minutos vamos a recorrer 5 secciones para que sepas dónde competís y a quiénes tenés que ganarle.
      </motion.p>

      {/* 5 cards horizontales */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 max-w-7xl w-full">
        {ROADMAP.map((item, i) => (
          <motion.div
            key={item.n}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
            className="rounded-2xl border-2 border-amber-400/20 bg-gradient-to-b from-[#0a1e4a]/80 to-[#061b3d]/80 backdrop-blur-sm p-5 hover:border-amber-400/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-amber-400 font-black text-3xl tabular-nums">{item.n}</span>
              <div className="size-10 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 flex items-center justify-center">
                {item.icon}
              </div>
            </div>
            <h3 className="text-white font-bold text-lg leading-tight">{item.title}</h3>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{item.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Hint to advance */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="mt-12 text-xs uppercase tracking-[0.3em] text-amber-400/60"
      >
        Avanzá con la flecha →
      </motion.p>
    </div>
  );
}
