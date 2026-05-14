"use client";

import { motion } from "motion/react";
import {
  TrendingUp,
  AlertTriangle,
  Compass,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { SlideChromeData } from "../chrome/SlideChromeData";
import { CheckList } from "../chrome/CheckList";
import type { ConsultorFormFase2 } from "@/lib/onboarding-api";

/**
 * Slide FODA — reskin del antiguo SlideF1Foda usando chrome data.
 * Layout 2×2 (Fortalezas / Oportunidades arriba · Debilidades / Amenazas abajo)
 * con CheckList por cuadrante.
 */

interface Cuadrante {
  key: "fortalezas" | "debilidades" | "oportunidades" | "amenazas";
  label: string;
  Icon: LucideIcon;
  /** Color del icon/header del cuadrante (clase tailwind). */
  accentCls: string;
  /** Color del check de CheckList. */
  iconColor: "amber" | "navy";
}

const CUADRANTES: Cuadrante[] = [
  { key: "fortalezas",    label: "Fortalezas",    Icon: TrendingUp,    accentCls: "text-emerald-600", iconColor: "navy"  },
  { key: "oportunidades", label: "Oportunidades", Icon: Compass,       accentCls: "text-sky-600",     iconColor: "navy"  },
  { key: "debilidades",   label: "Debilidades",   Icon: AlertTriangle, accentCls: "text-amber-600",   iconColor: "amber" },
  { key: "amenazas",      label: "Amenazas",      Icon: ShieldAlert,   accentCls: "text-red-600",     iconColor: "amber" },
];

interface Props {
  f2: ConsultorFormFase2;
}

export function SlideFoda({ f2 }: Props) {
  const d = f2.fase1_rapida?.diagnostico_inicial ?? {};

  const data: Record<Cuadrante["key"], string[]> = {
    fortalezas:    d.fortalezas    ?? [],
    debilidades:   d.debilidades   ?? [],
    oportunidades: d.oportunidades ?? [],
    amenazas:      d.amenazas      ?? [],
  };

  return (
    <SlideChromeData title="FODA" subtitle="Diagnóstico inicial" chapter={3} chapterHint="el terreno donde competís">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
        {CUADRANTES.map((q, qi) => {
          const items = data[q.key];
          return (
            <motion.div
              key={q.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + qi * 0.08 }}
              className="rounded-lg border border-slate-200 bg-slate-50 p-5 flex flex-col gap-3"
            >
              <header className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                <q.Icon className={`size-5 ${q.accentCls}`} strokeWidth={2.25} />
                <h3 className="font-black uppercase tracking-wide text-sm text-[#0a1f4a]">
                  {q.label}
                </h3>
                <span className="ml-auto text-[10px] font-bold text-slate-400 tabular-nums">
                  {items.length}
                </span>
              </header>

              {items.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Sin datos.</p>
              ) : (
                <CheckList
                  items={items.map((text) => ({ text }))}
                  iconColor={q.iconColor}
                  compact
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </SlideChromeData>
  );
}

/** Visibilidad — true si al menos un cuadrante tiene items. */
export function isSlideFodaVisible(f2: ConsultorFormFase2): boolean {
  const d = f2.fase1_rapida?.diagnostico_inicial ?? {};
  return (
    (d.fortalezas?.length ?? 0) +
      (d.debilidades?.length ?? 0) +
      (d.oportunidades?.length ?? 0) +
      (d.amenazas?.length ?? 0) >
    0
  );
}
