"use client";

import type { CandidatoContext } from "@/lib/onboarding-api";
import { getPartidosImportantesMock } from "@/lib/mocks/electoral-mock";

import { PartidosZona } from "../PartidosZona";
import { SlideShell } from "./SlideShell";

interface SlidePartidosImportantesProps {
  ctx: CandidatoContext;
}

export function SlidePartidosImportantes({ ctx }: SlidePartidosImportantesProps) {
  const jurisdiccionLabel =
    ctx.jurisdiccion.distrito?.nombre ??
    ctx.jurisdiccion.provincia?.nombre ??
    ctx.jurisdiccion.departamento?.nombre ??
    ctx.jurisdiccion.pais.nombre;

  const partidos = getPartidosImportantesMock(jurisdiccionLabel);

  return (
    <SlideShell
      kicker="03 · Top 3 fuerzas políticas"
      title={`Los partidos con más votos en ${jurisdiccionLabel}`}
    >
      <p className="text-sm sm:text-base text-gray-400 mb-6 max-w-3xl">
        Quiénes definen la agenda electoral en tu zona. Conocerlos es clave para diseñar tu narrativa diferencial.
      </p>
      <PartidosZona partidos={partidos} />
    </SlideShell>
  );
}
