"use client";

import { motion } from "motion/react";
import { Facebook, Instagram, Music2, Globe, AlertCircle } from "lucide-react";
import { SlideShell } from "./SlideShell";
import { EditableT } from "../EditableT";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

const PLATAFORMAS = [
  { key: "facebook", icon: Facebook, label: "Facebook" },
  { key: "instagram", icon: Instagram, label: "Instagram" },
  { key: "tiktok", icon: Music2, label: "TikTok" },
] as const;

type PlatKey = (typeof PLATAFORMAS)[number]["key"];

function shortHandle(url: string | undefined): string {
  if (!url) return "@[handle a completar]";
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    return path ? `@${path.split("/")[0]}` : u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SlideRedesSociales({ ctx }: Props) {
  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? "candidato";
  const rs = ctx.consultor_form?.redes_sociales;
  const candHandles = rs?.candidato ?? {};
  const adversariosForm = rs?.adversarios ?? [];

  const adversarios =
    adversariosForm.length > 0
      ? adversariosForm.slice(0, 3).map((a) => ({
          nombre: a.nombre,
          partido: a.partido ?? "[Partido]",
          redes: a.redes ?? {},
          placeholder: false,
        }))
      : [
          { nombre: "[Adversario 1]", partido: "[Partido]", redes: {}, placeholder: true },
          { nombre: "[Adversario 2]", partido: "[Partido]", redes: {}, placeholder: true },
          { nombre: "[Adversario 3]", partido: "[Partido]", redes: {}, placeholder: true },
        ];

  return (
    <SlideShell slideId="redes-sociales" kicker="Presencia digital · Redes" title="REDES SOCIALES — TÚ Y LOS ADVERSARIOS">
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed"
        >
          <EditableT k="redes-sociales.intro" multiline>
            Auditamos tus redes y las de tus 3 principales adversarios. El que está mejor posicionado en redes hoy ya lleva una ventaja de meses.
          </EditableT>
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
              <EditableT k="redes-sociales.tus.kicker">Tus redes</EditableT>
            </div>
            <h3 className="text-3xl font-black uppercase text-white tracking-tight mb-4">
              {firstName}
            </h3>

            <div className="space-y-3">
              {PLATAFORMAS.map((p) => {
                const Icon = p.icon;
                const url = candHandles[p.key as PlatKey];
                const filled = typeof url === "string" && url.length > 0;
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
                      <div
                        className={
                          filled
                            ? "text-white text-sm truncate font-medium"
                            : "text-amber-400/70 italic text-sm truncate"
                        }
                      >
                        {shortHandle(url)}
                      </div>
                    </div>
                    {filled ? (
                      <span className="text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-sm bg-emerald-400/20 text-emerald-300">
                        Verificado
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-sm bg-amber-400/20 text-amber-300">
                        Por validar
                      </span>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3">
                <Globe className="size-5 text-amber-400 shrink-0" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold">
                    Página web oficial
                  </div>
                  <div
                    className={
                      candHandles.web_oficial
                        ? "text-white text-sm truncate font-medium"
                        : "text-amber-400/70 italic text-sm truncate"
                    }
                  >
                    {candHandles.web_oficial ?? "[A completar]"}
                  </div>
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
              <EditableT k="redes-sociales.adversarios.kicker">Tus adversarios principales</EditableT>
            </div>
            <h3 className="text-3xl font-black uppercase text-white tracking-tight mb-4">
              <EditableT k="redes-sociales.adversarios.titulo">Los rivales</EditableT>
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
                      const url = (a.redes as Record<string, string | undefined>)?.[p.key];
                      const filled = typeof url === "string" && url.length > 0;
                      return (
                        <div
                          key={p.key}
                          className={
                            filled
                              ? "flex items-center gap-1.5 text-xs text-white/80"
                              : "flex items-center gap-1.5 text-xs text-white/50"
                          }
                        >
                          <Icon className="size-3.5" strokeWidth={2} />
                          <span className={filled ? "" : "italic"}>
                            {filled ? shortHandle(url) : "[—]"}
                          </span>
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
