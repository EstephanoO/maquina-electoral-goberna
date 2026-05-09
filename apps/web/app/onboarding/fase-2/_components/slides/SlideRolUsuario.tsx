"use client";

import { motion } from "motion/react";
import { ShieldCheck, UserCog, Map, User } from "lucide-react";
import { SlideShell } from "./SlideShell";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
  /** Rol del usuario que está rellenando este onboarding. Default: el rol del user logged-in. */
  fillerRole?: "admin" | "consultor" | "cartografo" | "candidato";
}

const ROLES = [
  {
    key: "consultor" as const,
    icon: UserCog,
    titulo: "Consultor político",
    descripcion: "Arma estrategia, lee el contexto, define la fórmula.",
  },
  {
    key: "cartografo" as const,
    icon: Map,
    titulo: "Cartógrafo",
    descripcion: "Levanta data territorial, valida padrón, mapea zonas.",
  },
  {
    key: "candidato" as const,
    icon: User,
    titulo: "Candidato",
    descripcion: "Rellena su propia ficha, valida su biografía.",
  },
  {
    key: "admin" as const,
    icon: ShieldCheck,
    titulo: "Admin Goberna",
    descripcion: "Crea cuentas, asigna consultores, supervisa todo.",
  },
];

export function SlideRolUsuario({ ctx, fillerRole = "consultor" }: Props) {
  return (
    <SlideShell kicker="Lámina 2 · Quién está armando esto" title="ROL DE USUARIO">
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed"
        >
          Toda campaña Goberna tiene un equipo. Esta ficha la está rellenando un{" "}
          <span className="text-amber-400 font-bold">{ROLES.find((r) => r.key === fillerRole)?.titulo}</span>
          {" "}para {ctx.user.full_name.split(/\s+/)[0]}.
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {ROLES.map((r, i) => {
            const Icon = r.icon;
            const active = r.key === fillerRole;
            return (
              <motion.div
                key={r.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className={
                  active
                    ? "relative bg-amber-400/10 border-2 border-amber-400 rounded-md p-5 sm:p-6 shadow-lg shadow-amber-400/10"
                    : "relative bg-white/[0.03] border border-white/10 rounded-md p-5 sm:p-6 opacity-60"
                }
              >
                {active && (
                  <span className="absolute -top-2 left-5 bg-amber-400 text-[#0a1e4a] text-[10px] font-black uppercase tracking-[0.25em] px-2 py-0.5 rounded-sm">
                    Tú
                  </span>
                )}
                <div className="flex items-start gap-4">
                  <div
                    className={
                      active
                        ? "size-12 rounded-full bg-amber-400 text-[#0a1e4a] flex items-center justify-center shadow-lg"
                        : "size-12 rounded-full bg-white/10 text-white/60 flex items-center justify-center"
                    }
                  >
                    <Icon className="size-6" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1">
                    <h3
                      className={
                        active
                          ? "text-xl font-black uppercase tracking-tight text-white"
                          : "text-xl font-bold uppercase tracking-tight text-white/70"
                      }
                    >
                      {r.titulo}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed mt-1">{r.descripcion}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </SlideShell>
  );
}
