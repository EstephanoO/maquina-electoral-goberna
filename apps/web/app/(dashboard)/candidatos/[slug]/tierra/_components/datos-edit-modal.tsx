"use client";

import { useState } from "react";
import type { FormRecord } from "@/lib/services";

type Props = {
  form: FormRecord;
  onSave: (updates: Record<string, string>) => Promise<boolean>;
  onClose: () => void;
};

const FIELDS = [
  { key: "nombre", label: "Nombre", type: "text" },
  { key: "telefono", label: "Telefono", type: "text" },
  { key: "zona", label: "Zona", type: "text" },
  { key: "comentarios", label: "Comentarios", type: "textarea" },
] as const;

export function DatosEditModal({ form, onSave, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({
    nombre: form.nombre ?? "",
    telefono: form.telefono ?? "",
    zona: form.zona ?? "",
    comentarios: form.comentarios ?? "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSave(values);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()} role="dialog" aria-modal="true" tabIndex={-1}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md mx-4 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-[15px] font-bold text-slate-900 m-0">Editar registro</h3>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 border-none cursor-pointer flex items-center justify-center hover:bg-slate-200 text-sm">x</button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          {FIELDS.map(({ key, label, type }) => (
            <label key={key} htmlFor={`edit-${key}`} className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
              {type === "textarea" ? (
                <textarea
                  id={`edit-${key}`}
                  value={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  rows={3}
                  className="px-3 py-2 text-[13px] text-slate-800 border border-slate-200 rounded-lg bg-slate-50 outline-none resize-y focus:border-slate-400 transition-colors"
                />
              ) : (
                <input
                  id={`edit-${key}`}
                  type="text"
                  value={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  className="px-3 py-2 text-[13px] text-slate-800 border border-slate-200 rounded-lg bg-slate-50 outline-none focus:border-slate-400 transition-colors"
                />
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-[13px] font-bold text-white bg-[#090D15] border-none rounded-lg cursor-pointer hover:bg-[#090D15] disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
