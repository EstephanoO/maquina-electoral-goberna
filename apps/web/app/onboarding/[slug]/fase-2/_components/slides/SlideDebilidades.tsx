"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { CandidatoContext, ConsultorFormFase2 } from "@/lib/onboarding-api";
import { SlideLabel } from "../_ui/critico";
import { Badge } from "./shared/Badge";
import { SlideModal } from "./shared/SlideModal";

/**
 * Slide data — Debilidades y Riesgos.
 * Layout 2-col dark CRÍTICO:
 *   - Izq (60%): tabla de fuentes auditadas
 *   - Der (40%): lista libre de debilidades por severidad
 * Stamp de riesgo global si existe nivel_riesgo_global.
 */
interface Props {
  ctx: CandidatoContext;
  f2: ConsultorFormFase2;
}

type FuenteKey = "denuncias" | "google" | "reputacion_redes" | "jne_observaciones";

const FUENTE_LABEL: Record<FuenteKey, string> = {
  denuncias:           "Denuncias",
  google:              "Google",
  reputacion_redes:    "Reputación redes",
  jne_observaciones:   "JNE",
};

const ESTADO_CONFIG = {
  flag:   { rowCls: "bg-red-500/10 border-red-500/20",     badgeCls: "bg-red-600 text-white",     label: "CRÍTICO" },
  review: { rowCls: "bg-amber-500/10 border-amber-500/20", badgeCls: "bg-amber-600 text-white",   label: "REVISIÓN" },
  ok:     { rowCls: "bg-emerald-500/10 border-emerald-500/20", badgeCls: "bg-emerald-600 text-white", label: "OK" },
} as const;

const SEV_CONFIG = {
  alta:  { cls: "bg-red-600 text-white",     label: "ALTA" },
  media: { cls: "bg-amber-600 text-white",   label: "MEDIA" },
  baja:  { cls: "bg-slate-600 text-white",   label: "BAJA" },
} as const;

const SEV_ORDER: Record<"alta" | "media" | "baja", number> = {
  alta: 0, media: 1, baja: 2,
};

const GLOBAL_RISK_CONFIG = {
  critico: { cls: "text-red-500",     label: "CRÍTICO" },
  alto:    { cls: "text-orange-500",  label: "ALTO" },
  medio:   { cls: "text-amber-400",   label: "MEDIO" },
  bajo:    { cls: "text-emerald-400", label: "BAJO" },
} as const;

const SIM_DEBILIDADES = [
  { titulo: "Baja presencia en redes sociales",  descripcion: undefined, severidad: "alta" as const },
  { titulo: "Sin web oficial activa",            descripcion: undefined, severidad: "media" as const },
  { titulo: "Poca visibilidad mediática",        descripcion: undefined, severidad: "baja" as const },
];

const ALL_FUENTES: FuenteKey[] = ["denuncias", "google", "reputacion_redes", "jne_observaciones"];

