"use client";

import { motion } from "motion/react";
import { User } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";

interface SlideIdentityProps {
  ctx: CandidatoContext;
}

export function SlideIdentity({ ctx }: SlideIdentityProps) {
  const cargoUpper = ctx.cargo.nombre.toUpperCase();
  const jurisdiccionLabel =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre;

  const tipoEleccion =
    ctx.cargo.ambito === "pais"
      ? "GENERALES"
      : ctx.cargo.ambito === "departamento"
        ? "REGIONALES"
        : "MUNICIPALES";

  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-180px)] px-2 sm:px-6">
      <div className="w-full max-w-7xl mx-auto">
        {/* Headline tipo PDF — upper huge */}
        <motion.h1
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white text-center uppercase tracking-tight leading-[0.95] px-2 mb-12"
        >
          {cargoUpper}{" "}
          <span className="text-amber-400 block sm:inline">DE {jurisdiccionLabel.toUpperCase()}</span>
        </motion.h1>

        <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-10 md:gap-16">
          {/* Foto candidato — hero treatment */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.6, type: "spring" }}
            className="flex justify-center md:justify-end"
          >
            <div className="relative">
              {/* Anillo dorado animado */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-8px] rounded-full bg-gradient-conic from-amber-400 via-amber-600 to-amber-400 opacity-50 blur-md"
                style={{
                  background: "conic-gradient(from 0deg, #fbbf24, #f59e0b, #fbbf24, #f59e0b, #fbbf24)",
                }}
              />

              {ctx.user.foto_url ? (
                <div className="relative size-64 sm:size-80 md:size-96 rounded-full overflow-hidden border-[6px] border-amber-400 shadow-[0_0_60px_rgba(251,191,36,0.4)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ctx.user.foto_url}
                    alt={ctx.user.full_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="relative size-64 sm:size-80 md:size-96 rounded-full border-[6px] border-dashed border-amber-400/40 bg-gradient-to-br from-[#0a1e4a] to-[#020a1e] flex items-center justify-center shadow-[0_0_60px_rgba(251,191,36,0.2)]">
                  <User className="size-32 text-amber-400/30" strokeWidth={1.2} />
                </div>
              )}

              {/* Logo partido */}
              {ctx.organizacion_politica?.siglas && (
                <motion.div
                  initial={{ scale: 0, rotate: -12 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.7, type: "spring" }}
                  className="absolute -bottom-3 -right-3 rounded-2xl bg-amber-400 px-4 py-2 text-[#0a1e4a] font-black text-lg shadow-2xl ring-4 ring-[#061b3d]"
                >
                  {ctx.organizacion_politica.siglas}
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Tagline RUMBO — bigger and more impactful */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 }}
            className="text-center md:text-left"
          >
            <p className="text-3xl sm:text-5xl text-white font-light tracking-wider mb-1">
              RUMBO
            </p>
            <div className="my-1 inline-block bg-amber-400 text-[#0a1e4a] font-black px-3 py-0.5 text-sm md:text-base tracking-[0.3em]">
              A LAS
            </div>
            <p className="text-4xl sm:text-6xl md:text-7xl text-white font-black uppercase leading-[0.95] tracking-tight">
              ELECCIONES
            </p>
            <motion.div
              initial={{ rotate: 8, scale: 0.8, opacity: 0 }}
              animate={{ rotate: -2, scale: 1, opacity: 1 }}
              transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
              className="mt-3 inline-block bg-white text-[#0a1e4a] font-black px-5 py-1.5 text-2xl sm:text-4xl tracking-tight shadow-2xl"
            >
              {tipoEleccion}
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
              className="mt-8 pt-6 border-t border-amber-400/20"
            >
              <p className="text-xl sm:text-2xl text-amber-400 font-bold tracking-wide">
                {ctx.user.full_name}
              </p>
              {ctx.organizacion_politica && (
                <p className="text-sm sm:text-base text-gray-400 mt-1">
                  {ctx.organizacion_politica.nombre}
                </p>
              )}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
