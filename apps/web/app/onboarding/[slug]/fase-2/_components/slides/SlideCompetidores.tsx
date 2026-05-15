"use client";

import { motion } from "motion/react";
import { Shield, AlertTriangle, Users } from "lucide-react";

import type { ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideChromeData } from "../chrome/SlideChromeData";

// ─── Types ────────────────────────────────────────────────────────────────────

type NivelAmenaza = "bajo" | "medio" | "alto";

interface Competidor {
  nombre: string;
  partido?: string;
  nivel_amenaza?: NivelAmenaza;
  notas?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 5;

/** Visual config keyed by threat level. */
const THREAT_CONFIG: Record<
  NivelAmenaza,
  {
    label: string;
    pillCls: string;
    barCls: string;
    barWidthPct: number;
    Icon: typeof Shield;
  }
> = {
  alto: {
    label: "Amenaza alta",
    pillCls: "bg-red-100 text-red-700 border border-red-200",
    barCls: "bg-red-400",
    barWidthPct: 100,
    Icon: AlertTriangle,
  },
  medio: {
    label: "Amenaza media",
    pillCls: "bg-amber-100 text-amber-700 border border-amber-200",
    barCls: "bg-amber-400",
    barWidthPct: 60,
    Icon: Shield,
  },
  bajo: {
    label: "Amenaza baja",
    pillCls: "bg-slate-100 text-slate-600 border border-slate-200",
    barCls: "bg-slate-400",
    barWidthPct: 30,
    Icon: Shield,
  },
};

const FALLBACK_THREAT = THREAT_CONFIG.medio;

function getThreatConfig(nivel: NivelAmenaza | undefined) {
  return nivel ? THREAT_CONFIG[nivel] : FALLBACK_THREAT;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThreatPill({ nivel }: { nivel: NivelAmenaza | undefined }) {
  const { label, pillCls, Icon } = getThreatConfig(nivel);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pillCls}`}
    >
      <Icon className="size-3 shrink-0" strokeWidth={2.5} />
      {label}
    </span>
  );
}

function ThreatBar({ nivel }: { nivel: NivelAmenaza | undefined }) {
  const { barCls, barWidthPct } = getThreatConfig(nivel);
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${barCls}`}
        initial={{ width: "0%" }}
        animate={{ width: `${barWidthPct}%` }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function SummaryBanner({ competidores }: { competidores: Competidor[] }) {
  const total = competidores.length;
  const altos = competidores.filter((c) => c.nivel_amenaza === "alto").length;
  const medios = competidores.filter((c) => c.nivel_amenaza === "medio").length;
  const bajos = competidores.filter((c) => c.nivel_amenaza === "bajo").length;
  const sinClasificar = total - altos - medios - bajos;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3">
      <div className="flex items-center gap-2.5">
        <Users className="size-4 text-[#0a1f4a] shrink-0" strokeWidth={2.25} />
        <span className="text-sm font-bold text-[#0a1f4a]">
          Se identificaron{" "}
          <span className="text-base tabular-nums">{total}</span>{" "}
          {total === 1 ? "competidor principal" : "competidores principales"}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] font-semibold tabular-nums">
        {altos > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <span className="size-2 rounded-full bg-red-400 inline-block" />
            {altos} {altos === 1 ? "alto" : "altos"}
          </span>
        )}
        {medios > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <span className="size-2 rounded-full bg-amber-400 inline-block" />
            {medios} {medios === 1 ? "medio" : "medios"}
          </span>
        )}
        {bajos > 0 && (
          <span className="flex items-center gap-1 text-slate-500">
            <span className="size-2 rounded-full bg-slate-400 inline-block" />
            {bajos} {bajos === 1 ? "bajo" : "bajos"}
          </span>
        )}
        {sinClasificar > 0 && (
          <span className="text-slate-400">
            {sinClasificar} sin clasificar
          </span>
        )}
      </div>
    </div>
  );
}

function CompetidorRow({
  competidor,
  index,
}: {
  competidor: Competidor;
  index: number;
}) {
  const rank = String(index + 1).padStart(2, "0");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 + index * 0.1 }}
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col gap-3"
    >
      {/* Top row: rank + name + party + pill */}
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Ranking number */}
        <span
          className="shrink-0 text-2xl sm:text-3xl font-black tabular-nums leading-none select-none"
          style={{ color: "#0a1f4a" }}
          aria-label={`Posición ${index + 1}`}
        >
          {rank}
        </span>

        {/* Name + party */}
        <div className="flex-1 min-w-0">
          <p
            className="text-base sm:text-lg font-black leading-tight truncate"
            style={{ color: "#0a1f4a" }}
          >
            {competidor.nombre}
          </p>
          {competidor.partido ? (
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500 font-medium leading-snug">
              {competidor.partido}
            </p>
          ) : null}
        </div>

        {/* Threat pill */}
        <div className="shrink-0 pt-0.5">
          <ThreatPill nivel={competidor.nivel_amenaza} />
        </div>
      </div>

      {/* Threat bar */}
      <ThreatBar nivel={competidor.nivel_amenaza} />

      {/* Notes */}
      {competidor.notas ? (
        <p className="text-xs sm:text-sm text-slate-500 italic leading-snug">
          {competidor.notas}
        </p>
      ) : null}
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-8 py-14 text-center gap-3">
      <Users className="size-8 text-slate-300" strokeWidth={1.5} />
      <p className="text-sm italic text-slate-500">
        Sin competidores registrados en el diagnóstico inicial.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideCompetidores({ f2 }: Props) {
  const allCompetidores =
    f2.fase1_rapida?.diagnostico_inicial?.principales_competidores ?? [];

  const visible = allCompetidores.slice(0, MAX_VISIBLE);
  const overflow = allCompetidores.length - visible.length;

  return (
    <SlideChromeData
      title="PANORAMA COMPETITIVO"
      subtitle="Principales rivales identificados"
      chapter={3}
      chapterHint="el campo de batalla"
    >
      <div className="flex flex-col gap-5 max-w-3xl mx-auto">
        {allCompetidores.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Summary banner */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
            >
              <SummaryBanner competidores={allCompetidores} />
            </motion.div>

            {/* Competitor rows */}
            <div className="flex flex-col gap-3">
              {visible.map((competidor, i) => (
                <CompetidorRow
                  key={`${competidor.nombre}-${i}`}
                  competidor={competidor}
                  index={i}
                />
              ))}
            </div>

            {/* Overflow note */}
            {overflow > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 + visible.length * 0.1 + 0.1 }}
                className="text-center text-xs text-slate-500 font-medium"
              >
                + {overflow} {overflow === 1 ? "más identificado" : "más identificados"}
              </motion.p>
            )}
          </>
        )}
      </div>
    </SlideChromeData>
  );
}

// ─── Visibility predicate ─────────────────────────────────────────────────────

export function isSlideCompetidoresVisible(f2: ConsultorFormFase2): boolean {
  return (
    (f2.fase1_rapida?.diagnostico_inicial?.principales_competidores?.length ?? 0) > 0
  );
}
