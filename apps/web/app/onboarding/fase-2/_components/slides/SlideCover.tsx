"use client";

import { motion } from "motion/react";

export function SlideCover() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-180px)]">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="text-center px-6"
      >
        {/* Logo Goberna estilizado — círculo dorado con landmark */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="relative mx-auto size-36 sm:size-44 mb-12"
        >
          {/* Anillo exterior animado */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-12px] rounded-full border-2 border-dashed border-amber-400/30"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/branding/goberna-isotipo.png"
              alt="Goberna"
              className="size-full object-contain"
            />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
          className="text-6xl sm:text-8xl md:text-9xl font-black text-white tracking-tighter"
        >
          GOBERNA
        </motion.h1>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="mt-4 h-1.5 w-40 sm:w-56 bg-amber-400 mx-auto"
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
          className="mt-5 text-lg sm:text-xl uppercase tracking-[0.5em] text-amber-400 font-semibold"
        >
          Consultoría Política
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="mt-16 text-xs sm:text-sm uppercase tracking-[0.4em] text-gray-400"
        >
          Propuesta técnica · Análisis estratégico
        </motion.p>
      </motion.div>
    </div>
  );
}
