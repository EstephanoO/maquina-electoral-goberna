"use client";

import { motion } from "motion/react";
import { Users } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";
import { getContextoJurisdiccionMock } from "@/lib/mocks/electoral-mock";

import { SlideShell } from "./SlideShell";

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

  return (
    <SlideShell title="Resumen de situación actual">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center pt-6">
        {/* Lado izquierdo: electores */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center text-center px-6"
        >
          <div className="size-20 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mb-6">
            <Users className="size-10 text-amber-400" />
          </div>

          <p className="text-5xl sm:text-7xl font-bold text-white tabular-nums">
            {formatNumber(ctxMock.electores)}
          </p>
          <p className="mt-1 text-lg sm:text-xl text-amber-400 font-semibold uppercase tracking-widest">
            electores
          </p>
          <p className="mt-4 text-xs text-gray-500 uppercase tracking-wider">
            Padrón estimado · Datos en construcción
          </p>
        </motion.div>

        {/* Lado derecho: tarjeta país/jurisdicción/elección */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-3xl bg-gradient-to-br from-[#0a1e4a] to-[#0d2861] border border-amber-500/20 p-6 sm:p-10 shadow-2xl"
        >
          <div className="space-y-6 divide-y divide-amber-500/10">
            <Field label="País" value={ctx.jurisdiccion.pais.nombre} />
            <Field
              label={
                ctx.cargo.ambito === "departamento"
                  ? "Departamento"
                  : ctx.cargo.ambito === "provincia"
                    ? "Provincia"
                    : ctx.cargo.ambito === "distrito"
                      ? "Distrito"
                      : "Ámbito"
              }
              value={jurisdiccionLabel}
            />
            <Field label="Cargo" value={ctx.cargo.nombre} />
            <Field label="Elección" value={tipoEleccion} highlight />
          </div>
        </motion.div>
      </div>
    </SlideShell>
  );
}

interface FieldProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function Field({ label, value, highlight = false }: FieldProps) {
  return (
    <div className="pt-5 first:pt-0">
      <p className="text-[11px] uppercase tracking-widest text-amber-400/70 mb-1.5">
        {label}
      </p>
      <p
        className={`${
          highlight ? "text-2xl sm:text-3xl text-amber-400" : "text-xl sm:text-2xl text-white"
        } font-bold leading-tight`}
      >
        {value}
      </p>
    </div>
  );
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-PE").format(n);
}
