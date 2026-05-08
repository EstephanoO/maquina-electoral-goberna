"use client";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { AnalisisElectoral } from "../AnalisisElectoral";
import { SlideShell } from "./SlideShell";

interface SlideAnalisisElectoralProps {
  ctx: CandidatoContext;
}

export function SlideAnalisisElectoral({ ctx }: SlideAnalisisElectoralProps) {
  const subAmbitoLabel =
    ctx.cargo.ambito === "pais"
      ? "región"
      : ctx.cargo.ambito === "departamento"
        ? "provincia"
        : "distrito";

  return (
    <SlideShell
      kicker="02 · Resultados últimas elecciones"
      title={`Mapa de ganadores por ${subAmbitoLabel}`}
    >
      <AnalisisElectoral
        jurisdiccion={ctx.jurisdiccion}
        ambito={ctx.cargo.ambito}
      />
    </SlideShell>
  );
}