function ClickableFuenteCard({
  label,
  estado,
  hallazgos,
  cfg,
}: {
  label: string;
  estado: "flag" | "review" | "ok";
  hallazgos: string[];
  cfg: typeof ESTADO_CONFIG[keyof typeof ESTADO_CONFIG];
}) {
  const [open, setOpen] = useState(false);
  const badgeTone = (estado === "flag" ? "critico" : estado === "review" ? "revision" : "verde") as const;
  return (
    <>
      <div
        className={`rounded-xl border ${cfg.rowCls} p-4 cursor-pointer hover:opacity-80 transition-opacity relative`}
        onClick={() => setOpen(true)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">{label}</p>
            {hallazgos.length > 0 ? (
              <p className="text-xs text-white/50 mt-1 leading-snug">
                {hallazgos.join(" · ")}
              </p>
            ) : (
              <p className="text-xs text-white/25 mt-1 italic">Sin hallazgos.</p>
            )}
          </div>
          <div className="shrink-0">
            <Badge tone={badgeTone} />
          </div>
        </div>
      </div>
      <SlideModal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        badge={<Badge tone={badgeTone} />}
      >
        <div className="space-y-3 text-sm text-white/70 leading-relaxed">
          {hallazgos.length > 0 ? (
            <ul className="space-y-1">
              {hallazgos.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-400/50 mt-1">·</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-white/30 italic">Sin hallazgos registrados.</p>
          )}
          {estado === "flag" && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mt-3">
              <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-1">
                Implicancia
              </p>
              <p className="text-xs text-white/60">
                Este hallazgo puede impactar negativamente la campaña si no se gestiona proactivamente.
              </p>
            </div>
          )}
        </div>
      </SlideModal>
    </>
  );
}

const badgeToneFromSev = (sev: "alta" | "media" | "baja") =>
  sev === "baja" ? "verde" : sev;

export function SlideDebilidades({ ctx, f2 }: Props) {
  const fuentesRaw = f2.debilidades?.fuentes ?? [];
  const listaRaw   = f2.debilidades?.lista_libre ?? [];
  const isSimLista  = listaRaw.length === 0;

  const listaLibre = [...(isSimLista ? SIM_DEBILIDADES : listaRaw)].sort(
    (a, b) => SEV_ORDER[a.severidad] - SEV_ORDER[b.severidad],
  );

  const nivelGlobal = f2.perfil_candidato?.n3_riesgo?.nivel_riesgo_global;
  const globalCfg   = nivelGlobal ? GLOBAL_RISK_CONFIG[nivelGlobal] : null;

  const subtitle = ctx.user.full_name
    ? `Auditoría preventiva · ${ctx.user.full_name}`
    : "Auditoría preventiva";

  // Merge fuentes auditadas con las keys fijas (para mostrar todas)
  const fuentesMap = Object.fromEntries(fuentesRaw.map((f) => [f.key, f]));

  return (
    <div className="min-h-full bg-[#020a1e] flex flex-col px-6 py-8 sm:px-10 sm:py-10 gap-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-start justify-between"
      >
        <div>
          <SlideLabel>Diagnóstico de Vulnerabilidades</SlideLabel>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            Debilidades y riesgos
          </h2>
          <p className="text-sm text-white/40 mt-1">{subtitle}</p>
        </div>

        {/* Riesgo global badge — esquina derecha */}
        {globalCfg && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-semibold">
              Riesgo global
            </p>
            <p className={`text-3xl font-black ${globalCfg.cls}`}>
              {globalCfg.label}
            </p>
          </div>
        )}
      </motion.div>

      {/* ── Body split ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 flex-1">
        {/* Left — Fuentes auditadas (60%) */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:col-span-3 flex flex-col gap-3"
        >
          <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-amber-400/60 mb-1">
            Fuentes auditadas
          </h3>

          {fuentesRaw.length > 0 ? (
            <div className="flex flex-col gap-2">
              {fuentesRaw.map((fuente, i) => {
                const cfg = ESTADO_CONFIG[fuente.estado];
                const label = FUENTE_LABEL[fuente.key] ?? fuente.key;
                return (
                  <motion.div
                    key={fuente.key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 + i * 0.06 }}
                  >
                    <ClickableFuenteCard
                      label={label}
                      estado={fuente.estado}
                      hallazgos={fuente.hallazgos ?? []}
                      cfg={cfg}
                    />
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* Tabla con todas las fuentes en estado neutro si no hay datos */
            <div className="flex flex-col gap-2">
              {ALL_FUENTES.map((key, i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + i * 0.06 }}
                  className="rounded-xl border bg-white/5 border-white/5 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white/60">{FUENTE_LABEL[key]}</p>
                    <span className="text-[10px] italic text-white/20">Sin auditar</span>
                  </div>
                </motion.div>
              ))}
              <p className="text-[10px] italic text-amber-400/20 mt-1">datos simulados</p>
            </div>
          )}
        </motion.div>

        {/* Right — Lista libre (40%) */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="lg:col-span-2 flex flex-col gap-3"
        >
          <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-amber-400/60 mb-1">
            Riesgos identificados
          </h3>

          <ul className="flex flex-col gap-3">
            {listaLibre.map((item, i) => {
              return (
                <motion.li
                  key={`${item.titulo}-${i}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.28 + i * 0.07 }}
                  className="bg-[#0a1e4a] border border-white/10 rounded-xl p-4 flex items-start gap-3"
                >
                  <div className="shrink-0 mt-0.5">
                    <Badge tone={badgeToneFromSev(item.severidad)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white leading-snug">
                      {item.titulo}
                    </p>
                    {item.descripcion && (
                      <p className="text-xs text-white/50 mt-1 leading-snug">
                        {item.descripcion}
                      </p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ul>

          {isSimLista && (
            <p className="text-[10px] italic text-amber-400/20 mt-1">datos simulados</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Determina si la slide es relevante para el deck del candidato.
 */
export function isVisible(f2: ConsultorFormFase2): boolean {
  const fuentes = f2.debilidades?.fuentes ?? [];
  const hasConcernedFuente = fuentes.some((f) => f.estado !== "ok");
  const hasLista = (f2.debilidades?.lista_libre?.length ?? 0) > 0;
  return hasConcernedFuente || hasLista;
}
