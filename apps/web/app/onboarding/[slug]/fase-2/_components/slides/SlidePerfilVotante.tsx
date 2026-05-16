"use client";

import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2, C2Segmento } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

const SIM_SEGMENTO: C2Segmento = {
  id:                   "sim-0",
  nombre:               "Vecino comprometido",
  pct_aprox:            35,
  valores:              ["Familia", "Trabajo", "Seguridad"],
  aspiraciones:         ["Mejor infraestructura", "Empleo local", "Servicios públicos"],
  temores:              ["Inseguridad", "Corrupción", "Abandono del Estado"],
  problema_principal:   "Falta de servicios básicos de calidad en la zona",
  medio_info_preferido: "WhatsApp y boca a boca",
};

export function SlidePerfilVotante({ ctx, f2 }: Props) {
  const segmentos   = f2.territorio_ecd?.c2_segmentos ?? [];
  const isSimulated = segmentos.length === 0;
  const seg: C2Segmento = isSimulated ? SIM_SEGMENTO : segmentos[0]!;

  const lugar =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    "el territorio";

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-start justify-between"
      >
        <div>
          <SlideLabel>Segmentación Electoral</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Tu Votante Ideal
          </h2>
          <p className="text-sm text-white/40 mt-1">{lugar} · Segmento prioritario</p>
        </div>
        {seg.pct_aprox != null && (
          <div className="text-right">
            <p className="text-3xl font-black text-amber-400">{seg.pct_aprox}%</p>
            <p className="text-[10px] text-white/30">del electorado</p>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 flex-1">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-[#0a1e4a] border border-amber-400/20 rounded-2xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
              <span className="text-2xl">👤</span>
            </div>
            <div>
              <p className="font-black text-white text-lg leading-snug">{seg.nombre}</p>
              {seg.medio_info_preferido && (
                <p className="text-xs text-white/35 mt-0.5">{seg.medio_info_preferido}</p>
              )}
            </div>
          </div>
          {seg.problema_principal && (
            <div className="bg-red-600/10 border border-red-600/20 rounded-xl px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-red-400/60 font-semibold mb-1">
                Problema principal
              </p>
              <p className="text-sm text-white/70 leading-snug">{seg.problema_principal}</p>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col gap-4"
        >
          {(
            [
              { label: "Valores",      items: seg.valores      ?? [], color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
              { label: "Aspiraciones", items: seg.aspiraciones ?? [], color: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/20"       },
              { label: "Temores",      items: seg.temores      ?? [], color: "text-red-400",     bg: "bg-red-400/10 border-red-400/20"         },
            ] as const
          ).map(({ label, items, color, bg }) =>
            items.length > 0 ? (
              <div key={label}>
                <p className={`text-[10px] uppercase tracking-[0.2em] font-semibold mb-2 ${color}`}>{label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <span key={item} className={`px-2.5 py-0.5 rounded-full border text-xs font-medium text-white/70 ${bg}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">Fuente: segmentación del consultor · {seg.nombre}</p>
        {isSimulated && <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
