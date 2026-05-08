"use client";

import { motion } from "motion/react";
import { ArrowRight, Trophy } from "lucide-react";

interface StepDoneFinalProps {
  title: string;
  subtitle?: string;
  dashboardUrl: string;
  onContinue: (url: string) => void;
}

export function StepDoneFinal({ title, subtitle, dashboardUrl, onContinue }: StepDoneFinalProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto flex max-w-2xl flex-col items-center px-4 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
        className="mb-6 sm:mb-8"
      >
        <div className="relative">
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 blur-2xl opacity-60"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative flex size-24 items-center justify-center rounded-full border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/40 to-amber-600/40 shadow-2xl shadow-amber-500/30 backdrop-blur-sm sm:size-28">
            <Trophy className="size-12 text-amber-400 sm:size-14" />
          </div>
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-4xl sm:text-6xl md:text-7xl mb-4 sm:mb-5 text-white leading-[0.95] font-black tracking-tight uppercase"
      >
        {title}
      </motion.h1>

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-base sm:text-lg text-gray-300 mb-10 sm:mb-12 max-w-xl"
        >
          {subtitle}
        </motion.p>
      )}

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onContinue(dashboardUrl)}
        className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 px-10 py-4 text-base font-black uppercase tracking-wider text-[#0a1e4a] shadow-[0_15px_50px_rgba(251,191,36,0.4)] hover:shadow-[0_20px_70px_rgba(251,191,36,0.6)] transition-shadow"
      >
        Ir a mi diagnóstico
        <ArrowRight className="size-5" />
      </motion.button>
    </motion.div>
  );
}
