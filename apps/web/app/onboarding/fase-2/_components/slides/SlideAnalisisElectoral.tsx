"use client";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { AnalisisElectoral } from "../AnalisisElectoral";
import { SlideShell } from "./SlideShell";

interface SlideAnalisisElectoralProps {
  ctx: CandidatoContext;
}

export function SlideAnalisisElectoral({ ctx }: SlideAnalisisElectoralProps) {
  const partidoNombre = ctx.organizacion_politica?.nombre ?? "Tu candidatura";
  const jurisdiccionLabel =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre;

  return (
    <SlideShell
      title={`¿Cómo le fue a ${partidoNombre} en ${jurisdiccionLabel}?`}
    >
      <div className="pt-2">
        <AnalisisElectoral
          jurisdiccion={ctx.jurisdiccion}
          ambito={ctx.cargo.ambito}
        />
      </div>
    </SlideShell>
  );
}
