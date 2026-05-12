"use client";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { AnalisisElectoral } from "../AnalisisElectoral";
import { EditableText } from "../EditableText";
import { EditableT } from "../EditableT";
import { useEditing } from "../EditingContext";
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

  const ae = ctx.consultor_form?.analisis_electoral;
  const comentario = ae?.comentario_consultor;
  const ranking = ae?.ranking_partido_zona;
  const { editing } = useEditing();

  return (
    <SlideShell
      slideId="analisis"
      kicker="02 · Resultados últimas elecciones"
      title={`Mapa de ganadores por ${subAmbitoLabel}`}
    >
      <AnalisisElectoral
        jurisdiccion={ctx.jurisdiccion}
        ambito={ctx.cargo.ambito}
      />
      {(comentario || typeof ranking === "number" || editing) && (
        <div className="mt-6 bg-gradient-to-r from-amber-400/10 via-amber-400/5 to-transparent border-l-4 border-amber-400 px-5 py-4 rounded-sm">
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400 font-bold mb-1">
            <EditableT k="analisis.lectura.kicker">Lectura del consultor</EditableT>
          </div>
          <div className="text-base text-white/90 font-bold">
            <EditableT k="analisis.lectura.prefix">Tu partido quedó #</EditableT>
            <EditableText
              section="analisis_electoral"
              field="ranking_partido_zona"
              value={ranking}
              numeric
              placeholder="—"
            />{" "}
            <EditableT k="analisis.lectura.suffix">en la zona.</EditableT>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed mt-1">
            <EditableText
              section="analisis_electoral"
              field="comentario_consultor"
              value={comentario}
              placeholder="[Lectura del consultor — qué leemos de los resultados]"
              multiline
            />
          </p>
        </div>
      )}
    </SlideShell>
  );
}
