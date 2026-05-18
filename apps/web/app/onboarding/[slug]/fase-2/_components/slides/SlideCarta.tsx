"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Building2 } from "lucide-react";
import { motion } from "motion/react";

import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { MetricBar } from "./shared/MetricBar";
import { buildDeckScores } from "../../lib/deck-scores";

const JurisdictionMap = dynamic(
  () =>
    import("../../../../carta/_components/JurisdictionMap").then(
      (m) => m.JurisdictionMap,
    ),
  { ssr: false },
);

interface Props {
  ctx: CandidatoContext;
  f2?: ConsultorFormFase2 | null;
}

export function SlideCarta({ ctx, f2 }: Props) {
  const scores = buildDeckScores(f2);

  const jurisdiccionLabel =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre;

  const partidoLabel =
    ctx.organizacion_politica?.siglas ?? ctx.organizacion_politica?.nombre ?? null;

  const iniciales = ctx.user.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <div className="absolute inset-0">
        <JurisdictionMap
          geojson={(ctx.geojson as GeoJSON.Geometry | null) ?? null}
          bbox={ctx.bbox ?? null}
          centroid={ctx.centroid ?? null}
          className="h-full w-full"
        />
      </div>

      {/* Gradient overlay para legibilidad */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#020a1e] via-[#020a1e]/40 to-transparent pointer-events-none" />

      {/* Tarjeta flotante con identidad */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute left-4 right-4 sm:left-8 sm:right-auto sm:max-w-md bottom-6 rounded-xl border border-white/15 bg-[#020a1e]/85 backdrop-blur-md p-5 sm:p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          {ctx.user.foto_url ? (
            <img
              src={ctx.user.foto_url}
              alt={ctx.user.full_name}
              className="size-14 rounded-full object-cover border border-amber-400/40"
            />
          ) : (
            <div className="size-14 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 font-black text-lg flex items-center justify-center">
              {iniciales || "·"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300 font-bold">
              Candidato
            </div>
            <h2 className="mt-0.5 text-xl sm:text-2xl font-black text-white leading-tight uppercase truncate">
              {ctx.user.full_name}
            </h2>
            <div className="mt-1 text-xs text-gray-300">{ctx.cargo.nombre}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 text-gray-300">
            <MapPin className="size-3.5 text-amber-300 shrink-0" />
            <span className="truncate" title={jurisdiccionLabel}>
              {jurisdiccionLabel}
            </span>
          </div>
          {ctx.organizacion_politica ? (
            <PartidoMini
              codigo={ctx.organizacion_politica.codigo}
              label={partidoLabel ?? ""}
            />
          ) : null}
        </div>
      </motion.div>

      {/* Card diagnóstico (bottom-right) */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="absolute right-4 bottom-6 sm:right-8 w-48 bg-[#020a1e]/90 backdrop-blur-sm border border-white/10 rounded-xl p-3 shadow-2xl hidden sm:block"
      >
        <p className="text-[9px] uppercase tracking-widest text-white/30 font-bold mb-3">
          Diagnóstico
        </p>
        <div className="flex flex-col gap-2.5">
          <MetricBar label="Perfil" pct={scores.perfilPct} />
          <MetricBar label="Territorial" pct={scores.territorioPct} />
          <MetricBar label="Digital" pct={scores.digitalPct} />
          <MetricBar label="Datos" pct={scores.datosPct} />
        </div>
      </motion.div>
    </div>
  );
}

function PartidoMini({ codigo, label }: { codigo: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-2 text-gray-300">
      {failed ? (
        <Building2 className="size-3.5 text-amber-300 shrink-0" />
      ) : (
        <img
          src={`/onboarding/orgs/${codigo}.png`}
          alt=""
          onError={() => setFailed(true)}
          className="size-4 shrink-0 rounded-full bg-white object-contain p-0.5"
        />
      )}
      <span className="truncate" title={label}>
        {label}
      </span>
    </div>
  );
}
