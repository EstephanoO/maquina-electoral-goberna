"use client";

import { Activity } from "lucide-react";

import type { Evento } from "@/lib/onboarding-fase1-api";

const TIPO_LABEL: Record<string, string> = {
  creado: "Lead creado",
  campo_actualizado: "Campos actualizados",
  postulacion_actualizada: "Postulación actualizada",
  formula_actualizada: "Fórmula actualizada",
  deck_publicado: "Deck publicado",
  transicion_calificado: "→ Calificado",
  transicion_en_pitch: "→ En pitch",
  transicion_aprobado: "→ Aprobado",
  transicion_rechazado: "→ Rechazado",
  transicion_pausado: "→ Pausado",
  transicion_lead: "→ Lead",
  migrado_desde_appdb: "Migrado desde appdb",
};

const TIPO_COLOR: Record<string, string> = {
  creado: "text-blue-600 bg-blue-50",
  transicion_aprobado: "text-emerald-700 bg-emerald-50",
  transicion_rechazado: "text-rose-700 bg-rose-50",
  transicion_pausado: "text-zinc-700 bg-zinc-100",
  deck_publicado: "text-amber-700 bg-amber-50",
  migrado_desde_appdb: "text-purple-700 bg-purple-50",
};

interface Props {
  eventos: Evento[];
}

export function EventosTimeline({ eventos }: Props) {
  if (eventos.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-4">Sin eventos.</p>;
  }
  return (
    <ol className="relative border-l-2 border-slate-100 ml-3 space-y-4">
      {eventos.map((e) => {
        const label = TIPO_LABEL[e.tipo] ?? e.tipo;
        const color = TIPO_COLOR[e.tipo] ?? "text-slate-600 bg-slate-50";
        return (
          <li key={e.id} className="ml-4 pl-4 relative">
            <span className={`absolute -left-[26px] grid place-items-center w-6 h-6 rounded-full ${color} ring-2 ring-white`}>
              <Activity className="w-3 h-3" />
            </span>
            <div className="text-sm font-medium text-slate-800">{label}</div>
            <div className="text-xs text-slate-400">
              {new Date(e.ocurrido_en).toLocaleString("es-PE")}
            </div>
            {e.payload !== null && e.payload !== undefined && Object.keys(e.payload as object).length > 0 && (
              <details className="mt-1 text-[10px] text-slate-400">
                <summary className="cursor-pointer hover:text-slate-600">payload</summary>
                <pre className="mt-1 px-2 py-1 bg-slate-50 rounded text-[10px] overflow-auto max-h-40">
                  {JSON.stringify(e.payload, null, 2)}
                </pre>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
