"use client";

import { motion } from "motion/react";
import { Globe, MapPin, Wallet } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";

interface SlideFase3IntroProps {
  ctx: CandidatoContext;
}

export function SlideFase3Intro({ ctx }: SlideFase3IntroProps) {
  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? ctx.user.full_name;

  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-180px)] px-4 sm:px-8 text-center">
      <div className="max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 border border-amber-400/40 px-5 py-2 text-xs uppercase tracking-[0.3em] text-amber-400 font-semibold mb-8"
        >
          Fase 3 de 3 · Tu estrategia
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="text-5xl sm:text-7xl md:text-8xl font-black text-white uppercase tracking-tight leading-[0.95]"
        >
          {firstName}, diseñá <span className="text-amber-400 block sm:inline">tu máquina</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed"
        >
          Vas a definir <span className="text-amber-400 font-semibold">cómo se mueve tu campaña</span> en dos frentes: lo digital y lo territorial. Cada palanca tiene 10 niveles de intensidad — el presupuesto se ajusta solo.
        </motion.p>

        {/* 3 chips guía */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto"
        >
          <Chip
            icon={<Globe className="size-6" />}
            title="Digital"
            sub="Donde se libra la percepción"
            color="from-blue-500/15 border-blue-400/30 text-blue-300"
          />
          <Chip
            icon={<MapPin className="size-6" />}
            title="Territorial"
            sub="Donde se ganan votos"
            color="from-amber-500/15 border-amber-400/30 text-amber-300"
          />
          <Chip
            icon={<Wallet className="size-6" />}
            title="Presupuesto"
            sub="Calculado en vivo"
            color="from-emerald-500/15 border-emerald-400/30 text-emerald-300"
          />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="mt-16 text-xs uppercase tracking-[0.3em] text-amber-400/60"
        >
          Avanzá con la flecha →
        </motion.p>
      </div>
    </div>
  );
}

function Chip({
  icon,
  title,
  sub,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-b ${color} to-transparent backdrop-blur-sm p-5 text-left`}
    >
      <div className="size-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-white font-bold text-lg leading-tight">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
