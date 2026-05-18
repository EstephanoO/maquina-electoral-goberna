"use client";

import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { CriticoSello, SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

type StatusVal = "ok" | "review" | "flag";
const STATUS_ICON: Record<StatusVal, string>  = { ok: "✓", review: "~", flag: "✗" };
const STATUS_COLOR: Record<StatusVal, string> = {
  ok:     "text-emerald-400",
  review: "text-amber-400",
  flag:   "text-red-400",
};

function simComp(name: string, idx: number) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) + idx * 37;
  return {
    web:    (h % 3 === 0 ? "ok" : h % 3 === 1 ? "review" : "flag") as StatusVal,
    google: (h % 5 === 0 ? "ok" : "review") as StatusVal,
    redes:  ((h + 1) % 3 === 0 ? "ok" : "flag") as StatusVal,
  };
}

export function SlideDigitalVsComp({ ctx, f2 }: Props) {
  const pd = f2.presencia_digital ?? {};
  const adversarios = f2.redes_sociales?.adversarios ?? [];
  const competidoresForm = f2.fase1_rapida?.diagnostico_inicial?.principales_competidores ?? [];

  const rivals = adversarios.length > 0
    ? adversarios.slice(0, 3).map((a) => ({ nombre: a.nombre, partido: a.partido ?? "" }))
    : competidoresForm.slice(0, 3).map((c) => ({ nombre: c.nombre, partido: c.partido ?? "" }));

  const isSimRivals = rivals.length === 0;
  const finalRivals = isSimRivals
    ? [
        { nombre: "Carlos Mendoza Torres", partido: "APP" },
        { nombre: "María García Quispe",   partido: "FP"  },
      ]
    : rivals;

  const candidatoRow = {
    nombre:  ctx.user.full_name,
    web:     (pd.web_oficial    ?? "flag") as StatusVal,
    google:  (pd.google_results ?? "flag") as StatusVal,
    redes:   (pd.redes_verificadas ?? "flag") as StatusVal,
    isMe: true as const,
  };

  const rivalRows = finalRivals.map((r, i) => {
    const s = simComp(r.nombre, i);
    return { ...r, ...s, isMe: false as const };
  });

  const allRows = [candidatoRow, ...rivalRows];

  const isCritico =
    [candidatoRow.web, candidatoRow.google, candidatoRow.redes].filter((s) => s === "flag").length >= 2;

  const cols = ["Web Oficial", "Google", "Redes Soc."];

  return (
    <div className="flex-1 bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-start justify-between"
      >
        <div>
          <SlideLabel>Diagnóstico Digital</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Digital vs Competidores
          </h2>
          <p className="text-sm text-white/40 mt-1">Comparativa de presencia online</p>
        </div>
        {isCritico && <CriticoSello tipo="critico" />}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="bg-[#0a1e4a] border border-white/10 rounded-2xl overflow-hidden flex-1"
      >
        <div className="grid grid-cols-4 border-b border-white/5 px-5 py-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold">Candidato</p>
          {cols.map((c) => (
            <p key={c} className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-semibold text-center">{c}</p>
          ))}
        </div>
        {allRows.map((row) => (
          <div
            key={row.nombre}
            className={`grid grid-cols-4 items-center px-5 py-4 border-b border-white/5 last:border-0 ${
              row.isMe ? "bg-amber-400/5" : ""
            }`}
          >
            <div>
              <p className={`text-sm font-semibold leading-snug ${row.isMe ? "text-amber-400" : "text-white/70"}`}>
                {row.isMe ? "▶ " : ""}{row.nombre.split(" ").slice(0, 2).join(" ")}
              </p>
              {!row.isMe && "partido" in row && row.partido && (
                <p className="text-[10px] text-white/30">{row.partido}</p>
              )}
            </div>
            {([row.web, row.google, row.redes] as StatusVal[]).map((status, j) => (
              <div key={j} className="flex justify-center">
                <span className={`text-lg font-black ${STATUS_COLOR[status]}`}>
                  {STATUS_ICON[status]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">✓ ok · ~ revisar · ✗ ausente/problema</p>
        {isSimRivals && (
          <p className="text-[10px] italic text-amber-400/20">· rivales estimados</p>
        )}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
