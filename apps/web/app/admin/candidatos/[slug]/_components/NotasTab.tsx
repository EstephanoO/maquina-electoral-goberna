"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import { addNota, type Nota } from "@/lib/onboarding-fase1-api";

interface Props {
  slug: string;
  notas: Nota[];
  onChange: () => Promise<void>;
}

export function NotasTab({ slug, notas, onChange }: Props) {
  const [texto, setTexto] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await addNota(slug, texto.trim());
      setTexto("");
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={8000}
          placeholder="Anotación interna del consultor…"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f4a]/20 focus:border-[#0a1f4a] transition"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{texto.length}/8000</span>
          <button
            type="submit"
            disabled={!texto.trim() || submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0a1f4a] text-white px-4 py-1.5 text-sm font-medium hover:bg-[#06122e] disabled:opacity-50 transition"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Agregar nota
          </button>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </form>

      <div className="space-y-3 pt-4 border-t border-slate-100">
        {notas.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Sin notas todavía.</p>
        ) : (
          notas.map((n) => (
            <div key={n.id} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.texto}</p>
              <div className="mt-2 text-xs text-slate-400">
                {new Date(n.creado_en).toLocaleString("es-PE")}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
