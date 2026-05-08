"use client";

import { motion } from "motion/react";
import { User } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { SlideShell } from "./SlideShell";

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

  return (
    <SlideShell bare>
      <div className="w-full px-2 sm:px-6">
        {/* Headline tipo PDF */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-5xl md:text-6xl font-bold text-white text-center uppercase tracking-tight leading-tight px-4"
        >
          {cargoUpper} <span className="text-amber-400">DE {jurisdiccionLabel.toUpperCase()}</span>
        </motion.h1>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 items-center gap-8 md:gap-12">
          {/* Foto candidato */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center md:justify-end"
          >
            <div className="relative">
              {ctx.user.foto_url ? (
                <div className="size-56 sm:size-72 rounded-full overflow-hidden border-4 border-amber-400 shadow-2xl shadow-amber-500/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ctx.user.foto_url}
                    alt={ctx.user.full_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="size-56 sm:size-72 rounded-full border-4 border-dashed border-gray-600 bg-gray-900/60 flex items-center justify-center">
                  <User className="size-24 text-gray-700" />
                </div>
              )}

              {/* Logo partido si existe */}
              {ctx.organizacion_politica?.siglas && (
                <div className="absolute -bottom-2 -right-2 rounded-xl bg-amber-400 px-3 py-1.5 text-black font-bold text-sm shadow-lg">
                  {ctx.organizacion_politica.siglas}
                </div>
              )}
            </div>
          </motion.div>

          {/* Tagline RUMBO */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center md:text-left"
          >
            <p className="text-2xl sm:text-3xl text-white font-light tracking-wide">RUMBO</p>
            <div className="my-2 inline-block bg-amber-400 text-[#0a1e4a] font-bold px-3 py-0.5 text-sm tracking-widest">
              A LAS
            </div>
            <p className="text-3xl sm:text-5xl text-white font-bold uppercase leading-tight tracking-tight">
              ELECCIONES
            </p>
            <div className="mt-2 inline-block bg-white text-[#0a1e4a] font-bold px-4 py-1 text-xl sm:text-2xl tracking-wide rotate-[-2deg] shadow-lg">
              {ctx.cargo.ambito === "pais"
                ? "GENERALES"
                : ctx.cargo.ambito === "departamento"
                  ? "REGIONALES"
                  : "MUNICIPALES"}
            </div>

            <p className="mt-6 text-amber-400 font-semibold tracking-wide">
              {ctx.user.full_name}
            </p>
            {ctx.organizacion_politica && (
              <p className="text-sm text-gray-400">
                {ctx.organizacion_politica.nombre}
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </SlideShell>
  );
}
