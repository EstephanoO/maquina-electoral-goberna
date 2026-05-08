"use client";

import { motion } from "motion/react";
import { Landmark } from "lucide-react";

import { SlideShell } from "./SlideShell";

export function SlideCover() {
  return (
    <SlideShell bare>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center px-6"
      >
        <div className="mx-auto size-32 sm:size-40 rounded-full border-4 border-amber-400 flex items-center justify-center mb-8 bg-amber-500/10">
          <Landmark className="size-16 sm:size-20 text-amber-400" />
        </div>

        <h1 className="text-5xl sm:text-7xl md:text-8xl font-bold text-white tracking-tight">
          GOBERNA
        </h1>
        <div className="mt-3 h-1 w-32 sm:w-40 bg-amber-400 mx-auto" />
        <p className="mt-4 text-lg sm:text-xl uppercase tracking-[0.4em] text-amber-400/90">
          Consultoría Política
        </p>

        <p className="mt-12 text-sm sm:text-base text-gray-400 uppercase tracking-widest">
          Propuesta técnica · Análisis electoral
        </p>
      </motion.div>
    </SlideShell>
  );
}
