"use client";

import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";

interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

function simHitos(name: string) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = 2010 + (h % 10);
  return [
    { year: String(base),       titulo: "Inicio en gestión pública",    desc: "Primeros pasos en la administración local" },
    { year: String(base + 4),   titulo: "Reconocimiento sectorial",     desc: "Logro destacado en la comunidad" },
    { year: String(base + 8),   titulo: "Candidatura actual",           desc: "Postulación con propuesta clara de cambio" },
  ];
}

export function SlideTrayectoria({ ctx, f2 }: Props) {
  const rawText  = f2.quien_es?.trayectoria ?? "";
  const valores  = f2.quien_es?.valores ?? [];
  const isSimulated = !rawText.trim();

  const hitos = isSimulated
    ? simHitos(ctx.user.full_name)
    : rawText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((titulo) => ({ year: null as string | null, titulo, desc: null as string | null }));

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <SlideLabel>Identidad del Candidato</SlideLabel>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
          Trayectoria y Credenciales
        </h2>
        <p className="text-sm text-white/40 mt-1">
          {ctx.user.full_name} · {ctx.cargo.nombre}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 flex-1">
        <div className="sm:col-span-3 relative pl-6 space-y-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-amber-400/20" />
          {hitos.map((h, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.1 + i * 0.12 }}
              className="relative"
            >
              <div className="absolute -left-4 top-1.5 size-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20" />
              {h.year && (
                <p className="text-[10px] text-amber-400/60 font-semibold uppercase tracking-widest mb-0.5">
                  {h.year}
                </p>
              )}
              <p className="text-sm font-bold text-white leading-snug">{h.titulo}</p>
              {h.desc && (
                <p className="text-xs text-white/35 mt-0.5 leading-relaxed">{h.desc}</p>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="sm:col-span-2 bg-[#0a1e4a] border border-white/10 rounded-2xl p-5 flex flex-col gap-4"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400/60 font-semibold">
            Valores
          </p>
          <div className="flex flex-wrap gap-2">
            {(valores.length > 0
              ? valores
              : ["Honestidad", "Trabajo", "Compromiso", "Liderazgo"]
            ).map((v) => (
              <span
                key={v}
                className="px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400/80 text-xs font-semibold"
              >
                {v}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="flex items-center justify-between border-t border-white/5 pt-4"
      >
        <p className="text-[11px] text-white/20">Fuente: datos del consultor</p>
        {isSimulated && (
          <p className="text-[10px] italic text-amber-400/20">· dato estimado</p>
        )}
      </motion.div>
    </div>
  );
}

export function isVisible(_f2: ConsultorFormFase2): boolean {
  return true;
}
