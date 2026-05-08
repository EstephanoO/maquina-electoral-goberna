"use client";

import { motion } from "motion/react";
import { Users, MapPin, Vote } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";
import { getContextoJurisdiccionMock } from "@/lib/mocks/electoral-mock";

import { CountUp } from "./CountUp";

interface SlideResumenProps {
  ctx: CandidatoContext;
}

export function SlideResumen({ ctx }: SlideResumenProps) {
  const jurisdiccionLabel =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre;

  const ctxMock = getContextoJurisdiccionMock(ctx.cargo.ambito, jurisdiccionLabel);

  const tipoEleccion =
    ctx.cargo.ambito === "pais"
      ? "Elecciones Generales 2026"
      : ctx.cargo.ambito === "departamento"
        ? "Elecciones Regionales 2026"
        : "Elecciones Municipales 2026";

  const ambitoLabel =
    ctx.cargo.ambito === "departamento"
      ? "Departamento"
      : ctx.cargo.ambito === "provincia"
        ? "Provincia"
        : ctx.cargo.ambito === "distrito"
          ? "Distrito"
          : "País";

  return (
    <div className="flex-1 flex flex-col justify-center min-h-[calc(100vh-180px)] px-4 sm:px-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <p className="text-xs sm:text-sm uppercase tracking-[0.4em] text-amber-400/80 font-semibold mb-3">
          Resumen de situación actual
        </p>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white uppercase tracking-tight leading-tight">
          El terreno donde competís
        </h1>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center max-w-7xl mx-auto w-full">
        {/* Big number — electores */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center"
        >
          <div className="size-20 sm:size-24 mx-auto rounded-2xl bg-amber-400/10 border-2 border-amber-400/30 flex items-center justify-center mb-6">
            <Users className="size-10 sm:size-12 text-amber-400" />
          </div>

          <div className="text-6xl sm:text-8xl md:text-9xl font-black text-white tabular-nums tracking-tight leading-none">
            <CountUp to={ctxMock.electores} duration={2000} />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl text-amber-400 font-bold uppercase tracking-[0.2em]">
            electores
          </p>
          <p className="mt-3 text-xs uppercase tracking-widest text-gray-500">
            Padrón estimado · Datos en construcción
          </p>
        </motion.div>

        {/* Stack of fields */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="space-y-4"
        >
          <Field
            icon={<MapPin className="size-5" />}
            label="Jurisdicción"
            value={jurisdiccionLabel}
            sub={`${ambitoLabel} · ${ctx.jurisdiccion.pais.nombre}`}
            delay={0.5}
          />
          <Field
            icon={<Vote className="size-5" />}
            label="Cargo"
            value={ctx.cargo.nombre}
            sub={ctx.cargo.nivel_nombre}
            delay={0.6}
          />
          <Field
            label="Próxima elección"
            value={tipoEleccion}
            sub="A 11 meses de la fecha"
            delay={0.7}
            highlight
          />
        </motion.div>
      </div>
    </div>
  );
}

interface FieldProps {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  delay?: number;
}

function Field({ icon, label, value, sub, highlight = false, delay = 0 }: FieldProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className={`relative rounded-2xl border-2 p-5 sm:p-6 backdrop-blur-sm ${
        highlight
          ? "border-amber-400/50 bg-gradient-to-br from-amber-400/15 via-amber-400/5 to-transparent"
          : "border-amber-400/20 bg-[#0a1e4a]/60"
      }`}
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div
            className={`shrink-0 size-12 rounded-xl border ${
              highlight ? "border-amber-400/40 bg-amber-400/10" : "border-amber-400/20 bg-amber-400/5"
            } text-amber-400 flex items-center justify-center`}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400/70 font-semibold mb-1">
            {label}
          </p>
          <p
            className={`font-bold leading-tight ${
              highlight ? "text-2xl sm:text-3xl text-amber-400" : "text-xl sm:text-2xl text-white"
            }`}
          >
            {value}
          </p>
          {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
        </div>
      </div>
    </motion.div>
  );
}
