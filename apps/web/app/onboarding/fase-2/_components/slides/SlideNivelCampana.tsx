"use client";

import { motion } from "motion/react";
import { Globe, Map, Building, Home } from "lucide-react";
import { SlideShell } from "./SlideShell";
import { EditableT } from "../EditableT";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

const NIVELES = [
  {
    key: "pais" as const,
    icon: Globe,
    titulo: "Nacional",
    subtitulo: "Presidente · Vicepresidente · Congresista nacional",
  },
  {
    key: "departamento" as const,
    icon: Map,
    titulo: "Regional",
    subtitulo: "Gobernador · Consejero · Congresista regional",
  },
  {
    key: "provincia" as const,
    icon: Building,
    titulo: "Provincial",
    subtitulo: "Alcalde provincial · Regidor provincial",
  },
  {
    key: "distrito" as const,
    icon: Home,
    titulo: "Distrital",
    subtitulo: "Alcalde distrital · Regidor distrital",
  },
];

export function SlideNivelCampana({ ctx }: Props) {
  const ambito = ctx.cargo.ambito;
  const jurisdiccion =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre;

  return (
    <SlideShell slideId="nivel-campana" kicker="Lámina 3 · A qué apuntas" title="NIVEL DE CAMPAÑA">
      <div className="px-2 sm:px-4">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-base sm:text-lg text-gray-300 max-w-3xl mb-8 leading-relaxed"
        >
          <EditableT k="nivel-campana.intro" multiline>
            Cada nivel tiene su propia mecánica electoral, su propio padrón, su propia competencia. Tu campaña apunta a:
          </EditableT>
        </motion.p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {NIVELES.map((n, i) => {
            const Icon = n.icon;
            const active = n.key === ambito;
            return (
              <motion.div
                key={n.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className={
                  active
                    ? "bg-amber-400 text-[#0a1e4a] rounded-md p-5 shadow-2xl shadow-amber-400/30 border-2 border-amber-300"
                    : "bg-white/[0.03] border border-white/10 rounded-md p-5 opacity-50"
                }
              >
                <Icon
                  className={active ? "size-8 text-[#0a1e4a]" : "size-8 text-white/60"}
                  strokeWidth={2.2}
                />
                <h3
                  className={
                    active
                      ? "mt-3 text-2xl font-black uppercase tracking-tight"
                      : "mt-3 text-2xl font-bold uppercase tracking-tight text-white/70"
                  }
                >
                  <EditableT k={`nivel-campana.niveles.${n.key}.titulo`}>{n.titulo}</EditableT>
                </h3>
                <p
                  className={
                    active
                      ? "text-xs leading-snug font-semibold mt-2"
                      : "text-xs leading-snug text-white/50 mt-2"
                  }
                >
                  <EditableT k={`nivel-campana.niveles.${n.key}.subtitulo`}>{n.subtitulo}</EditableT>
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Detalle del nivel activo */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 bg-gradient-to-r from-amber-400/15 via-amber-400/5 to-transparent border-l-4 border-amber-400 px-5 py-4 rounded-sm"
        >
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400 font-bold mb-1">
            <EditableT k="nivel-campana.detalle.kicker">Tu cargo</EditableT>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            {ctx.cargo.nombre}
          </div>
          <div className="text-base text-amber-400/90 font-bold mt-1">
            en {jurisdiccion}
          </div>
        </motion.div>
      </div>
    </SlideShell>
  );
}
