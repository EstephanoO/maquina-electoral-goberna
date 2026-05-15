"use client";

import { motion } from "motion/react";
import { ChevronRight, Check } from "lucide-react";

interface StepWelcomeProps {
  onNext: () => void;
}

const FEATURES = [
  "Análisis electoral de tu territorio",
  "Inteligencia de competencia automatizada",
  "Estrategia personalizada desde el día 1",
] as const;

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

export function StepWelcome({ onNext }: StepWelcomeProps) {
  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
      {/* Left column — form side */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col"
      >
        {/* Logo */}
        <motion.div variants={itemVariants}>
          <img
            src="/branding/goberna-escudo.svg"
            alt="Goberna"
            className="h-10 w-auto mb-8"
          />
        </motion.div>

        {/* H1 */}
        <motion.h1
          variants={itemVariants}
          className="text-5xl sm:text-6xl font-black leading-[0.95] tracking-tight text-white mb-6"
        >
          Tu candidatura,{"\n"}
          <span className="text-amber-400">con inteligencia.</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="text-base sm:text-lg text-gray-300 leading-relaxed mb-8"
        >
          En menos de 2 minutos armamos tu perfil electoral y te entregamos el
          análisis completo de tu territorio.
        </motion.p>

        {/* Feature list */}
        <motion.ul variants={containerVariants} className="space-y-3 mb-10">
          {FEATURES.map((feature) => (
            <motion.li
              key={feature}
              variants={itemVariants}
              className="flex items-center gap-3"
            >
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
                <Check className="w-3 h-3 text-amber-400" />
              </span>
              <span className="text-sm sm:text-base text-gray-200">{feature}</span>
            </motion.li>
          ))}
        </motion.ul>

        {/* CTA button */}
        <motion.button
          variants={itemVariants}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          className="self-start flex items-center gap-2.5 px-8 py-4 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-black font-semibold text-base sm:text-lg shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/35 transition-shadow"
        >
          <span>Comenzar registro</span>
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </motion.div>

      {/* Right column — decorative (hidden on mobile) */}
      <div className="hidden lg:flex items-center justify-center">
        <div className="relative flex items-center justify-center w-80 h-80">
          {/* Outer orbital ring — slow spin */}
          <div
            className="absolute inset-0 rounded-full border border-amber-400/10"
            style={{ animation: "spin 30s linear infinite" }}
          />

          {/* Tick marks on outer ring */}
          <div
            className="absolute inset-4 rounded-full border border-amber-400/8"
            style={{ animation: "spin 20s linear infinite reverse" }}
          />

          {/* Inner orbital ring — faster */}
          <div
            className="absolute inset-8 rounded-full border border-amber-400/12"
            style={{ animation: "spin 20s linear infinite" }}
          />

          {/* Center circle */}
          <div className="absolute inset-16 rounded-full border border-amber-400/15 bg-amber-400/3" />

          {/* Escudo centrado, semi-opaco */}
          <motion.img
            src="/branding/goberna-escudo.svg"
            alt=""
            aria-hidden
            className="relative w-28 h-auto opacity-15"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.15, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
          />

          {/* Glow pulse */}
          <motion.div
            className="absolute inset-16 rounded-full bg-amber-400/5"
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    </div>
  );
}
