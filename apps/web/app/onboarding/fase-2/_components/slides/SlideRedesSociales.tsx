"use client";

import { motion } from "motion/react";
import { Facebook, Instagram, Music2, Globe, AlertCircle } from "lucide-react";
import { SlideShell } from "./SlideShell";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

// Estructura provisional — los handles se llenan vía form del consultor
const PLATAFORMAS = [
  { key: "facebook", icon: Facebook, label: "Facebook" },
  { key: "instagram", icon: Instagram, label: "Instagram" },
  { key: "tiktok", icon: Music2, label: "TikTok" },
];

export function SlideRedesSociales({ ctx }: Props) {
  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? "candidato";

  // Mock de adversarios — en próxima iteración viene del form del consultor
  const adversarios = [
    { nombre: "[Adversario 1]", partido: "[Partido]", placeholder: true },
    { nombre: "[Adversario 2]", partido: "[Partido]", placeholder: true },
    { nombre: "[Adversario 3]", partido: "[Partido]", placeholder: true },
  ];

  return (
    <SlideShell kicker="Presencia digital · Redes" title="REDES SOCIALES — TÚ Y LOS ADVERSARIOS">
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed"
        >
          Auditamos tus redes y las de tus 3 principales adversarios. El que está mejor
          posicionado en redes hoy ya lleva una ventaja de meses.
        </motion.p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tus redes */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-amber-400/5 border-2 border-amber-400/40 rounded-md p-5 sm:p-6"
          >
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400 font-bold mb-1">
              Tus redes
            </div>
            <h3 className="text-3xl font-black uppercase text-white tracking-tight mb-4">
              {firstName}
            </h3>

            <div className="space-y-3">
              {PLATAFORMAS.map((p) => {
                const Icon = p.icon;
                return (
                  <div
                    key={p.key}
                    className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3"
                  >
                    <Icon className="size-5 text-amber-400 shrink-0" strokeWidth={2} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">
                        {p.label}
                      </div>
                      <div className="text-amber-400/70 italic text-sm truncate">
                        @[handle a completar]
                      </div>
                    </div>
                    <span className="text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-sm bg-amber-400/20 text-amber-300">
                      Por validar
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3">
                <Globe className="size-5 text-amber-400 shrink-0" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">
                    Página web oficial
                  </div>
                  <div className="text-amber-400/70 italic text-sm truncate">[A completar]</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Adversarios */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/[0.03] border border-white/10 rounded-md p-5 sm:p-6"
          >
            <div className="text-[10px] uppercase tracking-[0.3em] text-red-400 font-bold mb-1">
              Tus adversarios principales
            </div>
            <h3 className="text-3xl font-black uppercase text-white tracking-tight mb-4">
              Los rivales
            </h3>

            <div className="space-y-3">
              {adversarios.map((a, i) => (
                <div
                  key={i}
                  className="bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base font-extrabold text-white/85">{a.nombre}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">
                      {a.partido}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {PLATAFORMAS.map((p) => {
                      const Icon = p.icon;
                      return (
                        <div
                          key={p.key}
                          className="flex items-center gap-1.5 text-xs text-white/50"
                        >
                          <Icon className="size-3.5" strokeWidth={2} />
                          <span className="italic">[—]</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 flex items-start gap-3 bg-amber-400/5 border-l-4 border-amber-400 px-5 py-4"
        >
          <AlertCircle className="size-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-white/85 leading-relaxed">
            Los handles, URLs y datos de adversarios los completa el consultor en su PC con la
            herramienta Goberna Decks. Una vez completos, este slide se autorefresca con métricas
            reales (followers, engagement, frecuencia).
          </p>
        </motion.div>
      </div>
    </SlideShell>
  );
}
