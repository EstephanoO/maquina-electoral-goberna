"use client";

import { motion } from "motion/react";
import type { ConsultorFormFase2, CandidatoContext } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props { ctx: CandidatoContext; f2: ConsultorFormFase2 }

export function SlideTerreno({ ctx, f2 }: Props) {
  const t = f2.terreno;
  const lugar = ctx.jurisdiccion.distrito?.nombre ?? ctx.jurisdiccion.provincia?.nombre ?? "el territorio";

  const pillars = [
    {
      letra: "E", nombre: "Estructura", subtitulo: "Bourdieu · Campo + Capitales",
      color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20",
      items: [
        t?.e1_demografia?.poblacion_total ? `${t.e1_demografia.poblacion_total.toLocaleString()} hab.` : null,
        t?.e2_capital_economico?.principales_sectores?.[0] ?? null,
        t?.e4_campo_politico?.nivel_polarizacion ? `Polarización: ${t.e4_campo_politico.nivel_polarizacion}` : null,
        t?.e5_cleavages?.fracturas_vigentes?.[0]?.nombre ?? null,
      ].filter((x): x is string => !!x),
    },
    {
      letra: "C", nombre: "Conciencia", subtitulo: "Michigan · Identificación + Actitudes",
      color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20",
      items: [
        t?.c2_psicografia?.length ? `${t.c2_psicografia.length} segmentos identificados` : null,
        t?.c4_issues?.[0]?.issue ?? null,
        t?.c1_identidades?.partido_dominante ? `Dominante: ${t.c1_identidades.partido_dominante}` : null,
        t?.c5_medios?.encuestas_disponibles?.[0]?.fuente ?? null,
      ].filter((x): x is string => !!x),
    },
    {
      letra: "D", nombre: "Decisión", subtitulo: "Downs/Key · Elección Racional",
      color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20",
      items: [
        t?.d1_universo?.padron_total ? `Padrón: ${t.d1_universo.padron_total.toLocaleString()}` : null,
        t?.d1_universo?.votos_necesarios ? `Meta: ${t.d1_universo.votos_necesarios.toLocaleString()} votos` : null,
        t?.d3_oferta?.candidatos?.length ? `${t.d3_oferta.candidatos.length} competidores` : null,
        t?.d4_logica?.tipo_decision_predominante ?? null,
      ].filter((x): x is string => !!x),
    },
  ];

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <SlideLabel>Terreno de Postulación</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Triada ECD · {lugar}
        </h2>
        <p className="text-sm text-white/40 mt-1">Estructura · Conciencia · Decisión</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 flex-1">
        {pillars.map((p, i) => (
          <motion.div
            key={p.letra}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1 }}
            className={`rounded-2xl border ${p.bg} p-5 flex flex-col gap-4`}
          >
            <header className={`flex items-center gap-3 border-b border-white/10 pb-3 ${p.color}`}>
              <span className="text-4xl font-black leading-none">{p.letra}</span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] font-semibold opacity-60">{p.subtitulo}</p>
                <p className="text-sm font-black uppercase tracking-wide">{p.nombre}</p>
              </div>
            </header>
            {p.items.length === 0 ? (
              <p className="text-xs text-white/20 italic">Sin datos cargados.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {p.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className={`text-xs font-bold mt-0.5 ${p.color}`}>›</span>
                    <span className="text-sm text-white/70 leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function isSlideTerrenovisible(f2: ConsultorFormFase2): boolean {
  const t = f2.terreno;
  return !!(t?.e1_demografia ?? t?.c2_psicografia?.length ?? t?.d1_universo ?? t?.d3_oferta);
}
