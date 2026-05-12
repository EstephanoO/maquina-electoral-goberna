"use client";

import type { CandidatoContext } from "@/lib/onboarding-api";
import { getPartidosImportantesMock } from "@/lib/mocks/electoral-mock";

import { EditableText } from "../EditableText";
import { useEditing } from "../EditingContext";
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

  const partidosForm = ctx.consultor_form?.partidos?.top_partidos ?? [];
  const observaciones = ctx.consultor_form?.partidos?.observaciones;
  const { editing } = useEditing();

  // Si el consultor llenó top_partidos del form, ese reemplaza al mock.
  // Mapeamos al shape esperado por PartidosZona (votos absolutos no disponibles
  // en el form → mostramos solo porcentaje + nombre).
  const partidos =
    partidosForm.length > 0
      ? partidosForm.map((p) => ({
          partido: p.nombre,
          siglas: p.codigo,
          votos: 0,
          porcentaje: p.porcentaje ?? 0,
          color: "#fbbf24",
        }))
      : getPartidosImportantesMock(jurisdiccionLabel);

  return (
    <SlideShell
      slideId="partidos"
      kicker="03 · Top 3 fuerzas políticas"
      title={`Los partidos con más votos en ${jurisdiccionLabel}`}
    >
      <p className="text-sm sm:text-base text-gray-400 mb-6 max-w-3xl">
        Quiénes definen la agenda electoral en tu zona. Conocerlos es clave para diseñar tu narrativa diferencial.
      </p>
      <PartidosZona partidos={partidos} />
      {(observaciones || editing) && (
        <div className="mt-6 bg-gradient-to-r from-amber-400/10 via-amber-400/5 to-transparent border-l-4 border-amber-400 px-5 py-4 rounded-sm">
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400 font-bold mb-1">
            Observaciones del consultor
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">
            <EditableText
              section="partidos"
              field="observaciones"
              value={observaciones}
              placeholder="[Análisis de quién domina la zona, alianzas posibles, debilidades del top]"
              multiline
            />
          </p>
        </div>
      )}
    </SlideShell>
  );
}
