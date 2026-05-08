"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Construction } from "lucide-react";

import type { ResultadoElectoral } from "@/lib/mocks/electoral-mock";

interface PartidosZonaProps {
  partidos: ResultadoElectoral[];
}

/** Mapeo siglas → archivo de logo en /public/onboarding/orgs */
const LOGO_BY_SIGLAS: Record<string, string> = {
  FP: "fuerza_popular.png",
  AP: "accion_popular.png",
  PL: "peru_libre.png",
  APP: "alianza_para_el_progreso.png",
  RP: "renovacion_popular.png",
  AVP: "avanza_pais.png",
  PM: "partido_morado.png",
  SP: "somos_peru.png",
  PP: "podemos_peru.png",
  JP: "juntos_por_el_peru.png",
  FA: "el_frente_amplio.png",
  PAP: "partido_aprista_peruano.png",
};

export function PartidosZona({ partidos }: PartidosZonaProps) {
  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-400/80">
        <Construction className="size-2.5" />
        Datos en construcción
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {partidos.map((p, i) => {
          const logoFile = LOGO_BY_SIGLAS[p.siglas];
          const isLeader = i === 0;
          return (
            <motion.div
              key={p.siglas + i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className={`relative rounded-2xl border-2 backdrop-blur-sm p-5 transition-colors ${
                isLeader
                  ? "border-amber-500/50 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent"
                  : "border-gray-700/50 bg-gradient-to-br from-gray-900/80 to-black/40"
              }`}
            >
              {/* Badge ranking */}
              <div className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-black border border-gray-700 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-gray-400">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {ordinal(i + 1)} lugar
              </div>

              {/* Header con logo */}
              <div className="flex items-center gap-3 mb-4 mt-1">
                {logoFile ? (
                  <div className="size-12 rounded-lg bg-white p-1.5 shrink-0 flex items-center justify-center">
                    <Image
                      src={`/onboarding/orgs/${logoFile}`}
                      alt={p.partido}
                      width={36}
                      height={36}
                      className="object-contain max-h-full max-w-full"
                    />
                  </div>
                ) : (
                  <div
                    className="size-12 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.siglas}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold leading-tight truncate">{p.partido}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{p.siglas}</p>
                </div>
              </div>

              {/* Porcentaje */}
              <div className="mb-2 flex items-baseline gap-1.5">
                <span className={`text-3xl font-bold ${isLeader ? "text-amber-400" : "text-white"}`}>
                  {p.porcentaje}%
                </span>
                <span className="text-xs text-gray-500">de los votos</span>
              </div>

              {/* Barra */}
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${p.porcentaje}%` }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 + 0.2, duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: p.color }}
                />
              </div>

              <p className="text-xs text-gray-400">
                <span className="text-white font-medium">{formatNumber(p.votos)}</span> votos
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  return `${n}º`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-PE").format(n);
}
