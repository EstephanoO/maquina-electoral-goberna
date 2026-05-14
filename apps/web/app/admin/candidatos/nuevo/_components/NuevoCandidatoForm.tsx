"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { createCandidato } from "@/lib/onboarding-fase1-api";

export function NuevoCandidatoForm() {
  const router = useRouter();
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [genero, setGenero] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await createCandidato({
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        dni: dni.trim() || undefined,
        telefono: telefono.trim() || undefined,
        email: email.trim() || undefined,
        genero: genero || undefined,
      });
      router.push(`/admin/candidatos/${created.slug}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("DNI_CONFLICT") || msg.toLowerCase().includes("dni")) {
        setError("Ya existe un candidato con ese DNI.");
      } else {
        setError(msg);
      }
      setSubmitting(false);
    }
  }

  const canSubmit = nombres.trim().length >= 1 && apellidos.trim().length >= 1 && !submitting;

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombres *" htmlFor="nombres">
          <input
            id="nombres" type="text" required maxLength={120}
            value={nombres} onChange={(e) => setNombres(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Apellidos *" htmlFor="apellidos">
          <input
            id="apellidos" type="text" required maxLength={120}
            value={apellidos} onChange={(e) => setApellidos(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="DNI" htmlFor="dni" hint="Opcional al crear lead — requerido al calificar">
          <input
            id="dni" type="text" inputMode="numeric" maxLength={12}
            value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))}
            className={inputCls}
          />
        </Field>
        <Field label="Teléfono" htmlFor="telefono">
          <input
            id="telefono" type="tel" maxLength={40}
            value={telefono} onChange={(e) => setTelefono(e.target.value)}
            className={inputCls}
            placeholder="+51 999 123 456"
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <input
            id="email" type="email" maxLength={160}
            value={email} onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Género" htmlFor="genero">
          <select
            id="genero" value={genero} onChange={(e) => setGenero(e.target.value)}
            className={inputCls}
          >
            <option value="">—</option>
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
            <option value="otro">Otro</option>
          </select>
        </Field>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => router.push("/admin/candidatos")}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0a1f4a] text-white px-5 py-2 text-sm font-medium hover:bg-[#06122e] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Crear candidato
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f4a]/20 focus:border-[#0a1f4a] transition";

function Field({
  label, htmlFor, hint, children,
}: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
