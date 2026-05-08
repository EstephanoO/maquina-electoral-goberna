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
    <SlideShell title={`Quiénes mandan en ${jurisdiccionLabel}`}>
      <div className="pt-2">
        <p className="text-sm text-gray-400 mb-5">
          Los 3 partidos con más votos en las últimas elecciones de tu zona.
        </p>
        <PartidosZona partidos={partidos} />
      </div>
    </SlideShell>
  );
}
