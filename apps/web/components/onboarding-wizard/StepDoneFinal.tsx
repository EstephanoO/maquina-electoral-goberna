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
        className="text-3xl sm:text-4xl md:text-5xl mb-3 sm:mb-4 text-white leading-tight"
      >
        {title}
      </motion.h1>

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-base sm:text-lg text-gray-400 mb-8 sm:mb-10 max-w-xl"
        >
          {subtitle}
        </motion.p>
      )}

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onContinue(dashboardUrl)}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-3.5 text-sm font-bold uppercase tracking-wider text-black shadow-lg shadow-amber-500/30 transition hover:shadow-xl"
      >
        Ir al dashboard
        <ArrowRight className="size-4" />
      </motion.button>
    </motion.div>
  );
}
