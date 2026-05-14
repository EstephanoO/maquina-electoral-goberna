"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { ESTADO_COLOR, ESTADO_LABEL, type EstadoPipeline } from "@/lib/onboarding-fase1-api";

const ALLOWED: Record<EstadoPipeline, EstadoPipeline[]> = {
  lead:       ["calificado", "rechazado", "pausado"],
  calificado: ["en_pitch", "rechazado", "pausado", "lead"],
  en_pitch:   ["aprobado", "rechazado", "pausado", "calificado"],
  aprobado:   [],
  rechazado:  ["lead"],
  pausado:    ["lead", "calificado", "en_pitch"],
};

interface Props {
  slug: string;
  estado: EstadoPipeline;
  onChange: (nuevo: EstadoPipeline, motivo?: string) => Promise<void>;
}

export function TransicionPanel({ estado, onChange }: Props) {
  const [submitting, setSubmitting] = useState<EstadoPipeline | null>(null);
  const [confirming, setConfirming] = useState<EstadoPipeline | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const allowed = ALLOWED[estado];

  async function execute(target: EstadoPipeline) {
    setSubmitting(target);
    setError(null);
    try {
      const needsMotivo = target === "rechazado" || target === "pausado";
      await onChange(target, needsMotivo ? motivo : undefined);
      setConfirming(null);
      setMotivo("");
    } catch (e) {
      setError((e as Error).message);
    }
    setSubmitting(null);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-3">
        Cambiar estado
      </div>

      {allowed.length === 0 ? (
        <p className="text-xs text-slate-500">
          Estado <strong>{ESTADO_LABEL[estado]}</strong> es terminal por ahora.
        </p>
      ) : (
        <div className="space-y-2">
          {allowed.map((t) => {
            const color = ESTADO_COLOR[t];
            const isConfirming = confirming === t;
            const needsMotivo = t === "rechazado" || t === "pausado";
            return (
              <div key={t}>
                {!isConfirming ? (
                  <button
                    onClick={() => {
                      if (needsMotivo) setConfirming(t);
                      else execute(t);
                    }}
                    disabled={submitting !== null}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium ring-1 ${color.bg} ${color.text} ${color.ring} hover:opacity-90 transition disabled:opacity-40`}
                  >
                    <span className="flex items-center gap-2">
                      {submitting === t && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      → {ESTADO_LABEL[t]}
                    </span>
                  </button>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="text-xs font-medium text-slate-700">
                      Motivo para marcar como <strong>{ESTADO_LABEL[t]}</strong>:
                    </div>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Explicá por qué…"
                      className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0a1f4a]/20"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setConfirming(null); setMotivo(""); }}
                        className="text-xs px-2 py-1 text-slate-500 hover:text-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => execute(t)}
                        disabled={!motivo.trim() || submitting !== null}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-[#0a1f4a] text-white disabled:opacity-40"
                      >
                        {submitting === t && <Loader2 className="w-3 h-3 animate-spin" />}
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-3 text-xs text-rose-600">{error}</div>
      )}
    </div>
  );
}
