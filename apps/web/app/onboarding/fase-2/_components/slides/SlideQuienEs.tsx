"use client";

import { motion } from "motion/react";
import { Construction, Globe, Search, MessageSquare, Newspaper } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { SlideShell } from "./SlideShell";

interface SlideQuienEsProps {
  ctx: CandidatoContext;
}

export function SlideQuienEs({ ctx }: SlideQuienEsProps) {
  const firstName = ctx.user.full_name.split(/\s+/)[0] ?? ctx.user.full_name;

  return (
    <SlideShell
      kicker="05 · Diagnóstico de imagen pública"
      title={`Cómo te ven en ${jurisdiccionLabelOrFallback(ctx)}`}
    >
      <div className="space-y-6">
        <p className="text-base sm:text-lg text-gray-300 max-w-3xl">
          Auditamos tu posicionamiento digital — Google, redes sociales, prensa
          local — para entender qué lee de vos un votante que recién te conoce.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <DiagnosticoCard
            icon={<Search className="size-5" />}
            label="Posicionamiento Google"
            estado="Por auditar"
            metric="—"
          />
          <DiagnosticoCard
            icon={<Globe className="size-5" />}
            label="Página web oficial"
            estado="Por confirmar"
            metric="—"
          />
          <DiagnosticoCard
            icon={<MessageSquare className="size-5" />}
            label="Redes sociales activas"
            estado="Por confirmar"
            metric="—"
          />
          <DiagnosticoCard
            icon={<Newspaper className="size-5" />}
            label="Menciones en prensa"
            estado="Por auditar"
            metric="—"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent p-5 sm:p-6 mt-6"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 size-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Construction className="size-5" />
            </div>
            <div>
              <p className="text-amber-400 font-semibold mb-1">
                Próximamente: Auditoría digital automática
              </p>
              <p className="text-sm text-gray-300 leading-relaxed">
                Vamos a buscar &ldquo;{firstName}&rdquo; en Google, mapear tus
                perfiles públicos y detectar narrativas activas (positivas o
                negativas). El resultado va a ser un dossier visual aquí mismo.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </SlideShell>
  );
}

interface DiagnosticoCardProps {
  icon: React.ReactNode;
  label: string;
  estado: string;
  metric: string;
}

function jurisdiccionLabelOrFallback(ctx: CandidatoContext): string {
  return (
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre
  );
}

function DiagnosticoCard({ icon, label, estado, metric }: DiagnosticoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-2xl border border-gray-700/60 bg-black/40 backdrop-blur-sm p-4 hover:border-amber-500/30 transition-colors"
    >
      <div className="size-9 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1">{label}</p>
      <p className="text-2xl text-white font-bold">{metric}</p>
      <p className="text-xs text-gray-500 mt-0.5">{estado}</p>
    </motion.div>
  );
}
